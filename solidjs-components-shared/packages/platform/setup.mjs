// One-command setup of an app's demo database, shared by every app repo's setup-db.mjs:
//
//   1. pnpm install (solidjs-components-shared, then the app)
//   2. check fieldtec-web, MongoDB, Elasticsearch and Redis; stop if the database already has data
//   3. build shared's and the app's bundles
//   4. copy them into fieldtec-web
//   5. write fieldtec-web's server config for the demo (own port and Redis database)
//   6. create the database and index, then flush the demo's Redis database
//
// The app's setup-db.mjs imports this file by relative path, before anything is installed, so only
// Node built-ins are imported statically; everything else loads after step 1.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const platformDir = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(platformDir, '../..');
const cli = path.join(sharedRoot, 'packages/tools/cli.mjs');

const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const ok = (message) => console.log(`   \x1b[32m✓\x1b[0m ${message}`);
const warn = (message) => console.log(`   \x1b[33m!\x1b[0m ${message}`);
function fail(message) {
  console.error(`\n\x1b[31mSetup stopped:\x1b[0m ${message}`);
  process.exit(1);
}

/**
 * @typedef {object} AppSetup
 * @property {string} appRoot - The app repo
 * @property {string} title - e.g. "Fleet demo"
 * @property {string} db - Default database and index name
 * @property {string} config - fieldtec-web config name (server/config/<config>.json)
 * @property {number} port - fieldtec-web port for this demo
 * @property {number} redisDb - Redis database for this demo's caches and sessions
 * @property {string} buildModule - Module (relative to appRoot) exporting `buildDemo({ now, urlRoot })`
 *   → `{ documents, people: { name, email, title?, role? }[], urls: Record<string, string>, password }`
 */

/**
 * Runs the setup with the command-line options (`--reset`, `--db <name>`, `--help`).
 * @param {AppSetup} app
 */
export async function runSetup(app) {
  const usage = `Usage: pnpm db:setup [--reset] [--db <name>]

  (no options)   create the database and Elasticsearch index "${app.db}"
  --reset        replace them if they already exist (drops the database first)
  --db <name>    use another name for the database and index

fieldtec-web and solidjs-components-shared must be checked out next to this repo. MongoDB,
Elasticsearch and Redis are the ones in fieldtec-web's server/config/development.json.`;

  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  let reset = false;
  let db = app.db;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reset') reset = true;
    else if (args[i] === '--db') db = args[++i];
    else fail(`Unknown option "${args[i]}".\n\n${usage}`);
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(db ?? '')) {
    fail('--db needs a name of lowercase letters, digits, "-" and "_" (it also names the Elasticsearch index).');
  }

  let stepNumber = 0;
  const step = (title) => console.log(`\n${bold(`${++stepNumber}. ${title}`)}`);
  const run = (command, commandArgs, cwd) => {
    const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit' });
    if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
    if (result.status !== 0) fail(`"${[command, ...commandArgs].join(' ')}" failed in ${cwd}.`);
  };

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 22) fail(`Node.js 22 or newer is needed (this is ${process.versions.node}).`);
  if (!existsSync(path.join(sharedRoot, 'package.json'))) fail(`solidjs-components-shared not found at ${sharedRoot}.`);

  step('Install dependencies');
  run('pnpm', ['install', '--frozen-lockfile'], sharedRoot);
  run('pnpm', ['install', '--frozen-lockfile'], app.appRoot);

  step('Check fieldtec-web, MongoDB, Elasticsearch and Redis');
  const services = await import('./services.mjs');
  const fieldtec = await import('./fieldtec.mjs');
  let devConfig;
  try {
    devConfig = fieldtec.developmentConfig();
  } catch (error) {
    fail(error.message);
  }
  const urls = services.serviceUrls(devConfig);
  const { fieldtecRoot } = await import('@solidjs-components/tools/repo');
  if (fieldtec.serverBuilt()) ok(`fieldtec-web at ${fieldtecRoot}`);
  else warn(`fieldtec-web at ${fieldtecRoot}, but its server isn't built yet (see the last step)`);

  if (services.PROTECTED_DATABASES.includes(db)) fail(`"${db}" is an existing application database. Pick another --db.`);
  const startStack = 'Start the local stack first, for example ~/dev/core-setup-docker/mongo-elastic-setup/init.sh.';
  let mongo;
  try {
    mongo = await services.mongoStatus(urls.mongo, db);
  } catch (error) {
    fail(`MongoDB at ${urls.mongo} isn't answering (${services.describeError(error)}). ${startStack}`);
  }
  ok(`MongoDB ${mongo.version}${mongo.replicaSet ? `, replica set ${mongo.replicaSet}` : ''} at ${urls.mongo}`);
  if (!mongo.replicaSet) warn('MongoDB is not a replica set. fieldtec-web expects one.');
  if (mongo.documents && !reset) fail(`Database "${db}" already has ${mongo.documents} documents. Run again with --reset to replace it.`);
  try {
    ok(`Elasticsearch ${await services.elasticsearchVersion(urls.es)} at ${urls.es}`);
  } catch (error) {
    fail(`Elasticsearch at ${urls.es} isn't answering (${services.describeError(error)}). ${startStack}`);
  }
  try {
    await services.redisCommands(urls.redis, [['PING']]);
    ok(`Redis at ${urls.redis} (this demo uses database ${app.redisDb})`);
  } catch (error) {
    fail(`Redis at ${urls.redis} isn't answering (${services.describeError(error)}). ${startStack}`);
  }

  step('Build the components (solidjs-components-shared, then this repo)');
  run(process.execPath, [cli, 'build', '--with-shared'], app.appRoot);

  step('Copy the bundles into fieldtec-web');
  // Component documents reference each bundle by content hash, so the database and the deployed
  // files must come from the same build.
  run(process.execPath, [cli, 'deploy'], app.appRoot);

  step(`Write fieldtec-web's server config (server/config/${app.config}.json)`);
  const configFile = fieldtec.writeServerConfig({ name: app.config, db, port: app.port, redisDb: app.redisDb });
  ok(`${configFile}: database and index "${db}", port ${app.port}, Redis database ${app.redisDb}`);

  step(mongo.documents ? `Replace database and index "${db}"` : `Create database and index "${db}"`);
  const { buildDemo } = await import(pathToFileURL(path.join(app.appRoot, app.buildModule)).href);
  const urlRoot = `http://localhost:${app.port}`;
  const demo = buildDemo({ now: new Date(), urlRoot });
  console.log(`Built ${demo.documents.length} documents.`);
  const { seedDatabase } = await import('./seed.mjs');
  try {
    // Flushing the demo's Redis database makes a running fieldtec-web drop the templates, rules and
    // component documents it cached from an earlier seed. It also signs everyone out of this demo.
    await seedDatabase({ documents: demo.documents, db, mongo: urls.mongo, es: urls.es, reset, redis: urls.redis, redisDb: app.redisDb });
  } catch (error) {
    fail(error.message);
  }

  console.log(`\nSign in at ${urlRoot} (password for everyone: ${demo.password}):`);
  for (const p of demo.people) console.log(`  ${p.email.padEnd(34)} ${p.name}${p.role ? ` · ${p.role}` : ''}`);
  console.log('\nStart pages:');
  for (const [name, url] of Object.entries(demo.urls)) console.log(`  ${name.padEnd(16)} ${urlRoot}${url}`);

  step('Next');
  if (!fieldtec.serverBuilt()) console.log(`   Build fieldtec-web's server:  (cd ${fieldtecRoot}/projects/server && node build.mjs)`);
  console.log(`   Start fieldtec-web on it:     pnpm demo:server   (restart it if it's already running)`);
  console.log(`   Then open ${urlRoot} and sign in. After a re-seed, reload the page once more.`);
}

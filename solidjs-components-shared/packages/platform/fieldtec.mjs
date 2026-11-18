// fieldtec-web's side of a demo: its server config for the demo database, and starting it.

import { spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldtecRoot } from '@solidjs-components/tools/repo';

const here = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.join(fieldtecRoot, 'server/config');

/** fieldtec-web's development config: the services (Mongo, Elasticsearch, Redis) every demo uses. */
export function developmentConfig() {
  const file = path.join(configDir, 'development.json');
  if (!existsSync(file)) throw new Error(`fieldtec-web not found: ${file} is missing. Check fieldtec-web out beside the solidjs-components folder, or set FIELDTEC_WEB (looked in ${fieldtecRoot}).`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Whether fieldtec-web's server has been built (server/ServerApp.js). */
export const serverBuilt = () => existsSync(path.join(fieldtecRoot, 'server/ServerApp.js'));

/**
 * Writes server/config/<name>.json (and <name>_log.json) from the development config: same
 * Mongo/Elasticsearch hosts, the demo database and index, its own port and Redis database, and
 * local email/password sign-in only (no SSO providers).
 * @param {{ name: string, db: string, port: number, redisDb: number }} o
 * @returns {string} The config file written
 */
export function writeServerConfig({ name, db, port, redisDb }) {
  const config = developmentConfig();
  for (const service of ['default', 'systemTypeComponent']) {
    if (config.dataServices?.[service]) config.dataServices[service].db = db;
  }
  if (config.dataServices?.avl) config.dataServices.avl.db = `${db}-avl`;
  config.elasticsearch = { ...config.elasticsearch, indexName: db };
  config.port = port;
  // Its own Redis database: re-seeding one demo (which flushes its Redis db) doesn't sign people
  // out of another app, and cached templates don't mix between databases with the same ids.
  if (config.redis) config.redis = { ...config.redis, databaseNumber: redisDb };
  // Demo users sign in with the passwords stored in the database.
  delete config.authenticationProviders;
  delete config.keycloakAdmin;
  if (config.scim && typeof config.scim === 'object') config.scim.enabled = false;

  const file = path.join(configDir, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(config, null, 4)}\n`);
  copyFileSync(path.join(configDir, 'development_log.json'), path.join(configDir, `${name}_log.json`));
  return file;
}

/**
 * Runs fieldtec-web's built server on a demo config, in the foreground, until it exits.
 *
 * The server is started with a preload (server-deps.cjs) that resolves its packages from the
 * versions projects/server declares: a checkout whose root node_modules holds older, unmanaged
 * copies of mongodb and express otherwise crashes on Reference No fields and 404s on /form/<id>.
 *
 * With `log`, the output also goes to that file (replaced on each start), so a test can read what
 * the server's rules said: fieldtec-web answers a refused update with a generic error.
 * @param {{ name: string, log?: string | URL }} o - Config name (server/config/<name>.json), log file
 */
export function startServer({ name, log }) {
  if (!serverBuilt()) {
    console.error(`fieldtec-web's server isn't built. Run: (cd ${fieldtecRoot}/projects/server && node build.mjs)`);
    process.exit(1);
  }
  if (!existsSync(path.join(configDir, `${name}.json`))) {
    console.error(`server/config/${name}.json doesn't exist yet. Run "pnpm db:setup" first.`);
    process.exit(1);
  }
  const child = spawn(process.execPath, ['--require', path.join(here, 'server-deps.cjs'), 'server/ServerApp.js'], {
    cwd: fieldtecRoot,
    env: { ...process.env, WEB_APP_SERVER: name },
    stdio: log ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  if (log) {
    const file = createWriteStream(log, { flags: 'w' });
    for (const [from, to] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      from.on('data', (chunk) => {
        to.write(chunk);
        file.write(chunk);
      });
    }
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 0));
}

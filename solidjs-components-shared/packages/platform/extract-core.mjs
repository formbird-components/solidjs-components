// One-off: snapshots the Formbird platform documents every demo needs into core/, so seeding
// needs nothing but these repos. Re-run only to pick up newer platform documents.
//
//   node extract-core.mjs [--mongo mongodb://localhost:27017/?directConnection=true] [--fieldtec ../../../../fieldtec-web]
//
// Sources (local dev databases):
//   fieldtec-test  system templates + their rulesets/includes (built from fieldtec-web's system/testdb,
//                  kept working against fieldtec-web main by its e2e tests)
//   internal-5     sc-* component documents (one consistent @formbird/angular-elements CDN version)
//   fieldtec-web   system/elastic/es7template.json (index settings and mappings)

import { MongoClient } from 'mongodb';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldtecRoot as defaultFieldtecRoot } from '@solidjs-components/tools/repo';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const mongoUrl = arg('mongo', 'mongodb://localhost:27017/?directConnection=true');
const fieldtecRoot = arg('fieldtec') ? path.resolve(arg('fieldtec')) : defaultFieldtecRoot;

/** Platform templates the configuration document and core flows refer to. */
export const SYSTEM_TEMPLATES = {
  account: '387406E0-DF27-4566-A075-CEA76BD02040',
  accountSecurity: '09b44c01-e2d3-8327-6cec-0e218817a3c0',
  accountControl: 'b451f9de-1e01-bed2-906b-f69f6dc626f5',
  passwordReset: 'ebe35d5d-af3b-4195-bff4-282dfbd143c9',
  errorDocument: 'dd982aac-da3e-47e7-a0b5-b3aff507ddb0',
  ruleSet: '224bc62858d73ce57a9cb85e',
  rulesetInclude: '94869c359bf4131553761097',
  templateEditor: '74746c80-8378-11e6-99b1-71ee944cf59f',
  componentEditor: '5f6000a0-0828-11e6-9b64-1b27992111e1',
};
const OVERLAY_INCLUDE_ID = 'e672b4f0-1dea-11e8-b1c4-572a744999e9';

/** Angular components the demo's own templates use (on top of what the system templates use). */
const DEMO_SC_COMPONENTS = [
  'sc-static-value', 'sc-static-html', 'sc-panel', 'sc-panel-collapse', 'sc-datatables', 'sc-text-box',
  'sc-numeric', 'sc-markdown', 'sc-note-comment', 'sc-drop-down', 'sc-check-box', 'sc-button', 'sc-date-time',
];

// Author/audit metadata from the source databases; not needed and not ours to copy.
const DROP_KEYS = ['_id', 'lastUpdatedByObj', 'firstCreatedByObj', 'logEmailee', 'logEmailHost', 'ftPackageTag', 'rssModifiedText', 'lastUpdatedDate', 'firstCreatedDate'];
const KEEP_HEADER = ['systemType', 'templateId', 'createdWith', 'summaryName', 'summaryDescription', 'excludeGeneralSearch'];

/** Replaces staff email addresses (e.g. in "obfuscated by …" descriptions and logging config). */
function scrubEmails(value) {
  if (typeof value === 'string') return value.replace(/[A-Za-z0-9._%+-]+@formbird\.com/g, 'admin@example.com');
  if (Array.isArray(value)) return value.map(scrubEmails);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubEmails(v)]));
  }
  return value;
}

function sanitize(doc) {
  doc = scrubEmails(doc);
  const out = {};
  for (const [key, value] of Object.entries(doc)) if (!DROP_KEYS.includes(key)) out[key] = value;
  const header = {};
  for (const key of KEEP_HEADER) if (doc.systemHeader?.[key] !== undefined) header[key] = doc.systemHeader[key];
  // The test database guards components with a test-only key; the demo uses no keys on platform docs.
  header.keyIds = [];
  out.systemHeader = header;
  if (Array.isArray(out.rulesetSections)) out.rulesetSections = out.rulesetSections.map(({ credit, ...rest }) => rest);
  return out;
}

const client = new MongoClient(mongoUrl);
await client.connect();
const test = client.db('fieldtec-test').collection('documents');
const internal = client.db('internal-5').collection('documents');
const current = { 'systemHeader.currentVersion': true };

const templates = [];
for (const [label, documentId] of Object.entries(SYSTEM_TEMPLATES)) {
  const doc = await test.findOne({ documentId, ...current });
  if (!doc) throw new Error(`fieldtec-test has no ${label} template (${documentId})`);
  templates.push(doc);
}

// The Account template's login/logout rulesets are test fixtures; the demo logs in without rules.
const account = templates.find((t) => t.documentId === SYSTEM_TEMPLATES.account);
for (const key of Object.keys(account)) if (/RuleRel$/.test(key)) delete account[key];
// Pickers show summaryName; keep it a plain name (the template appends " - email").
account.summaryNameRule = '{{{usersName.firstName}}} {{{usersName.surname}}}';

const rulesets = new Map();
for (const template of templates) {
  for (const key of Object.keys(template).filter((k) => /RuleRel$/.test(k))) {
    for (const ref of template[key] ?? []) {
      if (rulesets.has(ref.documentId)) continue;
      const rs = await test.findOne({ documentId: ref.documentId, ...current });
      if (rs) rulesets.set(rs.documentId, rs);
      else console.warn(`  ruleset ${ref.name} (${ref.documentId}) not found; reference removed`);
    }
  }
}

const includes = new Map();
const overlay = await test.findOne({ documentId: OVERLAY_INCLUDE_ID, ...current });
includes.set(overlay.documentId, overlay);
for (const rs of [...rulesets.values()]) {
  for (const [, name] of String(rs.ruleSetDSL ?? '').matchAll(/#include\s+"([^"]+)"/g)) {
    const inc = await test.findOne({ 'systemHeader.systemType': 'rulesetInclude', $or: [{ includeName: name }, { name }], ...current });
    if (inc) {
      includes.set(inc.documentId, inc);
    } else {
      // A ruleset whose include is missing fails to compile; leave it out (test-only rulesets).
      console.warn(`  dropping ruleset ${rs.name}: include "${name}" not found`);
      rulesets.delete(rs.documentId);
    }
  }
}

// Templates may only reference rulesets that are in the snapshot.
for (const template of templates) {
  for (const key of Object.keys(template).filter((k) => /RuleRel$/.test(k))) {
    template[key] = (template[key] ?? []).filter((ref) => rulesets.has(ref.documentId));
    if (!template[key].length) delete template[key];
  }
}

const componentNames = new Set(DEMO_SC_COMPONENTS);
for (const t of templates) for (const c of t.components ?? []) if (c.componentName) componentNames.add(c.componentName);
const components = [];
for (const name of [...componentNames].sort()) {
  const doc =
    (await internal.findOne({ 'systemHeader.systemType': 'component', name, ...current })) ??
    (await test.findOne({ 'systemHeader.systemType': 'component', name, ...current }));
  if (doc) components.push(doc);
  else console.warn(`  component ${name} not found in either database`);
}
await client.close();

const outDir = path.join(here, 'core');
mkdirSync(outDir, { recursive: true });
const write = (file, docs) => {
  writeFileSync(path.join(outDir, file), `${JSON.stringify(docs.map(sanitize), null, 2)}\n`);
  console.log(`demo/core/${file}: ${docs.length} documents`);
};
write('system-templates.json', templates);
write('rulesets.json', [...rulesets.values()]);
write('ruleset-includes.json', [...includes.values()]);
write('components.json', components);
copyFileSync(path.join(fieldtecRoot, 'system/elastic/es7template.json'), path.join(outDir, 'es-index-template.json'));
console.log('demo/core/es-index-template.json');

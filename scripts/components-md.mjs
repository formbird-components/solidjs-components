#!/usr/bin/env node
// Writes COMPONENTS.md: every Solid element in the repos (and the kit bundle), with its source, its
// built bundle, where fieldtec-web serves it from, a picture of it, and its componentDefinition
// options, read from the element's TypeScript `…Definition` interface and its doc comments.
//
//   node scripts/components-md.mjs            # the list and the options
//   node scripts/components-md.mjs --shots    # first, picture every element again (builds each repo)
//
// The pictures come from each repo's browser test page (test/browser.mjs, fixtures and mock host),
// rendered by the harness with ELEMENT_SHOTS=<dir>: one PNG and the componentDefinition per element
// on the page. PICK chooses which instance stands for a tag when the page has several.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = path.join(ROOT, 'solidjs-components-shared');
const require = createRequire(path.join(SHARED, 'packages/tools/package.json'));
const ts = require('typescript');
const { listComponents } = await import(path.join(SHARED, 'packages/tools/repo.mjs'));

const REPOS = [
  { dir: 'solidjs-components-shared', title: 'Shared', note: 'Generic elements every app uses.' },
  { dir: 'solidjs-components-internal', title: 'Issue tracker (internal)', note: '' },
  { dir: 'solidjs-components-fleet', title: 'Fleet', note: '' },
  { dir: 'solidjs-components-whs', title: 'Work health and safety', note: '' },
  { dir: 'solidjs-components-hr', title: 'HR', note: '' },
  { dir: 'solidjs-components-procurement', title: 'Procurement', note: '' },
];
const DEPLOYED = 'server/public/vendor/custom-component-modules/dist/solidjs-components';
const MEDIA = path.join(ROOT, 'docs/media/components');
const SHOTS = path.join(ROOT, '.component-shots');
/** The instance that stands for a tag, when its repo's test page has several (`<tag>--<id>`). */
const PICK = {
  'solid-budget-check': 'solid-budget-check--budget',
  'solid-line-items': 'solid-line-items--lines',
};
/** Options many elements declare, with the same meaning everywhere (used when they have no doc comment). */
const GENERIC_DOCS = {
  hideLabel: 'Hide the label.',
  currency: 'Currency of amounts (default "AUD").',
  timeZone: 'Time zone of days and "today" (default the browser\'s).',
  placeholder: 'Text shown while empty.',
  searchPlaceholder: 'Text shown in the empty search box.',
  readOnly: 'Show the value without letting it change.',
  queryOptions: '`pageSize`: how many search results load at a time.',
  noHelpDisplay: 'Show no placeholder.',
  minLength: 'Fewest characters allowed.',
  maxLength: 'Most characters allowed.',
};
/** Props every element takes, from BaseDefinition and fieldtec-web's ComponentDefinition. */
const COMMON_FROM = new Set(['BaseDefinition', 'ComponentDefinition']);
/** What fieldtec-web's ComponentDefinition props do (its types carry no doc comments). */
const COMMON_DOCS = {
  componentName: 'The element: its tag, `solid-…`.',
  name: 'The document field the element reads and writes.',
  label: 'The label above the element.',
  mandatory: 'The field must have a value to save. Rules can change it (`mandateField`).',
  enabled: '`false` shows the value without letting it change. Rules can change it (`enableField`).',
  readOnly: 'Like `enabled: false`.',
  visible: 'Read by fieldtec-web\'s form: `false` hides the element. Rules can change it (`showField`).',
  fullWidth: 'Read by fieldtec-web\'s form: the element takes the whole row.',
  disableSave: 'Read by fieldtec-web\'s form: the field is not saved. Set it on elements that only show things.',
  disableDirty: 'Read by fieldtec-web\'s form: a change doesn\'t mark the document unsaved.',
  defaultValue: 'Read by fieldtec-web\'s form: the value of a new document.',
  skipRendering: 'Read by fieldtec-web\'s form: the element isn\'t rendered.',
  type: 'Read by fieldtec-web; the Solid elements don\'t use it.',
  layout: 'Read by fieldtec-web\'s form. (Photo capture has its own `layout` option.)',
};

// ------------------------------------------------------------------------------------- pictures
if (process.argv.includes('--shots')) {
  rmSync(SHOTS, { recursive: true, force: true });
  for (const repo of REPOS) {
    const root = path.join(ROOT, repo.dir);
    if (!existsSync(path.join(root, 'test/browser.mjs'))) continue;
    console.log(`\n${repo.dir}`);
    execFileSync('pnpm', ['exec', 'solid-components', 'build', '--with-shared', '--test-assets'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    execFileSync('pnpm', ['exec', 'solid-components', 'browser-test'], { cwd: root, stdio: 'inherit', env: { ...process.env, ELEMENT_SHOTS: path.join(SHOTS, repo.dir) } });
  }
}

/** The shots of a tag across the repos' pages: `{ png, json }` of the chosen one. */
function shotOf(tag) {
  if (!existsSync(SHOTS)) return null;
  const all = readdirSync(SHOTS).flatMap((repo) =>
    readdirSync(path.join(SHOTS, repo))
      .filter((f) => f.startsWith(`${tag}--`) && f.endsWith('.png'))
      .map((f) => ({ repo, name: f.slice(0, -4) })),
  );
  const own = all.filter((s) => listComponents(path.join(ROOT, s.repo)).some((c) => c.tag === tag));
  const pool = own.length ? own : all;
  const chosen = pool.find((s) => s.name === PICK[tag]) ?? pool[0];
  if (!chosen) return null;
  const base = path.join(SHOTS, chosen.repo, chosen.name);
  return { png: `${base}.png`, json: `${base}.json` };
}

// -------------------------------------------------------------------------------------- options
const clean = (text) => text.replace(/\s+/g, ' ').trim();
const cell = (text) => clean(text).replace(/\|/g, '\\|');
/** A package description without its leading "<solid-x>: ", capitalised. */
const describe = (text = '') => {
  const t = clean(text).replace(/^<[\w-]+>:\s*/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The options of each element's definition interface in a repo, read by the type checker. */
function definitionsOf(repoRoot, components) {
  const configFile = ts.readConfigFile(path.join(repoRoot, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  const entries = components.map((c) => {
    const src = path.join(c.root, 'src');
    const files = readdirSync(src).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(src, f));
    for (const file of files) {
      const m = readFileSync(file, 'utf8').match(/FormbirdElementProps<\s*(\w+)/);
      if (m) return { tag: c.tag, file, iface: m[1] };
    }
    return { tag: c.tag, file: files[0], iface: null };
  });
  const program = ts.createProgram({ rootNames: entries.map((e) => e.file), options: { ...parsed.options, noEmit: true } });
  const checker = program.getTypeChecker();
  const out = {};
  for (const e of entries) {
    if (!e.iface) continue;
    const source = program.getSourceFile(e.file);
    let decl = null;
    ts.forEachChild(source, (node) => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === e.iface) decl = node;
    });
    if (!decl) continue;
    const type = checker.getTypeAtLocation(decl.name);
    out[e.tag] = { iface: e.iface, file: e.file, options: propsOf(checker, type, e.iface) };
  }
  return out;
}

function propsOf(checker, type, ownName) {
  return checker.getPropertiesOfType(type).map((prop) => {
    const d = prop.declarations?.[0];
    const from = d && ts.isInterfaceDeclaration(d.parent) ? d.parent.name.text : d && ts.isTypeLiteralNode(d.parent) ? ownName : '';
    const typeText = d && d.type ? d.type.getText() : checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, d ?? prop.valueDeclaration));
    return {
      name: prop.name,
      optional: !!(prop.flags & ts.SymbolFlags.Optional),
      type: clean(typeText),
      doc: clean(ts.displayPartsToString(prop.getDocumentationComment(checker))) || GENERIC_DOCS[prop.name] || '',
      from: from === ownName ? '' : from,
    };
  });
}

function optionsTable(options) {
  const rows = options.map((o) => `| \`${o.name}\`${o.optional ? '' : ' (required)'} | \`${cell(o.type)}\` | ${cell(o.doc) || ' '}${o.from ? ` _(${o.from})_` : ''} |`);
  return ['| Option | Type | What it does |', '|---|---|---|', ...rows].join('\n');
}

// --------------------------------------------------------------------------------------- write
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
mkdirSync(MEDIA, { recursive: true });
let common = null;
const sections = [];
const index = [];
let count = 0;

for (const repo of REPOS) {
  const root = path.join(ROOT, repo.dir);
  if (!existsSync(root)) continue;
  const components = listComponents(root);
  if (!components.length) continue;
  const defs = definitionsOf(root, components);
  const parts = [`## ${repo.title}\n\n[\`${repo.dir}\`](${repo.dir}/README.md)${repo.note ? `: ${repo.note}` : ''}`];
  for (const c of components) {
    count++;
    const def = defs[c.tag];
    const own = def ? def.options.filter((o) => !COMMON_FROM.has(o.from)) : [];
    if (def && !common) {
      const order = (o) => (o.from === 'ComponentDefinition' ? 0 : 1);
      common = def.options
        .filter((o) => COMMON_FROM.has(o.from))
        .map((o) => ({ ...o, doc: o.doc || COMMON_DOCS[o.name] || '', from: '' }))
        .sort((a, b) => order(a) - order(b));
    }
    const anchor = c.tag;
    index.push(`| [\`<${c.tag}>\`](#${anchor}) | ${repo.title} | ${c.version} | ${cell(describe(c.description))} |`);
    const shot = shotOf(c.tag);
    let picture = '_No picture: the element isn’t on its repo’s browser test page._';
    let example = '';
    if (shot && existsSync(shot.png)) {
      copyFileSync(shot.png, path.join(MEDIA, `${c.tag}.png`));
      const width = readFileSync(shot.png).readUInt32BE(16); // PNG IHDR
      picture = `<img src="docs/media/components/${c.tag}.png" alt="<${c.tag}>" width="${Math.min(width, 900)}">`;
      const json = existsSync(shot.json) ? readFileSync(shot.json, 'utf8') : '';
      if (json && json !== 'null') example = `\n<details><summary>The componentDefinition in the picture</summary>\n\n\`\`\`json\n${json}\n\`\`\`\n\n</details>\n`;
    }
    const readme = existsSync(path.join(c.root, 'README.md')) ? `[README](${rel(path.join(c.root, 'README.md'))})` : '';
    parts.push(
      [
        `### \`<${c.tag}>\``,
        describe(c.description),
        ['| | |',
        '|---|---|',
        `| Package | \`${c.name}\` ${c.version}${readme ? ` · ${readme}` : ''} |`,
        `| Source | [${rel(path.join(c.root, 'src/main.tsx'))}](${rel(path.join(c.root, 'src/main.tsx'))})${def ? ` · [${path.basename(def.file)}](${rel(def.file)}) (\`${def.iface}\`)` : ''} |`,
        `| Built bundle | \`${repo.dir}/dist/${c.tag}/${c.tag}.js\` |`,
        `| In fieldtec-web | \`${DEPLOYED}/${c.tag}/${c.tag}.js\` |`,
        c.vendorLibraries.length ? `| Vendor libraries | ${c.vendorLibraries.map((v) => `\`${v.name ?? v}\``).join(', ')} |` : null]
          .filter(Boolean)
          .join('\n'),
        picture,
        example.trim(),
        def ? `**componentDefinition** (\`componentName: "${c.tag}"\`, plus the [common options](#common-options)):\n\n${own.length ? optionsTable(own) : '_Only the common options._'}` : '_No definition interface found._',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }
  sections.push(parts.join('\n\n'));
}

const kit = [
  '## The kit bundle',
  '',
  'Not an element: the runtime every element bundle uses (fields, pickers, the host bridge, styles), loaded once as the global `SolidJsComponentsKit`.',
  '',
  '| | |',
  '|---|---|',
  '| Source | [solidjs-components-shared/packages/kit/src/index.ts](solidjs-components-shared/packages/kit/src/index.ts) |',
  '| Built bundle | `solidjs-components-shared/dist/solidjs-components-kit/solidjs-components-kit.js` |',
  `| In fieldtec-web | \`${DEPLOYED}/solidjs-components-kit/solidjs-components-kit.js\` |`,
].join('\n');

const doc = `# Components

Every Solid element in these repos: ${count} custom elements and the kit bundle they run on. For each:
its source, its built bundle (\`pnpm build\` in its repo), where \`pnpm db:setup\` / \`pnpm deploy:fieldtec\`
put it in fieldtec-web, a picture, and the options its componentDefinition takes.

Bundle file names in \`dist/\` are stable. The component documents that load them add \`?v=<content hash>\`
to the URL, so a new build is never served from fieldtec-web's service worker cache.

Written by \`node scripts/components-md.mjs --shots\`. The options come from each element's TypeScript
definition interface and its doc comments, and the pictures from each repo's browser test page
(its fixtures, against the in-memory host), so both follow the code.

| Element | App | Version | What it does |
|---|---|---|---|
${index.join('\n')}

## Common options

Every element takes these, as fieldtec-web's \`sc-*\` components do. \`name\` is the document field the
element reads and writes. Set \`disableSave: true\` on an element that only shows things.

${common ? optionsTable(common) : ''}

${sections.join('\n\n')}

${kit}
`;
writeFileSync(path.join(ROOT, 'COMPONENTS.md'), doc);
console.log(`\nWrote COMPONENTS.md: ${count} elements.`);

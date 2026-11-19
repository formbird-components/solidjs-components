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
const { listComponents } = await import(path.join(SHARED, 'packages/tools/repo.mjs'));
const { REPOS, COMMON_FROM, COMMON_DOCS, clean, describe, definitionsOf } = await import('./component-options.mjs');

const DEPLOYED = 'server/public/vendor/custom-component-modules/dist/solidjs-components';
const MEDIA = path.join(ROOT, 'docs/media/components');
const SHOTS = path.join(ROOT, '.component-shots');
/** The instance that stands for a tag, when its repo's test page has several (`<tag>--<id>`). */
const PICK = {
  'solid-budget-check': 'solid-budget-check--budget',
  'solid-line-items': 'solid-line-items--lines',
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
const cell = (text) => clean(text).replace(/\|/g, '\\|');
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

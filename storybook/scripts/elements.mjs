#!/usr/bin/env node
// Writes generated/elements.json: every Solid element with its app, version, description and its
// componentDefinition options (type, doc comment, whether every element takes it), read from the
// element's TypeScript definition interface by scripts/component-options.mjs, the same source as
// COMPONENTS.md. The stories build their docs and controls from it. Runs before `storybook dev` and
// `storybook build`.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { ROOT, REPOS, COMMON_FROM, COMMON_DOCS, describe, definitionsOf } = await import(path.join(here, '../../scripts/component-options.mjs'));
const { listComponents } = await import(path.join(ROOT, 'solidjs-components-shared/packages/tools/repo.mjs'));

const elements = {};
for (const repo of REPOS) {
  const root = path.join(ROOT, repo.dir);
  const components = listComponents(root);
  if (!components.length) continue;
  const defs = definitionsOf(root, components);
  for (const c of components) {
    const options = (defs[c.tag]?.options ?? []).map((o) => ({
      name: o.name,
      type: o.type,
      optional: o.optional,
      doc: o.doc || COMMON_DOCS[o.name] || '',
      common: COMMON_FROM.has(o.from),
    }));
    elements[c.tag] = {
      tag: c.tag,
      app: repo.title,
      repo: repo.dir,
      source: path.relative(ROOT, c.root).split(path.sep).join('/'),
      version: c.version,
      description: describe(c.description),
      options,
    };
  }
}

const out = path.join(here, '../generated');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'elements.json'), `${JSON.stringify(elements, null, 2)}\n`);
console.log(`generated/elements.json: ${Object.keys(elements).length} elements`);

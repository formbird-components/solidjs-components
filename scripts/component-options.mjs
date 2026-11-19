// The componentDefinition options of every Solid element, read by the TypeScript checker from each
// element's `…Definition` interface and its doc comments. Used by components-md.mjs (COMPONENTS.md)
// and by the Storybook (storybook/scripts/elements.mjs: its controls and docs).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = path.join(ROOT, 'solidjs-components-shared');
const require = createRequire(path.join(SHARED, 'packages/tools/package.json'));
const ts = require('typescript');

export const REPOS = [
  { dir: 'solidjs-components-shared', title: 'Shared', note: 'Generic elements every app uses.' },
  { dir: 'solidjs-components-internal', title: 'Issue tracker (internal)', note: '' },
  { dir: 'solidjs-components-fleet', title: 'Fleet', note: '' },
  { dir: 'solidjs-components-whs', title: 'Work health and safety', note: '' },
  { dir: 'solidjs-components-hr', title: 'HR', note: '' },
  { dir: 'solidjs-components-procurement', title: 'Procurement', note: '' },
];

/** Options many elements declare, with the same meaning everywhere (used when they have no doc comment). */
export const GENERIC_DOCS = {
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
export const COMMON_FROM = new Set(['BaseDefinition', 'ComponentDefinition']);
/** What fieldtec-web's ComponentDefinition props do (its types carry no doc comments). */
export const COMMON_DOCS = {
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


export const clean = (text) => text.replace(/\s+/g, ' ').trim();
/** A package description without its leading "<solid-x>: ", capitalised. */
export const describe = (text = '') => {
  const t = clean(text).replace(/^<[\w-]+>:\s*/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The options of each element's definition interface in a repo, read by the type checker. */
export function definitionsOf(repoRoot, components) {
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


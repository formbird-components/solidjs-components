// Where things are: solidjs-components-shared itself, and the repo the CLI runs in (shared, internal
// or fleet). App repos sit next to shared, in one folder; fieldtec-web is in a folder above:
//
//   ~/git/fieldtec-web
//   ~/git/solidjs-components/
//     solidjs-components-shared     kit, generic elements, tools, platform seed
//     solidjs-components-internal   issue tracker (SDMS-style) app
//     solidjs-components-fleet      fleet management app

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of solidjs-components-shared (this file lives in packages/tools). */
export const sharedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The fieldtec-web checkout every repo deploys to and seeds for: `FIELDTEC_WEB`, or the nearest
 * `fieldtec-web` folder beside shared or beside any folder above it. When there is none, the place
 * the README describes (beside the solidjs-components folder), so error messages name it.
 */
function findFieldtec() {
  if (process.env.FIELDTEC_WEB) return path.resolve(process.env.FIELDTEC_WEB);
  for (let dir = path.dirname(sharedRoot); path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'fieldtec-web');
    if (existsSync(path.join(candidate, 'server/config'))) return candidate;
  }
  return path.resolve(sharedRoot, '../../fieldtec-web');
}

export const fieldtecRoot = findFieldtec();

/**
 * The repo a command runs in: the nearest directory, from `start` up, whose package.json has a
 * `solidComponents` section.
 * @param {string} [start] - Directory to start from (default: the current directory)
 * @returns {string}
 * @throws {Error} When there is none
 */
export function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const file = path.join(dir, 'package.json');
    if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).solidComponents) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`No solid-components repo (package.json with a "solidComponents" section) at or above ${start}`);
    dir = parent;
  }
}

/**
 * A repo's `solidComponents` settings from its package.json.
 * @param {string} repoRoot
 * @returns {{ name: string, testBundles?: { name: string, entry: string, globalName: string }[], browserTest?: string, previewPort?: number }}
 */
export function repoConfig(repoRoot) {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  return { name: pkg.name, ...pkg.solidComponents };
}

/**
 * The custom elements in <repo>/components/*: every package.json with `formbird.tag`.
 * @param {string} repoRoot
 * @returns {{ tag: string, dir: string, root: string, name: string, version: string, description: string, vendorLibraries: { name: string, fileName: string }[] }[]}
 */
export function listComponents(repoRoot) {
  const base = path.join(repoRoot, 'components');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .sort()
    .map((dir) => ({ dir, root: path.join(base, dir), file: path.join(base, dir, 'package.json') }))
    .filter((c) => existsSync(c.file))
    .map((c) => {
      const pkg = JSON.parse(readFileSync(c.file, 'utf8'));
      return {
        tag: pkg.formbird?.tag,
        dir: c.dir,
        root: c.root,
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        vendorLibraries: pkg.formbird?.vendorLibraries ?? [],
      };
    })
    .filter((c) => c.tag);
}

/** Whether a repo is solidjs-components-shared itself. */
export const isShared = (repoRoot) => path.resolve(repoRoot) === sharedRoot;

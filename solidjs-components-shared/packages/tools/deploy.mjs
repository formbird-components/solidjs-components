// Copies built bundles (dist/) into a fieldtec-web checkout, at the path the generated component
// documents reference. An app repo deploys solidjs-components-shared's bundles (the kit and the
// generic elements) along with its own, since its pages need both.
//
// fieldtec-web ignores /server/* in git, so this doesn't touch its tracked files.

import { cpSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fieldtecRoot, isShared, sharedRoot } from './repo.mjs';
import { BUNDLE_URL_BASE } from './vite-config.mjs';

/**
 * Copies every bundle of the given repos into fieldtec-web (or `target`).
 * @param {{ repoRoots: string[], target?: string, dryRun?: boolean, log?: (line: string) => void }} opts
 * @returns {string[]} The bundle names copied
 * @throws {Error} When a repo hasn't been built
 */
export function deployBundles({ repoRoots, target, dryRun = false, log = console.log }) {
  const destination = target ? path.resolve(target) : path.join(fieldtecRoot, 'server/public', BUNDLE_URL_BASE);
  const copied = [];
  for (const repoRoot of repoRoots) {
    const dist = path.join(repoRoot, 'dist');
    if (!existsSync(dist)) throw new Error(`${dist} doesn't exist. Run "pnpm build" in ${repoRoot} first.`);
    for (const name of readdirSync(dist).sort()) {
      const to = path.join(destination, name);
      log(`${dryRun ? '[dry-run] ' : ''}${path.basename(repoRoot)}/dist/${name} -> ${to}`);
      if (!dryRun) cpSync(path.join(dist, name), to, { recursive: true });
      copied.push(name);
    }
  }
  return copied;
}

/**
 * The repos a deploy from `repoRoot` covers: shared alone, or shared plus the app.
 * @param {string} repoRoot
 * @returns {string[]}
 */
export const deployedRepos = (repoRoot) => (isShared(repoRoot) ? [sharedRoot] : [sharedRoot, repoRoot]);

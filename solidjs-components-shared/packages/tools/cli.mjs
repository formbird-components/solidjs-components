#!/usr/bin/env node
// `solid-components`: builds, tests and deploys the repo it runs in (solidjs-components-shared or an
// app repo such as internal or fleet), always with solidjs-components-shared's own Vite, Vitest and
// TypeScript. App repos therefore carry no build tooling of their own.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deployBundles, deployedRepos } from './deploy.mjs';
import { componentDocuments } from './formbird.mjs';
import { findRepoRoot, isShared, listComponents, repoConfig, sharedRoot } from './repo.mjs';
import { componentConfig, devBundleConfig, kitConfig, previewConfig } from './vite-config.mjs';

const require = createRequire(import.meta.url);
const USAGE = `Usage: solid-components <command> [options]

  build [--with-shared] [--test-assets]   build this repo's elements (shared also builds the kit)
                                          --with-shared: build solidjs-components-shared first
                                          --test-assets: also the test-only bundles (Solid runtime, mock host, ...)
  typecheck                               tsc on this repo
  test                                    unit tests (Vitest)
  browser-test                            drive the built bundles in Chrome (test/browser.mjs)
  dev                                     preview gallery (apps/preview) with the mock host
  deploy [--dry-run]                      copy shared's and this repo's bundles into fieldtec-web
  docs                                    write formbird/components/<tag>.component.json`;

const [command, ...args] = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const repoRoot = findRepoRoot();

/**
 * Builds a list of Vite configs one after another and prints one line per bundle.
 * @param {{ label: string, config: object }[]} targets
 */
async function viteBuild(targets) {
  const { build } = await import('vite');
  for (const { label, config } of targets) {
    const started = Date.now();
    await build(config);
    console.log(`  built ${label.padEnd(34)} ${Date.now() - started} ms`);
  }
}

/** Build targets for one repo: its elements, plus the kit when it is shared. */
function buildTargets(root, { testAssets }) {
  const targets = [];
  if (isShared(root)) targets.push({ label: 'solidjs-components-kit', config: kitConfig() });
  for (const component of listComponents(root)) {
    targets.push({ label: component.tag, config: componentConfig({ name: component.tag, root: component.root, repoRoot: root }) });
  }
  if (testAssets) {
    if (isShared(root)) {
      targets.push({
        label: 'solid-runtime (test only)',
        config: devBundleConfig({ name: 'solid-runtime', root: path.join(root, 'packages/solid-runtime'), entry: 'src/index.ts', globalName: 'SolidRuntimeForTests', repoRoot: root }),
      });
      targets.push({
        label: 'testing (test only)',
        config: devBundleConfig({ name: 'testing', root: path.join(root, 'packages/testing'), entry: 'src/index.ts', globalName: 'SolidJsComponentsTesting', repoRoot: root }),
      });
    }
    for (const bundle of repoConfig(root).testBundles ?? []) {
      targets.push({ label: `${bundle.name} (test only)`, config: devBundleConfig({ ...bundle, root, repoRoot: root }) });
    }
  }
  return targets;
}

/** Runs a Node script from solidjs-components-shared's dependencies and exits on failure. */
function runNode(script, scriptArgs, cwd = repoRoot) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

switch (command) {
  case 'build': {
    const testAssets = flag('test-assets');
    const roots = flag('with-shared') && !isShared(repoRoot) ? [sharedRoot, repoRoot] : [repoRoot];
    for (const root of roots) {
      console.log(`${path.basename(root)}:`);
      await viteBuild(buildTargets(root, { testAssets }));
    }
    break;
  }
  case 'typecheck':
    runNode(require.resolve('typescript/bin/tsc'), ['-p', path.join(repoRoot, 'tsconfig.json')]);
    break;
  case 'test':
    runNode(require.resolve('vitest/vitest.mjs'), ['run', '--root', repoRoot, '--config', path.join(sharedRoot, 'packages/tools/vitest.config.mjs'), ...args]);
    break;
  case 'browser-test': {
    const specFile = path.join(repoRoot, repoConfig(repoRoot).browserTest ?? 'test/browser.mjs');
    const { runBrowserTest } = await import('./browser-test.mjs');
    const spec = (await import(pathToFileURL(specFile).href)).default;
    const ok = await runBrowserTest({ repoRoot, spec });
    process.exit(ok ? 0 : 1);
    break;
  }
  case 'dev': {
    const { createServer } = await import('vite');
    const server = await createServer(previewConfig({ repoRoot, port: repoConfig(repoRoot).previewPort ?? 5180 }));
    await server.listen();
    server.printUrls();
    break;
  }
  case 'deploy':
    deployBundles({ repoRoots: deployedRepos(repoRoot), dryRun: flag('dry-run') });
    break;
  case 'docs': {
    const out = path.join(repoRoot, 'formbird/components');
    mkdirSync(out, { recursive: true });
    for (const doc of componentDocuments(repoRoot)) {
      const file = path.join(out, `${doc.name}.component.json`);
      writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
      console.log(`wrote ${path.relative(repoRoot, file)}`);
    }
    break;
  }
  default:
    console.log(USAGE);
    process.exit(command && command !== 'help' && command !== '--help' ? 1 : 0);
}

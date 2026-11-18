// Browser test harness for BUILT bundles, loaded the way fieldtec-web loads them: classic <script>
// tags, Solid runtime first, then vendor libraries, the kit, and each element, with properties set
// on the elements. Each repo describes its page and checks in test/browser.mjs; this file serves the
// page, drives Chrome and reports.
//
// The page installs an AMD `define` first (as Monaco's loader does) to prove the IIFE bundles still
// register. Uses the system Chrome (CHROME env to override): Playwright's own browsers aren't installed.
//
//   SOLID_RUNTIME=/path/to/solid-vendor.umd.js   run on another Solid 2 runtime build (AMD simulation
//                                                then off unless SIMULATE_AMD=1)

import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { listComponents, sharedRoot } from './repo.mjs';
import { KIT_NAME } from './vite-config.mjs';

const require = createRequire(import.meta.url);

/**
 * @typedef {object} BrowserSpec
 * @property {string[]} components - Element tags on the page (from shared or from the repo)
 * @property {string[]} [setupScripts] - Scripts before the host is installed (fixtures): "shared:<path>" or "repo:<path>"
 * @property {string[]} [vendorScripts] - Scripts between the runtime and the kit: "shared:<path>" or "repo:<path>"
 * @property {RegExp[]} [ignoreConsole] - Console messages that are known third-party noise, not failures
 * @property {string} hostSetup - Script run after the testing bundle loads; `T` is SolidJsComponentsTesting. Must set window.host.
 * @property {string} body - Page body markup
 * @property {string} pageScript - Script that creates the elements
 * @property {Record<string, string>} [extraPages] - More pages, by path ("stale.html")
 * @property {(context: import('playwright').BrowserContext) => Promise<void>} [prepare] - Routes, permissions…
 * @property {(t: TestKit) => Promise<void>} run - The checks
 */

/**
 * @typedef {object} TestKit
 * @property {import('playwright').Page} tab
 * @property {import('playwright').BrowserContext} context
 * @property {string} origin
 * @property {(name: string, ok: boolean, detail?: string) => void} check
 * @property {(a: unknown, b: unknown) => boolean} eq
 * @property {(title: string) => void} section
 * @property {(ms?: number) => Promise<void>} waitIdle
 * @property {() => Promise<any>} lastChange
 * @property {() => Promise<number>} changeCount
 * @property {(id: string) => Promise<string[]>} optionLabels
 * @property {(url: string) => string} scriptUrl - URL of "shared:<path>" / "repo:<path>"
 */

/**
 * Builds the test page, serves both repos, runs the spec's checks in Chrome and exits with their result.
 * @param {{ repoRoot: string, spec: BrowserSpec }} opts
 */
export async function runBrowserTest({ repoRoot, spec }) {
  const { chromium } = require('playwright');
  const repoTags = new Map(listComponents(repoRoot).map((c) => [c.tag, c]));
  const sharedTags = new Map(listComponents(sharedRoot).map((c) => [c.tag, c]));
  const componentInfo = (tag) => {
    if (repoTags.has(tag)) return { ...repoTags.get(tag), scheme: 'repo', base: repoRoot };
    if (sharedTags.has(tag)) return { ...sharedTags.get(tag), scheme: 'shared', base: sharedRoot };
    throw new Error(`<${tag}> is neither in ${repoRoot}/components nor in solidjs-components-shared/components`);
  };

  const runtimeOverride = process.env.SOLID_RUNTIME ? path.resolve(process.env.SOLID_RUNTIME) : undefined;
  // Simulating Monaco's AMD loader tests OUR bundles. A UMD runtime (the published solid-vendor) would
  // hand itself to that loader, so the simulation is off by default with SOLID_RUNTIME.
  const simulateAmd = process.env.SIMULATE_AMD ? process.env.SIMULATE_AMD !== '0' : !runtimeOverride;
  if (runtimeOverride) console.log(`Solid runtime: ${runtimeOverride}`);

  const scripts = [
    runtimeOverride ? '/__runtime__.js' : 'shared:dist-dev/solid-runtime/solid-runtime.js',
    'shared:dist-dev/testing/testing.js',
    ...(spec.setupScripts ?? []),
    '__install_host__',
    ...(spec.vendorScripts ?? []),
    `shared:dist/${KIT_NAME}/${KIT_NAME}.js`,
    ...spec.components.map((tag) => `${componentInfo(tag).scheme}:dist/${tag}/${tag}.js`),
  ];
  const fileOf = (script) => {
    const [scheme, rest] = script.split(/:(.*)/s);
    return path.join(scheme === 'shared' ? sharedRoot : repoRoot, rest);
  };
  const scriptUrl = (script) => (script.startsWith('/') ? script : `/${script.replace(':', '/')}`);
  for (const script of scripts.filter((s) => s.includes(':'))) {
    if (!existsSync(fileOf(script))) {
      console.error(`Missing ${fileOf(script)}. Run "pnpm build && pnpm build:test-assets" first.`);
      process.exit(1);
    }
  }

  const amdShim = simulateAmd
    ? `<script>
  // Monaco's AMD loader does this; UMD bundles would hand themselves to it and never register.
  window.define = function () { window.__amdDefineCalls = (window.__amdDefineCalls || 0) + 1; };
  window.define.amd = {};
</script>`
    : '';
  const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>browser test</title><link rel="icon" href="data:,">
${amdShim}
${scripts
  .map((s) => (s === '__install_host__' ? `<script>\n  const T = SolidJsComponentsTesting;\n  ${spec.hostSetup}\n</script>` : `<script src="${scriptUrl(s)}"></script>`))
  .join('\n')}
</head><body>
${spec.body}
<script>
${spec.pageScript}
</script>
</body></html>`;

  const pages = { '/': page, ...Object.fromEntries(Object.entries(spec.extraPages ?? {}).map(([p, html]) => [`/${p}`, html])) };
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.map': 'application/json', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (pages[url.pathname]) {
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(pages[url.pathname]);
      return;
    }
    if (url.pathname === '/__runtime__.js' && runtimeOverride) {
      res.writeHead(200, { 'content-type': MIME['.js'] }).end(readFileSync(runtimeOverride));
      return;
    }
    const [, scheme, ...rest] = url.pathname.split('/');
    const base = scheme === 'shared' ? sharedRoot : scheme === 'repo' ? repoRoot : undefined;
    const file = base && path.normalize(path.join(base, ...rest));
    if (!file || !file.startsWith(base) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
  };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await spec.prepare?.(context);
  const tab = await context.newPage();
  const problems = [];
  const ignored = (text) => (spec.ignoreConsole ?? []).some((pattern) => pattern.test(text));
  tab.on('console', (m) => ['error', 'warning'].includes(m.type()) && !ignored(m.text()) && problems.push(`[${m.type()}] ${m.text()}`));
  tab.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  tab.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()}`));
  tab.on('response', (r) => r.status() >= 400 && problems.push(`[http ${r.status()}] ${r.url()}`));

  /** @type {TestKit} */
  const kit = {
    tab,
    context,
    origin,
    check,
    eq,
    section: (title) => console.log(title),
    waitIdle: (ms = 250) => tab.waitForTimeout(ms),
    lastChange: () => tab.evaluate(() => window.host.changes.at(-1)),
    changeCount: () => tab.evaluate(() => window.host.changes.length),
    optionLabels: (id) =>
      tab
        .locator(`#${id} li[role=option]`)
        .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.querySelector('.sj-option__label')?.textContent)),
    scriptUrl: (script) => `${origin}${scriptUrl(script)}`,
  };

  try {
    await tab.goto(origin, { waitUntil: 'load' });
    await kit.waitIdle();

    console.log('Registration');
    const reg = await tab.evaluate((tags) => tags.map((t) => ({ t, defined: !!customElements.get(t) })), spec.components);
    check(`all ${reg.length} elements are defined${simulateAmd ? ' despite an AMD define on the page' : ''}`, reg.every((r) => r.defined), JSON.stringify(reg));
    if (simulateAmd) check('no bundle handed itself to the AMD loader', (await tab.evaluate(() => window.__amdDefineCalls ?? 0)) === 0);
    for (const tag of spec.components) {
      const expected = componentInfo(tag).version;
      const actual = await tab.locator(tag).first().getAttribute('fb-component-version');
      check(`<${tag}> sets fb-component-version=${expected}`, actual === expected, `got ${actual}`);
    }

    await spec.run(kit);

    check('no console errors, warnings or page errors', problems.length === 0, problems.join('\n      '));
  } catch (error) {
    check('browser test ran to completion', false, error.stack);
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  return failed.length === 0;
}

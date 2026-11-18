// Vite configuration for every bundle in solidjs-components-shared and the app repos (internal,
// fleet), so build settings live in one place. The `solid-components` CLI (cli.mjs) builds with these
// through Vite's API; packages carry no Vite config of their own.
//
// Runtime contract on a Formbird page (fieldtec-web loads files from a component document's
// vendorLibrariesRel, in order, as classic scripts):
//   1. solid-vendor.umd.js        sets SolidJS / SolidJSWeb / SolidElement (formbird-sc-components)
//   2. any vendor library the element declares (e.g. openlayers-shared for maps)
//   3. solidjs-components-kit.js  sets SolidJsComponentsKit (solidjs-components-shared, packages/kit)
//   4. <component>.js             defines the custom element
// Components therefore externalise both the Solid runtime and the kit.
//
// Bundles are IIFE, not UMD: a UMD wrapper registers itself with an AMD loader when the page has
// one (Monaco's loader, used by sc-monaco components, installs a global `define.amd`), and then
// never runs, so the element is never defined. An IIFE always runs and assigns its global.

import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';
import path from 'node:path';
import { sharedRoot } from './repo.mjs';

/** Globals set by formbird-sc-components' solid-vendor (Solid 2 build). */
export const SOLID_GLOBALS = {
  'solid-js': 'SolidJS',
  '@solidjs/web': 'SolidJSWeb',
  '@solidjs/element': 'SolidElement',
};

/** URL path (under fieldtec-web's server/public) where every repo's bundles are deployed and loaded from. */
export const BUNDLE_URL_BASE = 'vendor/custom-component-modules/dist/solidjs-components';

export const KIT_MODULE = '@solidjs-components/kit';
export const KIT_GLOBAL = 'SolidJsComponentsKit';
export const KIT_NAME = 'solidjs-components-kit';

/** Production bundles of a repo land in <repo>/dist/<name>/<name>.js. */
export const distDir = (repoRoot, name) => path.join(repoRoot, 'dist', name);

/** Test-only bundles (Solid runtime, mock host, map library) land in <repo>/dist-dev/<name>/ and are never deployed. */
export const devDistDir = (repoRoot, name) => path.join(repoRoot, 'dist-dev', name);

const toGlobalName = (name) =>
  name.replace(/(^|[-_/@.])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '');

/**
 * Banner for a component bundle: checks that the page's kit has every function the component
 * imports before the component registers. A page can hold an older kit than the component was built
 * against: fieldtec-web's service worker keeps vendor files cache-first, and a long-lived tab keeps
 * the kit it loaded first. Without the check the element would fail inside render ("x is not a
 * function") and show nothing. With it, the element shows the reason and what to do. The list of
 * imports comes from Rollup (`importedBindings`), so it can't drift from the code.
 * @param {string} tag - The element's tag
 * @returns {(chunk: { importedBindings?: Record<string, string[]> }) => string}
 */
function kitCheckBanner(tag) {
  return (chunk) => {
    const names = chunk.importedBindings?.[KIT_MODULE] ?? [];
    if (!names.length) return '';
    return `/* Checks the page's ${KIT_NAME} has what <${tag}> uses (see solidjs-components-shared/packages/tools/vite-config.mjs). */
(function () {
  var tag = ${JSON.stringify(tag)}, needed = ${JSON.stringify(names)}, kit = globalThis.${KIT_GLOBAL};
  var missing = kit ? needed.filter(function (name) { return !(name in kit); }) : needed;
  if (!missing.length || typeof customElements === "undefined" || customElements.get(tag)) return;
  var text = "<" + tag + "> needs a newer ${KIT_NAME}.js than this page loaded" + (kit ? " (missing: " + missing.join(", ") + ")" : "") +
    ". The browser is probably running an old copy kept by fieldtec-web's service worker: reload the page, and if this stays, clear this site's data.";
  console.error("[solidjs-components] " + text);
  customElements.define(tag, class extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      var box = document.createElement("div");
      box.setAttribute("role", "alert");
      box.style.cssText = "padding:8px 12px;border:1px solid rgb(229 72 77 / .35);border-radius:8px;background:rgb(229 72 77 / .08);color:#b4232a;font:13px/1.45 system-ui,sans-serif";
      box.textContent = text;
      this.attachShadow({ mode: "open" }).appendChild(box);
    }
  });
})();`;
  };
}

/**
 * One IIFE library build.
 * @param {{ name: string, root: string, entry: string, outDir: string, globals?: Record<string,string>, globalName?: string, banner?: (chunk: object) => string }} opts
 */
function libraryConfig({ name, root, entry, outDir, globals = {}, globalName = toGlobalName(name), banner }) {
  return defineConfig({
    root,
    configFile: false,
    logLevel: 'warn',
    // HMR refresh is dev-only and would inject a solid-js/refresh import into the bundle.
    plugins: [solid({ refresh: { disabled: true } })],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
      target: 'es2022',
      reportCompressedSize: false,
      lib: {
        entry: path.resolve(root, entry),
        name: globalName,
        formats: ['iife'],
        fileName: () => `${name}.js`,
      },
      rollupOptions: {
        external: Object.keys(globals),
        output: { globals, exports: 'named', ...(banner ? { banner } : {}) },
      },
    },
  });
}

/**
 * Build config for a custom element in <repo>/components/<dir>. The bundle registers the element on load.
 * @param {{ name: string, root: string, repoRoot: string }} opts - tag, component directory, its repo
 */
export function componentConfig({ name, root, repoRoot }) {
  return libraryConfig({
    name,
    root,
    entry: 'src/main.tsx',
    outDir: distDir(repoRoot, name),
    globals: { ...SOLID_GLOBALS, [KIT_MODULE]: KIT_GLOBAL },
    banner: kitCheckBanner(name),
  });
}

/** Build config for the shared kit (solidjs-components-shared/packages/kit). */
export function kitConfig() {
  return libraryConfig({
    name: KIT_NAME,
    root: path.join(sharedRoot, 'packages/kit'),
    entry: 'src/index.ts',
    outDir: distDir(sharedRoot, KIT_NAME),
    globals: SOLID_GLOBALS,
    globalName: KIT_GLOBAL,
  });
}

/**
 * Test-only bundle with no externals (Solid runtime shim, mock host, a map library).
 * @param {{ name: string, root: string, entry: string, globalName?: string, repoRoot: string }} opts
 */
export function devBundleConfig({ name, root, entry, globalName, repoRoot }) {
  return libraryConfig({ name, root, entry, outDir: devDistDir(repoRoot, name), globalName });
}

/**
 * Dev server for a repo's preview gallery (<repo>/apps/preview). Components and the kit are compiled
 * from source with Solid's dev build, so misuse shows up as warnings. Every repo resolves the kit,
 * the mock host and the Solid runtime from solidjs-components-shared, so there is one copy of each.
 * @param {{ repoRoot: string, port?: number }} opts
 */
export function previewConfig({ repoRoot, port = 5180 }) {
  return defineConfig({
    root: path.join(repoRoot, 'apps/preview'),
    configFile: false,
    plugins: [solid({ refresh: { disabled: true } })],
    resolve: { alias: sharedAliases(), dedupe: Object.keys(SOLID_GLOBALS) },
    server: { port, host: true, allowedHosts: true, fs: { allow: [repoRoot, sharedRoot] } },
  });
}

/**
 * Import aliases that make an app repo use solidjs-components-shared's kit, mock host and Solid
 * runtime (Vite dev server and Vitest).
 * @returns {Record<string, string>}
 */
export function sharedAliases() {
  const modules = path.join(sharedRoot, 'node_modules');
  return {
    '@solidjs-components/kit': path.join(sharedRoot, 'packages/kit/src/index.ts'),
    '@solidjs-components/testing': path.join(sharedRoot, 'packages/testing/src/index.ts'),
    'solid-js': path.join(modules, 'solid-js'),
    '@solidjs/web': path.join(modules, '@solidjs/web'),
    '@solidjs/element': path.join(modules, '@solidjs/element'),
  };
}

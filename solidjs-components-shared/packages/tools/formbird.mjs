// Formbird document helpers shared by the doc generator, the deploy step and every repo's demo seed.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { listComponents, sharedRoot } from './repo.mjs';
import { BUNDLE_URL_BASE, distDir, KIT_NAME } from './vite-config.mjs';

/** Published @formbird/angular-elements build whose solid-vendor is Solid 2 (verified with the browser tests). */
export const ANGULAR_ELEMENTS_CDN = 'https://cdn.jsdelivr.net/npm/@formbird/angular-elements@8.5.11/dist';

/** Solid 2 runtime: SolidJS / SolidJSWeb / SolidElement globals (+ TomSelect, esToolkit). */
export const SOLID_VENDOR = {
  documentId: 'dd6cacc8-d0c0-4e54-a492-55e74f97be80',
  name: 'solid-vendor',
  fileName: `${ANGULAR_ELEMENTS_CDN}/solid-elements/solid-vendor/solid-vendor.umd.js`,
};

/** Formbird's template for component documents. */
export const COMPONENT_TEMPLATE_ID = '5f6000a0-0828-11e6-9b64-1b27992111e1';

/**
 * Stable UUID (v5 layout) from a name, so regenerating keeps the same documentIds.
 * @param {string} name
 * @returns {string}
 */
export function stableId(name) {
  const hex = createHash('sha1').update(`solidjs-components:${name}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Short content hash of a built bundle.
 * @param {string} repoRoot - Repo whose dist/ holds the bundle
 * @param {string} name - Bundle name: dist/<name>/<name>.js
 * @returns {string}
 * @throws {Error} When the bundle hasn't been built
 */
export function bundleHash(repoRoot, name) {
  const file = path.join(distDir(repoRoot, name), `${name}.js`);
  if (!existsSync(file)) {
    throw new Error(`${file} is missing. Run "pnpm build" first: component documents reference bundles by content hash.`);
  }
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);
}

/**
 * The URL component documents load a bundle from: its deployed path plus `?v=<content hash>`.
 *
 * fieldtec-web's service worker serves everything under /vendor/custom-component-modules/ cache
 * first, without revalidating. A bundle must therefore change URL whenever its content changes;
 * otherwise browsers keep running a cached copy, and a new component meets an old kit ("x is not a
 * function"). fieldtec-web's loader ignores the query string when it detects the file type.
 * @param {string} repoRoot - Repo whose dist/ holds the bundle
 * @param {string} name - Bundle name
 * @returns {string}
 */
export function bundleUrl(repoRoot, name) {
  return `${BUNDLE_URL_BASE}/${name}/${name}.js?v=${bundleHash(repoRoot, name)}`;
}

/**
 * The kit bundle every component document loads after the Solid runtime.
 * @returns {{ documentId: string, name: string, fileName: string }}
 */
export function kitLibrary() {
  return { documentId: stableId(KIT_NAME), name: KIT_NAME, fileName: bundleUrl(sharedRoot, KIT_NAME) };
}

/**
 * A vendor library a component declares in package.json (`formbird.vendorLibraries`). A `cdn:`
 * prefix means the published @formbird/angular-elements build, e.g.
 * `"cdn:openlayers-shared/openlayers-shared.umd.js"`.
 * @param {{ name: string, fileName: string }} library
 * @returns {{ documentId: string, name: string, fileName: string }}
 */
export function vendorLibrary({ name, fileName }) {
  return {
    documentId: stableId(`vendor:${name}`),
    name,
    fileName: fileName.startsWith('cdn:') ? `${ANGULAR_ELEMENTS_CDN}/${fileName.slice(4)}` : fileName,
  };
}

/**
 * Component documents for every element in <repo>/components/*, as fieldtec-web loads them:
 * Solid runtime, any vendor library the element declares, the kit, then the element bundle, each
 * by content-hashed URL (CDN files are versioned by their package version).
 * @param {string} repoRoot
 * @returns {Record<string, unknown>[]}
 * @throws {Error} When the bundles haven't been built
 */
export function componentDocuments(repoRoot) {
  const kit = kitLibrary();
  return listComponents(repoRoot).map(({ tag, version, description, vendorLibraries }) => {
    const documentId = stableId(tag);
    return {
      documentId,
      systemHeader: {
        systemType: 'component',
        templateId: COMPONENT_TEMPLATE_ID,
        summaryName: tag,
        currentVersion: true,
        keyIds: [],
      },
      name: tag,
      description,
      version,
      vendorLibrariesRel: [SOLID_VENDOR, ...vendorLibraries.map(vendorLibrary), kit, { documentId, name: tag, fileName: bundleUrl(repoRoot, tag) }],
    };
  });
}

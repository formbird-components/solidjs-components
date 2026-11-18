// OpenLayers comes from the page, not from our bundles: formbird-sc-components' openlayers-shared
// sets `globalThis.OL` (component documents load it from the published @formbird/angular-elements
// build before the element). Formbird's own mapping components use the same copy.

import type { OLGlobal } from '../../../packages/test-openlayers/surface';

export type { OLGlobal };

/**
 * The page's OpenLayers, if openlayers-shared has loaded.
 * @returns The `OL` global, or undefined
 */
export function getOL(): OLGlobal | undefined {
  const ol = (globalThis as { OL?: OLGlobal }).OL;
  return ol && typeof ol.Map === 'function' ? ol : undefined;
}

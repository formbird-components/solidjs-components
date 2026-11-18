// Where a seeded pin on the body map goes for a region: the region's centre as <solid-image-pins>
// stores pins (x and y as fractions of the view). The figure's regions and centres come from the
// element itself, so seeded pins land where pins added in the app do.

import { BODY_REGIONS } from '../../../solidjs-components-shared/components/image-pins/src/body-regions.ts';

/**
 * @param {'front' | 'back'} view
 * @param {string} region - A region name of the body figure ("Left hand")
 * @returns {{ x: number, y: number }}
 * @throws {Error} For a region the figure doesn't have
 */
export function pinAt(view, region) {
  const found = BODY_REGIONS[view]?.find((r) => r.name === region);
  if (!found) throw new Error(`The body figure's ${view} view has no region "${region}"`);
  return { x: found.x, y: found.y };
}

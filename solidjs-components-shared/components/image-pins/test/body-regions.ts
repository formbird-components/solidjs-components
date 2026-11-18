// Writes src/body-regions.ts from the figure's geometry (src/body.ts): each view's regions in
// reading order with the point a pin for the region goes to. Used by body.test.ts, which checks the
// file is current and rewrites it with UPDATE_BODY_REGIONS=1.

import { visibleCentre } from '../src/geometry';
import { regionNames, type FigureView } from '../src/body';

/** A string literal in the repo's style. */
const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A fraction to four places, as pins store them. */
const fraction = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * The source of src/body-regions.ts.
 * @param views - The figure's views
 * @returns The file's text
 */
export function bodyRegionsSource(views: readonly FigureView[]): string {
  const lines = views.flatMap((view) => {
    const groupOf = new Map(view.groups.flatMap((group) => group.regions.map((name) => [name, group.label] as const)));
    const entries = regionNames(view).map((name) => {
      const point = visibleCentre(view.regions, name);
      if (!point) throw new Error(`${view.name}: no visible part of ${name}`);
      const x = fraction(point[0] / view.width);
      const y = fraction(point[1] / view.height);
      return `    { name: ${quote(name)}, group: ${quote(groupOf.get(name) ?? '')}, x: ${x}, y: ${y} },`;
    });
    return [`  ${view.name}: [`, ...entries, '  ],'];
  });
  return `// The built-in body figure's regions (\`figure: "body"\`), per view, in reading order (head to toe,
// the person's right before their left), with the point a pin for each region goes to: x and y are
// fractions (0 to 1) of the view's width and height, the coordinates a pin stores. Left and right
// are the PERSON's.
//
// Plain data with no imports, so scripts can import this file directly (Node strips the types), for
// example to seed pins by region name. Made from the geometry in body.ts: don't edit by hand. The
// unit test test/body.test.ts checks it; \`UPDATE_BODY_REGIONS=1 pnpm test\` rewrites it.

export interface BodyRegionCentre {
  name: string;
  group: string;
  x: number;
  y: number;
}

export const BODY_REGIONS: { front: BodyRegionCentre[]; back: BodyRegionCentre[] } = {
${lines.join('\n')}
};
`;
}

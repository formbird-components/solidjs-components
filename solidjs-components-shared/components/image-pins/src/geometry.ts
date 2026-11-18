// Plane geometry for figures made of named regions: building smooth outlines (ellipses, tapered
// limbs), SVG path data, and hit-testing a point against them. No DOM, so it runs in unit tests.

export type Point = readonly [number, number];
export type Polygon = readonly Point[];

/** A named area of a figure, drawn from one or more outlines. */
export interface Shape {
  name: string;
  polygons: readonly Polygon[];
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Whether a point is inside a polygon (even-odd rule, as SVG's `fill-rule: evenodd` decides).
 * @param point - [x, y]
 * @param polygon - Outline, not necessarily closed
 * @returns True when inside
 */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The topmost shape under a point: shapes are drawn in order, so the last one containing it wins,
 * the way the browser hit-tests overlapping SVG paths.
 * @param shapes - Shapes in drawing order
 * @param point - [x, y] in the shapes' coordinates
 * @returns The shape's name, or undefined when the point is on none
 */
export function shapeAt(shapes: readonly Shape[], point: Point): string | undefined {
  const [x, y] = point;
  for (let i = shapes.length - 1; i >= 0; i--) {
    for (const polygon of shapes[i].polygons) {
      const box = boxOf(polygon);
      if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY && pointInPolygon(point, polygon)) return shapes[i].name;
    }
  }
  return undefined;
}

// Bounding boxes, worked out once per polygon: most points miss most shapes' boxes.
const boxes = new WeakMap<Polygon, ReturnType<typeof bounds>>();
const boxOf = (polygon: Polygon) => {
  let box = boxes.get(polygon);
  if (!box) boxes.set(polygon, (box = bounds([polygon])));
  return box;
};

/** Bounding box of some polygons. */
export function bounds(polygons: readonly Polygon[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [x, y] of polygon) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * A point well inside the visible part of a shape (not covered by shapes drawn over it), for
 * placing a pin "on the left forearm" without a pointer. Samples a grid over the shape and picks the
 * visible sample nearest the visible samples' mean, so concave or partly covered shapes still get a
 * point on themselves.
 * @param shapes - Every shape of the figure, in drawing order
 * @param name - The shape to find a point in
 * @returns [x, y], or undefined when no part of it is visible
 */
export function visibleCentre(shapes: readonly Shape[], name: string): Point | undefined {
  const shape = shapes.find((s) => s.name === name);
  if (!shape) return undefined;
  const box = bounds(shape.polygons);
  const step = Math.max(0.25, Math.max(box.maxX - box.minX, box.maxY - box.minY) / 48);
  const hits: Point[] = [];
  for (let y = box.minY + step / 2; y < box.maxY; y += step) {
    for (let x = box.minX + step / 2; x < box.maxX; x += step) {
      if (shapeAt(shapes, [x, y]) === name) hits.push([x, y]);
    }
  }
  if (!hits.length) return undefined;
  const meanX = hits.reduce((sum, [x]) => sum + x, 0) / hits.length;
  const meanY = hits.reduce((sum, [, y]) => sum + y, 0) / hits.length;
  let best = hits[0];
  let bestDistance = Infinity;
  for (const point of hits) {
    const distance = (point[0] - meanX) ** 2 + (point[1] - meanY) ** 2;
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return [round(best[0]), round(best[1])];
}

/**
 * SVG path data for some polygons, one closed subpath each.
 * @param polygons - Outlines
 * @returns The `d` attribute
 */
export function pathData(polygons: readonly Polygon[]): string {
  return polygons.map((polygon) => `M${polygon.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`).join('');
}

/**
 * An ellipse, optionally turned.
 * @param cx - Centre x
 * @param cy - Centre y
 * @param rx - Radius along the turned x axis
 * @param ry - Radius along the turned y axis
 * @param angle - Turn in radians (clockwise on screen)
 * @param steps - Points on the outline
 * @returns The outline
 */
export function ellipse(cx: number, cy: number, rx: number, ry: number, angle = 0, steps = 40): Point[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return [cx + x * cos - y * sin, cy + x * sin + y * cos] as const;
  });
}

/**
 * The part of an ellipse between two horizontal lines (a face below the hairline, say).
 * @param cx - Centre x
 * @param cy - Centre y
 * @param rx - Horizontal radius
 * @param ry - Vertical radius
 * @param top - Upper cut (clamped to the ellipse)
 * @param bottom - Lower cut (clamped to the ellipse)
 * @param steps - Points per side
 * @returns The outline
 */
export function ellipseBand(cx: number, cy: number, rx: number, ry: number, top: number, bottom: number, steps = 24): Point[] {
  const from = Math.max(top, cy - ry);
  const to = Math.min(bottom, cy + ry);
  const halfWidth = (y: number) => rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
  // Sample densely near the poles, where the outline turns fastest.
  const ys = Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps;
    const angleFrom = Math.asin(Math.max(-1, Math.min(1, (from - cy) / ry)));
    const angleTo = Math.asin(Math.max(-1, Math.min(1, (to - cy) / ry)));
    return cy + ry * Math.sin(angleFrom + (angleTo - angleFrom) * u);
  });
  const left = ys.map((y) => [cx - halfWidth(y), y] as const);
  const right = [...ys].reverse().map((y) => [cx + halfWidth(y), y] as const);
  return [...left, ...right];
}

/**
 * Catmull-Rom interpolation through values at 0, 1, 2… (ends held), for smooth outlines.
 * @param values - Values at whole-number positions
 * @param s - Position, 0 to values.length - 1
 * @returns The interpolated value
 */
export function spline(values: readonly number[], s: number): number {
  const last = values.length - 1;
  if (last <= 0) return values[0] ?? 0;
  const clamped = Math.max(0, Math.min(last, s));
  const i = Math.min(last - 1, Math.floor(clamped));
  const t = clamped - i;
  const p0 = values[Math.max(0, i - 1)];
  const p1 = values[i];
  const p2 = values[i + 1];
  const p3 = values[Math.min(last, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

/** A point on a limb's centre line and the limb's half-width there. */
export interface Station {
  x: number;
  y: number;
  r: number;
}

export interface LimbOptions {
  /** Part of the centre line to outline, as positions between stations (default the whole line). */
  from?: number;
  to?: number;
  /** Added to every half-width (a joint slightly fuller than the segments it joins). */
  grow?: number;
  /**
   * Round the ends: the cap's depth as a share of the half-width (1: a semicircle, a fingertip;
   * 0.4: a shallow arc, the edge of a knee). Flat when 0 or left out.
   */
  capStart?: number;
  capEnd?: number;
  samples?: number;
}

/**
 * A tapered limb, or part of one (an upper arm, a knee): a smooth band around a centre line
 * through the stations. Parts cut from the same stations share their silhouette, so a knee drawn
 * over the leg lines up with it exactly.
 * @param stations - Centre line and half-widths, in order
 * @param options - Which part, how full, and how its ends are rounded
 * @returns The outline
 */
export function limb(stations: readonly Station[], options: LimbOptions = {}): Point[] {
  const samples = options.samples ?? 20;
  const xs = stations.map((s) => s.x);
  const ys = stations.map((s) => s.y);
  const rs = stations.map((s) => s.r);
  const last = stations.length - 1;
  const from = options.from ?? 0;
  const to = options.to ?? last;
  const grow = options.grow ?? 0;
  const at = (s: number) => ({ x: spline(xs, s), y: spline(ys, s), r: spline(rs, s) + grow });
  const direction = (s: number) => {
    const e = 0.01;
    const a = at(Math.max(0, s - e));
    const b = at(Math.min(last, s + e));
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { dx: (b.x - a.x) / length, dy: (b.y - a.y) / length };
  };
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const s = from + ((to - from) * i) / samples;
    const c = at(s);
    const { dx, dy } = direction(s);
    // Normal pointing to the left of the direction of travel.
    left.push([c.x + dy * c.r, c.y - dx * c.r]);
    right.push([c.x - dy * c.r, c.y + dx * c.r]);
  }
  // An elliptical cap from one side to the other, bulging `depth × r` beyond the end.
  const cap = (s: number, depth: number, forward: boolean) => {
    const c = at(s);
    const { dx, dy } = direction(s);
    const sign = forward ? 1 : -1;
    return Array.from({ length: 11 }, (_, i) => {
      const angle = (Math.PI * (i + 1)) / 12;
      const side = Math.cos(angle) * c.r * sign;
      const ahead = Math.sin(angle) * c.r * depth * sign;
      return [c.x + dy * side + dx * ahead, c.y - dx * side + dy * ahead] as const;
    });
  };
  return [
    ...left,
    ...(options.capEnd ? cap(to, options.capEnd, true) : []),
    ...right.reverse(),
    ...(options.capStart ? cap(from, options.capStart, false) : []),
  ];
}

/**
 * Cuts a convex outline in two along a curve `y = cut(x)` that crosses it twice (a hairline across
 * a head).
 * @param polygon - The outline
 * @param cut - The curve
 * @param steps - Points along the cut
 * @returns The part above the curve and the part below
 */
export function splitByCurve(polygon: Polygon, cut: (x: number) => number, steps = 12): [Point[], Point[]] {
  const side = (p: Point) => p[1] - cut(p[0]) < 0;
  const start = polygon.findIndex(side);
  if (start < 0) return [[], [...polygon]];
  const ring = [...polygon.slice(start), ...polygon.slice(0, start)];
  const above: Point[] = [];
  const below: Point[] = [];
  const crossings: Point[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    (side(a) ? above : below).push(a);
    if (side(a) === side(b)) return;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 32; k++) {
      const mid = (lo + hi) / 2;
      const p: Point = [a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid];
      if (side(p) === side(a)) lo = mid;
      else hi = mid;
    }
    const p: Point = [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo];
    crossings.push(p);
    (side(a) ? above : below).push(p);
    (side(a) ? below : above).push(p);
  });
  if (crossings.length !== 2) return [above, below];
  const [down, up] = crossings;
  const along = (fromX: number, toX: number) =>
    Array.from({ length: steps - 1 }, (_, i) => {
      const x = fromX + ((toX - fromX) * (i + 1)) / steps;
      return [x, cut(x)] as const;
    });
  const at = above.indexOf(down);
  above.splice(at + 1, 0, ...along(down[0], up[0]));
  below.push(...along(up[0], down[0]));
  return [above, below];
}

/**
 * A quadratic Bézier curve as points.
 * @param from - Start
 * @param control - Control point
 * @param to - End
 * @param steps - Segments
 * @returns Points from start to end
 */
export function curve(from: Point, control: Point, to: Point, steps = 12): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [u * u * from[0] + 2 * u * t * control[0] + t * t * to[0], u * u * from[1] + 2 * u * t * control[1] + t * t * to[1]] as const;
  });
}

/**
 * A polygon reflected across a vertical line.
 * @param polygon - Outline
 * @param axis - x of the mirror line
 * @returns The reflected outline (same winding on screen)
 */
export function mirrorX(polygon: Polygon, axis: number): Point[] {
  return [...polygon].reverse().map(([x, y]) => [2 * axis - x, y] as const);
}

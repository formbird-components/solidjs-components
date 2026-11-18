import { describe, expect, it } from 'vitest';
import { bounds, ellipse, limb, mirrorX, pathData, pointInPolygon, shapeAt, spline, splitByCurve, visibleCentre, type Point } from '../src/geometry';

const square = (x: number, y: number, size: number): Point[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

/** Area of a simple polygon (shoelace). */
const area = (polygon: readonly Point[]) =>
  Math.abs(polygon.reduce((sum, [x, y], i) => {
    const [nx, ny] = polygon[(i + 1) % polygon.length];
    return sum + x * ny - nx * y;
  }, 0)) / 2;

describe('geometry', () => {
  it('tests points against convex and concave polygons', () => {
    expect(pointInPolygon([5, 5], square(0, 0, 10))).toBe(true);
    expect(pointInPolygon([15, 5], square(0, 0, 10))).toBe(false);
    const ell: Point[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
    expect(pointInPolygon([2, 8], ell)).toBe(true);
    expect(pointInPolygon([8, 8], ell)).toBe(false);
  });

  it('hit-tests shapes like the browser does: the last drawn wins', () => {
    const shapes = [
      { name: 'under', polygons: [square(0, 0, 10)] },
      { name: 'over', polygons: [square(5, 5, 10)] },
    ];
    expect(shapeAt(shapes, [2, 2])).toBe('under');
    expect(shapeAt(shapes, [7, 7])).toBe('over');
    expect(shapeAt(shapes, [20, 20])).toBeUndefined();
  });

  it('finds a centre on the visible part of a partly covered shape', () => {
    const shapes = [
      { name: 'under', polygons: [square(0, 0, 10)] },
      { name: 'over', polygons: [square(0, 0, 10).map(([x, y]) => [x + 3, y] as Point)] },
    ];
    const centre = visibleCentre(shapes, 'under')!;
    expect(shapeAt(shapes, centre)).toBe('under');
    expect(centre[0]).toBeLessThan(3);
    expect(visibleCentre(shapes, 'missing')).toBeUndefined();
  });

  it('builds smooth outlines: ellipses, limbs with caps, splits along a curve', () => {
    const oval = ellipse(0, 0, 10, 5, 0, 200);
    expect(area(oval)).toBeCloseTo(Math.PI * 50, 0);
    const box = bounds([limb([{ x: 0, y: 0, r: 4 }, { x: 0, y: 20, r: 2 }], { capEnd: 1 })]);
    expect(box.minX).toBeCloseTo(-4);
    expect(box.maxX).toBeCloseTo(4);
    expect(box.maxY).toBeCloseTo(22, 0); // the rounded end reaches one radius past the last station
    const flat = bounds([limb([{ x: 0, y: 0, r: 4 }, { x: 0, y: 20, r: 2 }])]);
    expect(flat.maxY).toBeCloseTo(20);
    const [top, bottom] = splitByCurve(ellipse(0, 0, 10, 10, 0, 120), (x) => 2 + x * x * 0.01);
    expect(area(top) + area(bottom)).toBeCloseTo(area(ellipse(0, 0, 10, 10, 0, 120)), 0);
    expect(top.every(([, y]) => y <= 3.1)).toBe(true);
    expect(bottom.every(([, y]) => y >= 1.9)).toBe(true);
  });

  it('interpolates through its values and mirrors outlines', () => {
    expect(spline([0, 10, 4], 0)).toBe(0);
    expect(spline([0, 10, 4], 1)).toBe(10);
    expect(spline([0, 10, 4], 2)).toBe(4);
    expect(spline([0, 10, 4], 9)).toBe(4);
    expect(mirrorX([[1, 2], [3, 4]], 10)).toEqual([[17, 4], [19, 2]]);
    expect(pathData([[[0, 0], [1.25, 2], [3, 0.04]]])).toBe('M0 0L1.3 2L3 0Z');
  });
});

import { describe, expect, it } from 'vitest';
import { firstPoint, firstPolygon, insideRing, pointValue, polygonValue, toCollection } from '../src/geo';

describe('GeoJSON as Formbird stores it', () => {
  it('reads collections, features, geometries and lat/lng objects', () => {
    expect(firstPoint(pointValue([151.196, -33.9105]))).toEqual([151.196, -33.9105]);
    expect(firstPoint({ type: 'Feature', geometry: { type: 'Point', coordinates: ['151.2', '-33.8'] } })).toEqual([151.2, -33.8]);
    expect(firstPoint({ type: 'Point', coordinates: [151, -33] })).toEqual([151, -33]);
    expect(firstPoint({ lat: -33.8, lng: 151.2 })).toEqual([151.2, -33.8]);
    expect(firstPoint({ features: [{ type: 'Feature', properties: { suburb: 'Alexandria' }, geometry: null }] })).toBeUndefined();
    expect(toCollection(null)).toBeUndefined();
  });

  it('closes polygons and tests points inside them', () => {
    const value = polygonValue([
      [151.19, -33.91],
      [151.2, -33.91],
      [151.2, -33.9],
      [151.19, -33.9],
    ]);
    const ring = firstPolygon(value)!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(insideRing([151.195, -33.905], ring)).toBe(true);
    expect(insideRing([151.21, -33.905], ring)).toBe(false);
  });
});

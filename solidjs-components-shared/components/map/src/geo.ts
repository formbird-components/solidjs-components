// GeoJSON in the shape Formbird stores locations: a FeatureCollection whose first feature holds a
// Point (an address, a vehicle's last position) or a Polygon (a site's boundary). fieldtec-web's
// AddressPreprocessor and its Elasticsearch mapping (`*geometry` → geo_shape) expect this shape.

/** [longitude, latitude], GeoJSON order. */
export type LonLat = [number, number];

export interface GeoGeometry {
  type: string;
  coordinates: unknown;
}

export interface GeoFeature {
  type: 'Feature';
  geometry: GeoGeometry | null;
  properties?: Record<string, unknown>;
}

export interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Whether a pair is a usable longitude/latitude.
 * @param value - Candidate pair
 * @returns True for [lon, lat] within range
 */
export function isLonLat(value: unknown): value is LonLat {
  return Array.isArray(value) && isNumber(value[0]) && isNumber(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

/**
 * Reads what a document stores for a location into a FeatureCollection. Accepts a
 * FeatureCollection, a Feature, a bare geometry, or `{ lat, lng }` / `{ latitude, longitude }`.
 * Coordinates stored as strings (CSV imports) are converted, as fieldtec-web's preprocessor does.
 * @param value - Stored value
 * @returns The collection, or undefined when there is no usable geometry
 */
export function toCollection(value: unknown): GeoCollection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  let features: GeoFeature[] = [];
  if (v.type === 'FeatureCollection' || Array.isArray(v.features)) features = (v.features as GeoFeature[]) ?? [];
  else if (v.type === 'Feature') features = [v as unknown as GeoFeature];
  else if (typeof v.type === 'string' && 'coordinates' in v) features = [{ type: 'Feature', geometry: v as unknown as GeoGeometry }];
  else {
    const lat = Number(v.lat ?? v.latitude);
    const lng = Number(v.lng ?? v.lon ?? v.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) features = [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] } }];
  }
  const usable = features
    .filter((f) => f && f.geometry && typeof f.geometry.type === 'string')
    .map((f) => ({ ...f, type: 'Feature' as const, geometry: { ...f.geometry!, coordinates: numeric(f.geometry!.coordinates) } }));
  return usable.length ? { type: 'FeatureCollection', features: usable } : undefined;
}

const numeric = (coordinates: unknown): unknown =>
  Array.isArray(coordinates) ? coordinates.map((c) => (typeof c === 'string' ? Number(c) : numeric(c))) : coordinates;

/**
 * The first point of a stored location.
 * @param value - Stored value
 * @returns [lon, lat], or undefined
 */
export function firstPoint(value: unknown): LonLat | undefined {
  const point = toCollection(value)?.features.find((f) => f.geometry?.type === 'Point')?.geometry?.coordinates;
  return isLonLat(point) ? [point[0], point[1]] : undefined;
}

/**
 * The first polygon's outer ring.
 * @param value - Stored value
 * @returns Ring of [lon, lat] (closed), or undefined
 */
export function firstPolygon(value: unknown): LonLat[] | undefined {
  const rings = toCollection(value)?.features.find((f) => f.geometry?.type === 'Polygon')?.geometry?.coordinates;
  const ring = Array.isArray(rings) ? rings[0] : undefined;
  return Array.isArray(ring) && ring.length >= 4 && ring.every(isLonLat) ? (ring as LonLat[]) : undefined;
}

/**
 * The properties of the first feature (address parts, label, when a position was recorded…).
 * @param value - Stored value
 * @returns Properties, or {}
 */
export function featureProperties(value: unknown): Record<string, unknown> {
  return toCollection(value)?.features[0]?.properties ?? {};
}

/**
 * A point location as Formbird stores it.
 * @param point - [lon, lat]
 * @param properties - Feature properties (label, address parts...)
 * @returns FeatureCollection
 */
export function pointValue(point: LonLat, properties: Record<string, unknown> = {}): GeoCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [round6(point[0]), round6(point[1])] }, properties }],
  };
}

/**
 * An area as Formbird stores it.
 * @param ring - Outer ring of [lon, lat]; closed automatically
 * @param properties - Feature properties
 * @returns FeatureCollection
 */
export function polygonValue(ring: LonLat[], properties: Record<string, unknown> = {}): GeoCollection {
  const points = ring.map(([x, y]) => [round6(x), round6(y)] as LonLat);
  const [first, last] = [points[0], points[points.length - 1]];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) points.push([first[0], first[1]]);
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [points] }, properties }] };
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * "-33.910500, 151.196000" (latitude first, as people read coordinates).
 * @param point - [lon, lat]
 * @returns Text
 */
export function formatLonLat(point: LonLat): string {
  return `${point[1].toFixed(5)}, ${point[0].toFixed(5)}`;
}

/**
 * Great-circle distance in km.
 * @param a - [lon, lat]
 * @param b - [lon, lat]
 * @returns Kilometres
 */
export function distanceKm(a: LonLat, b: LonLat): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Whether a point lies inside a ring (ray casting; fine at city scale).
 * @param point - [lon, lat]
 * @param ring - Polygon outer ring
 * @returns True when inside
 */
export function insideRing(point: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

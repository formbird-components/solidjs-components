// Helpers for generating an app's demo records: a seeded random generator, company wall-clock time
// relative to "now" (so every seed tells the same story relative to the day it runs), GeoJSON in
// the shape Formbird stores locations, and app documents and lookup values.

import { header, related } from './documents.mjs';
import { LOOKUP_FIELDS, STATUS_FIELDS } from './form-parts.mjs';

/**
 * Deterministic random numbers (mulberry32).
 * @param {number} seed
 */
export function random(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    /** A value from `[value, weight]` pairs. */
    weighted: (pairs) => {
      const total = pairs.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, w] of pairs) if ((roll -= w) < 0) return value;
      return pairs[pairs.length - 1][0];
    },
  };
}

/** Minutes the time zone is ahead of UTC at an instant. */
export function zoneOffset(time, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(time))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(time / 1000) * 1000) / 60_000);
}

/**
 * Company wall-clock time around "now".
 * @param {{ now: number, timeZone: string }} o - now in ms
 * @returns {{ at: (dayOffset: number, hour?: number, minute?: number) => number, weekday: (dayOffset: number) => boolean }}
 *   `at`: the instant of a wall-clock time `dayOffset` days from today there; `weekday`: Monday to Friday
 */
export function companyClock({ now, timeZone }) {
  const offset = zoneOffset(now, timeZone);
  const local = new Date(now + offset * 60_000);
  const today = { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() };
  return {
    at(dayOffset, hour = 9, minute = 0) {
      const guess = Date.UTC(today.y, today.m, today.d + dayOffset, hour, minute);
      return guess - zoneOffset(guess, timeZone) * 60_000;
    },
    weekday(dayOffset) {
      const day = new Date(Date.UTC(today.y, today.m, today.d + dayOffset)).getUTCDay();
      return day !== 0 && day !== 6;
    },
  };
}

export const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const iso = (time) => new Date(time).toISOString();

/** A point as Formbird stores a location: a FeatureCollection with one Point feature. */
export const pointGeo = ([lon, lat], properties = {}) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties }] });
/** A boundary: a FeatureCollection with one Polygon (a closed ring of [lon, lat]). */
export const polygonGeo = (ring, properties = {}) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties }] });
/** A closed rectangular ring around a point. */
export const boxRing = ([lon, lat], w = 0.0016, h = 0.0011) => [
  [lon - w, lat - h], [lon + w, lat - h], [lon + w, lat + h], [lon - w, lat + h], [lon - w, lat - h],
];

/**
 * The app's documents: each tagged `appTags: [app, kind]` with a stable id from its kind and name,
 * plus lookup and status values (one document per value, stored on records as a related value).
 * @param {{ set: { add: (doc: object) => object }, app: string, idOf: (kind: string, name: string) => string, at: Date, by: string }} o
 *   - the DocumentSet, the app tag, the app's idFactory, and when and by whom setup documents were made
 */
export function appDocuments({ set, app, idOf, at, by }) {
  /**
   * Adds an app document.
   * @param {string} kind
   * @param {string} templateId
   * @param {string} summaryName
   * @param {Record<string, unknown>} fields
   * @param {{ id?: string, created?: Date | number, by?: string }} [options]
   */
  const doc = (kind, templateId, summaryName, fields, { id = idOf(kind, summaryName), created = at, by: author = by } = {}) =>
    set.add({
      documentId: id,
      systemHeader: header({ systemType: 'document', templateId, summaryName, at: created, by: author }),
      appTags: [app, kind],
      ...fields,
    });

  /**
   * Status values: `[name, color, category]` in order → `{ [name]: related value }`.
   * @param {string} kind
   * @param {string} templateId
   * @param {[string, string, string][]} list
   */
  const statusValues = (kind, templateId, list) =>
    Object.fromEntries(
      list.map(([name, color, category], i) => {
        const d = doc(kind, templateId, name, { nameId: name, indexNum: (i + 1) * 10, color, statusCategory: category, inactiveBool: false });
        return [name, related(d, STATUS_FIELDS)];
      }),
    );

  /**
   * Lookup values in order → `{ [name]: related value }`.
   * @param {string} kind
   * @param {string} templateId
   * @param {string[]} names
   * @param {(name: string, i: number) => Record<string, unknown>} [extra] - More fields per value
   * @param {Record<string, string>} [relatedFields] - What records store besides documentId and name
   */
  const lookupValues = (kind, templateId, names, extra = () => ({}), relatedFields = LOOKUP_FIELDS) =>
    Object.fromEntries(
      names.map((name, i) => {
        const d = doc(kind, templateId, name, { nameId: name, indexNum: (i + 1) * 10, inactiveBool: false, ...extra(name, i) });
        return [name, related(d, relatedFields)];
      }),
    );

  return { doc, statusValues, lookupValues };
}

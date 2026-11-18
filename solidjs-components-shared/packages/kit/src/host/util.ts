/**
 * Reads a dot path (`a.b.0.c`) from an object.
 * @param source - Object to read from
 * @param path - Dot-separated path; numeric segments index arrays
 * @returns The value, or undefined when any segment is missing
 */
export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Every value at a dot path, stepping through arrays at any level, the way Elasticsearch and
 * sc-datatables read `assigneeRel.name` from `[{ name: 'A' }, { name: 'B' }]`.
 * @param source - Object to read from
 * @param path - Dot-separated path; numeric segments index arrays
 * @returns The values found, flattened, without null, undefined or empty strings
 * @example
 * ```ts
 * pathValues({ tagsRel: [{ name: 'ios' }, { name: 'ux' }] }, 'tagsRel.name'); // ['ios', 'ux']
 * ```
 */
export function pathValues(source: unknown, path: string): unknown[] {
  let current: unknown[] = [source];
  for (const segment of path.split('.')) {
    const next: unknown[] = [];
    const step = (value: unknown) => {
      if (value === null || typeof value !== 'object') return;
      const child = (value as Record<string, unknown>)[segment];
      if (child !== undefined) next.push(child);
    };
    for (const value of current) {
      if (Array.isArray(value) && !/^\d+$/.test(segment)) value.forEach(step);
      else step(value);
    }
    current = next;
  }
  return current.flat().filter((value) => value !== null && value !== undefined && value !== '');
}

/**
 * Structural equality for JSON-like values (what Formbird documents hold).
 * @param a - First value
 * @param b - Second value
 * @returns True when both values have the same JSON structure
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  const aKeys = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bKeys = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Deep-clones JSON-like data (filters set by rulesets are shared objects; never mutate them).
 * @param value - Value to clone
 * @returns A structural copy
 */
export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Lower-cases and strips accents so "Résolu" matches "resolu". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Up to two initials for an avatar.
 * @param name - Display name or email
 * @returns Upper-case initials, or "?" when the name is empty
 */
export function initials(name: string | undefined): string {
  const clean = (name ?? '').replace(/@.*/, '').replace(/[._-]+/g, ' ').trim();
  if (!clean) return '?';
  const words = clean.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [words[0][0], words[0][1] ?? ''];
  return letters.join('').toUpperCase();
}

/**
 * Stable hash of a string, used to pick avatar and tag colours.
 * @param text - Input text
 * @returns A non-negative 32-bit integer
 */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Returns a function that delays calls until `ms` has passed without another call.
 * @param fn - Function to debounce
 * @param ms - Quiet period in milliseconds
 * @returns The debounced function, with `cancel()`
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => timer && clearTimeout(timer);
  return debounced;
}

/**
 * Looks up a definition map keyed by display name (`{ "Won't Fix": ... }`), exact first,
 * then case-insensitive.
 * @param map - Map keyed by name
 * @param name - Name to find
 * @returns The value, or undefined
 */
export function findByName<T>(map: Record<string, T> | undefined, name: string): T | undefined {
  if (!map) return undefined;
  if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
  const lower = name.toLowerCase();
  const key = Object.keys(map).find((k) => k.toLowerCase() === lower);
  return key === undefined ? undefined : map[key];
}

/** Short unique id for DOM ids and Formbird control names. */
export function uid(prefix = 'sj'): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random.replace(/-/g, '').slice(0, 10)}`;
}

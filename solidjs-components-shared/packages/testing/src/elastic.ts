/**
 * Minimal in-memory Elasticsearch evaluator: enough of the query DSL that Formbird filters use
 * (bool must/filter/should/must_not, term, terms, wildcard, match, exists, range, match_all,
 * query_string, sort), so filters copied from real templates run unchanged against fixtures.
 */

type Doc = Record<string, unknown>;
type Clause = Record<string, unknown>;

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

/** All values at a dotted path, flattening arrays (so `projectRel.documentId` matches any entry). */
export function valuesAt(doc: unknown, field: string): unknown[] {
  let path = field.replace(/\.keyword$/, '');
  const lowerCase = path.endsWith('.lcase');
  if (lowerCase) path = path.slice(0, -'.lcase'.length);
  let current: unknown[] = [doc];
  for (const segment of path.split('.')) {
    current = current.flatMap((value) =>
      value && typeof value === 'object' ? asArray((value as Record<string, unknown>)[segment]) : [],
    );
  }
  const flat = current.flatMap((value) => asArray(value));
  return lowerCase ? flat.map((value) => (typeof value === 'string' ? value.toLowerCase() : value)) : flat;
}

const equal = (a: unknown, b: unknown) => a === b || String(a) === String(b);

/** A Lucene wildcard pattern as a RegExp: `*` and `?` are wildcards, `\x` is a literal x. */
function wildcardRegex(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) source += pattern[++i].replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
    else if (c === '*') source += '.*';
    else if (c === '?') source += '.';
    else source += c.replace(/[.+^${}()|[\]\\/-]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'is');
}

const firstEntry = (body: unknown): [string, unknown] => Object.entries((body ?? {}) as Record<string, unknown>)[0] ?? ['', undefined];

/**
 * Whether a document matches a query clause.
 * @param doc - Document
 * @param clause - Query clause
 * @returns True on match; unknown clause types match everything
 */
export function matches(doc: Doc, clause: unknown): boolean {
  if (!clause || typeof clause !== 'object') return true;
  const [type, body] = firstEntry(clause);
  switch (type) {
    case 'bool':
      return matchesBool(doc, body as Clause);
    case 'match_all':
      return true;
    case 'term': {
      const [field, raw] = firstEntry(body);
      const value = raw && typeof raw === 'object' && 'value' in raw ? (raw as { value: unknown }).value : raw;
      return valuesAt(doc, field).some((v) => equal(v, value));
    }
    case 'terms': {
      const [field, list] = firstEntry(body);
      const wanted = asArray(list);
      return valuesAt(doc, field).some((v) => wanted.some((w) => equal(v, w)));
    }
    case 'wildcard': {
      const [field, raw] = firstEntry(body);
      const pattern = raw && typeof raw === 'object' && 'value' in raw ? String((raw as { value: unknown }).value) : String(raw);
      const regex = wildcardRegex(pattern);
      return valuesAt(doc, field).some((v) => regex.test(String(v)));
    }
    case 'match':
    case 'match_phrase': {
      const [field, raw] = firstEntry(body);
      const text = String(raw && typeof raw === 'object' && 'query' in raw ? (raw as { query: unknown }).query : raw).toLowerCase();
      return valuesAt(doc, field).some((v) => String(v).toLowerCase().includes(text));
    }
    case 'exists':
      return valuesAt(doc, String((body as { field?: string })?.field ?? '')).length > 0;
    case 'query_string':
    case 'simple_query_string': {
      // Enough for search boxes: words (wildcards and escapes dropped) matched as substrings of the
      // listed fields (boosts ignored); OR by default, AND with default_operator AND.
      const q = (body ?? {}) as { query?: unknown; fields?: string[]; default_operator?: string };
      const words = String(q.query ?? '')
        .replace(/\\(.)/g, '$1')
        .split(/\s+/)
        .map((word) => word.replace(/^\*+|\*+$/g, '').toLowerCase())
        .filter(Boolean);
      if (!words.length) return true;
      const texts = (q.fields?.length ? q.fields : ['systemHeader.summaryName'])
        .flatMap((field) => valuesAt(doc, field.replace(/\^[\d.]+$/, '')))
        .map((value) => String(value).toLowerCase());
      const found = (word: string) => texts.some((text) => text.includes(word));
      return String(q.default_operator).toUpperCase() === 'AND' ? words.every(found) : words.some(found);
    }
    case 'range': {
      const [field, bounds] = firstEntry(body);
      const raw = (bounds ?? {}) as Record<string, unknown>;
      // Date math ("now", "now+14d/d", "now-1h") resolves to an ISO string, as Elasticsearch does.
      const b = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('now') ? dateMath(v) : v]));
      // Numbers compare numerically; anything else (ISO dates) compares as strings.
      const compare = (v: unknown, bound: unknown) =>
        typeof v === 'number' && typeof bound === 'number' ? v - bound : String(v).localeCompare(String(bound));
      return valuesAt(doc, field).some((v) => {
        if (b.gte !== undefined && compare(v, b.gte) < 0) return false;
        if (b.gt !== undefined && compare(v, b.gt) <= 0) return false;
        if (b.lte !== undefined && compare(v, b.lte) > 0) return false;
        if (b.lt !== undefined && compare(v, b.lt) >= 0) return false;
        return true;
      });
    }
    default:
      return true;
  }
}

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000 };

/**
 * Resolves Elasticsearch date math relative to now: "now", "now+14d", "now-1h/h", "now/d".
 * Rounding (`/d`, `/h`) rounds down in the browser's time zone.
 * @param expression - Date math
 * @param now - Reference time (tests)
 * @returns ISO string
 */
export function dateMath(expression: string, now: number = Date.now()): string {
  const match = /^now(?:([+-])(\d+)([smhdw]))?(?:\/([smhdw]))?$/.exec(expression.trim());
  if (!match) return expression;
  const [, sign, amount, unit, round] = match;
  let time = now + (sign ? (sign === '-' ? -1 : 1) * Number(amount) * UNIT_MS[unit] : 0);
  if (round) {
    const date = new Date(time);
    if (round === 'd' || round === 'w') date.setHours(0, 0, 0, 0);
    else if (round === 'h') date.setMinutes(0, 0, 0);
    else if (round === 'm') date.setSeconds(0, 0);
    time = date.getTime();
  }
  return new Date(time).toISOString();
}

function matchesBool(doc: Doc, bool: Clause): boolean {
  if (!asArray(bool.must).every((c) => matches(doc, c))) return false;
  if (!asArray(bool.filter).every((c) => matches(doc, c))) return false;
  if (asArray(bool.must_not).some((c) => matches(doc, c))) return false;
  const should = asArray(bool.should);
  if (!should.length) return true;
  const defaultMinimum = bool.must !== undefined || bool.filter !== undefined ? 0 : 1;
  const minimum = Number(bool.minimum_should_match ?? defaultMinimum);
  return should.filter((c) => matches(doc, c)).length >= minimum;
}

/**
 * Sorts documents by an Elasticsearch `sort` array (`[{ field: 'asc' }, { field: { order } }]`).
 * @param docs - Documents (not mutated)
 * @param sort - Sort clauses
 * @returns Sorted copy
 */
export function sortDocs(docs: Doc[], sort: unknown): Doc[] {
  const keys = asArray(sort).map((entry) => {
    if (typeof entry === 'string') return { field: entry, desc: false };
    const [field, spec] = firstEntry(entry);
    const order = typeof spec === 'string' ? spec : (spec as { order?: string })?.order;
    return { field, desc: order === 'desc' };
  });
  if (!keys.length) return [...docs];
  return [...docs].sort((a, b) => {
    for (const { field, desc } of keys) {
      const av = valuesAt(a, field)[0];
      const bv = valuesAt(b, field)[0];
      if (av === bv) continue;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      const result =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      if (result !== 0) return desc ? -result : result;
    }
    return 0;
  });
}

/**
 * Copies only the requested source fields, like Elasticsearch `_source` filtering.
 * @param doc - Document
 * @param include - Dotted paths to keep
 * @returns The filtered document
 */
export function pickSource(doc: Doc, include?: string[]): Doc {
  if (!include?.length) return structuredClone(doc);
  const out: Doc = {};
  for (const path of include) {
    const segments = path.split('.');
    let source: unknown = doc;
    let target: Doc = out;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!source || typeof source !== 'object' || !(segment in (source as Doc))) break;
      const value = (source as Doc)[segment];
      if (i === segments.length - 1 || Array.isArray(value) || typeof value !== 'object' || value === null) {
        target[segment] = structuredClone(value);
        break;
      }
      target[segment] = (target[segment] as Doc) ?? {};
      target = target[segment] as Doc;
      source = value;
    }
  }
  return out;
}

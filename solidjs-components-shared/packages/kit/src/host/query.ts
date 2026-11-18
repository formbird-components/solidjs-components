import { renderTemplate } from './template';
import type { RelatedDoc, SourceDocument } from './types';
import { cloneJson, getPath } from './util';

/** An Elasticsearch request body as Formbird filters write it. */
export interface EsRequest {
  query?: Record<string, unknown>;
  sort?: unknown[];
  [key: string]: unknown;
}

/**
 * Turns a component definition `filter` into a request object.
 *
 * Accepts both forms found in Formbird apps: a template string with single quotes and Handlebars
 * (what templates store), and an object (what rulesets pass to `ntf.scope.setFilter`).
 * @param filter - The definition's filter
 * @param context - Handlebars context (document, template, account, componentDefinition)
 * @returns A fresh request object, or undefined when there is no usable filter
 * @throws {Error} When a string filter is not valid JSON after rendering
 */
export function parseFilter(filter: unknown, context: Record<string, unknown>): EsRequest | undefined {
  if (!filter) return undefined;
  if (typeof filter === 'object') return cloneJson(filter as EsRequest);
  if (typeof filter !== 'string') return undefined;
  const rendered = renderTemplate(filter, context).trim();
  if (!rendered) return undefined;
  try {
    return JSON.parse(rendered.replace(/'/g, '"')) as EsRequest;
  } catch (error) {
    throw new Error(`Invalid filter JSON: ${(error as Error).message}`);
  }
}

function boolOf(request: EsRequest): Record<string, unknown> {
  request.query ??= { bool: {} };
  const query = request.query as Record<string, unknown>;
  if (!query.bool) {
    // Wrap a non-bool query so extra clauses can be added without changing its meaning.
    request.query = { bool: { must: [query] } };
  }
  return (request.query as { bool: Record<string, unknown> }).bool;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/**
 * Adds a type-ahead clause on `systemHeader.summaryName.lcase`, like sc-related-document,
 * replacing any previous wildcard on that field.
 * @param request - Request to change (mutated)
 * @param text - Text typed by the user
 * @returns The same request
 */
export function withTextSearch(request: EsRequest, text: string): EsRequest {
  const term = text.trim().toLowerCase();
  if (!term) return request;
  const bool = boolOf(request);
  const must = asArray(bool.must).filter((clause) => {
    const wildcard = (clause as { wildcard?: Record<string, unknown> }).wildcard;
    return !(wildcard && 'systemHeader.summaryName.lcase' in wildcard);
  });
  must.push({ wildcard: { 'systemHeader.summaryName.lcase': `*${term}*` } });
  bool.must = must;
  return request;
}

/**
 * Adds a clause every result must also match, without disturbing the filter's own
 * `should`/`minimum_should_match` semantics.
 * @param request - Request to change (mutated)
 * @param clause - Elasticsearch clause
 * @returns The same request
 */
export function withRequiredClause(request: EsRequest, clause: Record<string, unknown>): EsRequest {
  const bool = boolOf(request);
  bool.filter = [...asArray(bool.filter), clause];
  return request;
}

/**
 * Pulls source documents out of whatever the host's search returned
 * (`{ data: { hits } }`, `{ hits }`, or an array, depending on the provider).
 * @param results - Raw search result
 * @returns The documents
 */
export function extractHits(results: unknown): SourceDocument[] {
  interface HitList {
    hits?: { hits?: unknown[] };
  }
  const r = results as (HitList & { data?: HitList | unknown[] }) | unknown[] | null | undefined;
  let hits: unknown[] = [];
  if (Array.isArray(r)) hits = r;
  else if (Array.isArray(r?.data)) hits = r.data;
  else if (r?.data?.hits?.hits) hits = r.data.hits.hits;
  else if (r?.hits?.hits) hits = r.hits.hits;
  return hits.map((hit) =>
    hit && typeof hit === 'object' && '_source' in hit ? (hit as { _source: SourceDocument })._source : (hit as SourceDocument),
  );
}

/**
 * The total hit count of a search result. fieldtec-web returns it as a number by default
 * (`convertTotalToES2Format`), Elasticsearch 7+ as `{ value }`.
 * @param results - Raw search result
 * @returns The total, or undefined when the result doesn't carry one
 */
export function extractTotal(results: unknown): number | undefined {
  interface HitList {
    hits?: { total?: number | { value?: number } };
  }
  const r = results as (HitList & { data?: HitList }) | null | undefined;
  const total = r?.data?.hits?.total ?? r?.hits?.total;
  const value = typeof total === 'object' && total !== null ? total.value : total;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Characters with a meaning in Elasticsearch `query_string` syntax. */
const QUERY_STRING_SYNTAX = /[+\-=&|><!(){}[\]^"~*?:\\/]/g;

/**
 * Builds the clause for text typed into a search box from a template such as sc-datatables'
 * `searchBoxFilter`: `{'query_string':{'query':'*{{{search}}}*','fields':[...]}}`.
 *
 * `search` is escaped twice over: for query_string syntax (so `C++` or `(draft)` search literally) and
 * for the template's single-quoted JSON (quotes dropped), so any input gives a valid request.
 * @param template - Clause template; `{{{search}}}` receives the text
 * @param text - What the user typed
 * @param context - Other Handlebars values (document, account...)
 * @returns The clause, or undefined when the text is empty
 * @throws {Error} When the template isn't valid JSON after rendering
 */
export function searchClause(template: string, text: string, context: Record<string, unknown> = {}): Record<string, unknown> | undefined {
  // eslint-disable-next-line no-control-regex
  const plain = text.replace(/['"\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return undefined;
  // Two backslashes in the rendered JSON become one in the parsed query: query_string's escape.
  const search = plain.replace(QUERY_STRING_SYNTAX, (c) => `\\\\${c}`);
  return parseFilter(template, { ...context, search }) as Record<string, unknown> | undefined;
}

/**
 * The display name Formbird uses for a document.
 * @param source - Document
 * @returns Its summary name, falling back to `name`, then "Document <id>"
 */
export function documentName(source: SourceDocument): string {
  const summary = getPath(source, 'systemHeader.summaryName');
  if (typeof summary === 'string' && summary) return summary;
  if (typeof source.name === 'string' && source.name) return source.name;
  return `Document ${source.documentId ?? ''}`.trim();
}

/**
 * Builds the stored value for a selected document, exactly as sc-related-document does:
 * `{ documentId, name, ...relatedFields }`.
 * @param source - Selected document
 * @param relatedFields - `{ storedKey: 'source.path' }`
 * @returns The value entry
 */
export function toRelatedDoc(source: SourceDocument, relatedFields?: Record<string, string>): RelatedDoc {
  const entry: RelatedDoc = { documentId: String(source.documentId ?? ''), name: documentName(source) };
  for (const [key, path] of Object.entries(relatedFields ?? {})) {
    entry[key] = getPath(source, path) ?? null;
  }
  return entry;
}

/**
 * Normalises a related-document field value to an array of entries.
 * @param value - Raw field value
 * @returns Entries with a documentId
 */
export function toRelatedList(value: unknown): RelatedDoc[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is RelatedDoc => !!v && typeof v === 'object' && typeof (v as RelatedDoc).documentId === 'string');
}

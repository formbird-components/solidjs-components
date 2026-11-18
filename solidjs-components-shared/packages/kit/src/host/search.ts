import { extractHits, extractTotal, type EsRequest } from './query';
import { getService } from './services';
import type { SourceDocument } from './types';

export interface SearchParams {
  /** Elasticsearch request body (already rendered, see parseFilter). */
  request: EsRequest;
  /** Type-ahead text, passed through like sc-related-document does. */
  text?: string;
  pageSize?: number;
  /** Source fields to return; the host returns whole documents when omitted. */
  include?: string[];
}

export interface PageParams extends SearchParams {
  /** Zero-based page; the server reads `from = page * pageSize`. */
  page: number;
  /** Ask Elasticsearch for an exact total beyond 10,000 hits. */
  trackTotal?: boolean;
}

export interface SearchPage {
  documents: SourceDocument[];
  /** Total matching documents across all pages. */
  total: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; result: Promise<SourceDocument[]> }>();

/** Options for SearchClientService.search, as fieldtec-web's own components pass them. */
function searchOptions(params: SearchParams, page = 0): Record<string, unknown> {
  const options: Record<string, unknown> = {
    filter: params.request,
    text: params.text ?? '',
    page,
    pageSize: params.pageSize ?? 50,
    from: null,
  };
  if (params.include) options.sourceFilter = { include: params.include };
  return options;
}

/**
 * Searches through the host's SearchClientService (Elasticsearch online, IndexedDB offline).
 *
 * Identical requests within 30 s share one round trip, so several fields pointing at the same
 * lookup (or a picker opened twice) don't query again.
 * @param params - Request and paging
 * @returns The matching documents
 */
export function searchDocuments(params: SearchParams): Promise<SourceDocument[]> {
  const service = getService('SearchClientService');
  if (!service) return Promise.resolve([]);

  const options = searchOptions(params);
  const key = JSON.stringify(options);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.result;

  const result = Promise.resolve(service.search(options)).then(extractHits);
  cache.set(key, { at: now, result });
  result.catch(() => cache.delete(key));
  return result;
}

/**
 * One page of results with the total, for lists and tables. Never cached: a list shown after
 * saving a document must include the change.
 * @param params - Request, page and page size
 * @returns The page's documents and the total across pages
 */
export async function searchPage(params: PageParams): Promise<SearchPage> {
  const service = getService('SearchClientService');
  if (!service) return { documents: [], total: 0 };
  const options = searchOptions(params, params.page);
  if (params.trackTotal) options.trackTotalHits = true;
  const result = await service.search(options);
  const documents = extractHits(result);
  return { documents, total: extractTotal(result) ?? params.page * (params.pageSize ?? 50) + documents.length };
}

/** Drops cached search results (after creating or editing lookup documents). */
export function clearSearchCache(): void {
  cache.clear();
}

/**
 * Current versions of documents by id (uncached: a form wants what is saved now).
 * @param documentIds - Ids to load
 * @param include - Source fields to return (default: whole documents)
 * @returns The documents found, in no particular order
 */
export async function fetchDocuments(documentIds: string[], include?: string[]): Promise<SourceDocument[]> {
  const ids = [...new Set(documentIds.filter(Boolean))];
  if (!ids.length) return [];
  const { documents } = await searchPage({
    request: { query: { bool: { filter: [{ terms: { documentId: ids } }] } } },
    page: 0,
    pageSize: ids.length,
    include: include ? ['documentId', ...include] : undefined,
  });
  return documents;
}

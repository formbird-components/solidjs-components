import { createSignal, untrack, type Accessor } from 'solid-js';
import { searchDocuments, type SearchParams } from './search';
import type { SourceDocument } from './types';
import { debounce } from './util';

export interface SearchOptionsConfig<T> {
  /** Builds the request for the current query. Return undefined when the field has no usable filter. */
  request: (query: string) => SearchParams | undefined;
  /** Maps a search hit to an option. */
  map: (doc: SourceDocument) => T;
  debounceMs?: number;
}

export interface SearchOptions<T> {
  items: Accessor<T[]>;
  loading: Accessor<boolean>;
  /** Error text, or "no-filter" when the definition has no filter yet. */
  error: Accessor<string | undefined>;
  /** True once a request has completed, so "no results" isn't shown before the first answer. */
  loaded: Accessor<boolean>;
  query: Accessor<string>;
  setQuery(query: string): void;
  /** Loads immediately for the current query (e.g. when a picker opens). */
  load(): Promise<void>;
}

/**
 * Options for a picker, loaded from the host search with debounced type-ahead.
 * Stale responses are dropped, so fast typing never shows results for an older query.
 * @param config - How to build requests and map results
 * @returns Reactive options state
 */
export function createSearchOptions<T>(config: SearchOptionsConfig<T>): SearchOptions<T> {
  const [items, setItems] = createSignal<T[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();
  const [query, setQueryValue] = createSignal('');
  let latestQuery = '';
  let requestId = 0;

  const run = async (text: string) => {
    const id = ++requestId;
    let params: SearchParams | undefined;
    try {
      // Requests read the current definition on purpose; they are rebuilt per load, not tracked.
      params = untrack(() => config.request(text));
    } catch (err) {
      setError((err as Error).message);
      setLoaded(true);
      return;
    }
    if (!params) {
      setItems([]);
      setError('no-filter');
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const docs = await searchDocuments(params);
      if (id !== requestId) return;
      const mapped = untrack(() => docs.map(config.map));
      setItems(() => mapped);
      setError(undefined);
    } catch (err) {
      if (id === requestId) setError((err as Error)?.message || 'Search failed');
    } finally {
      if (id === requestId) {
        setLoading(false);
        setLoaded(true);
      }
    }
  };
  const debounced = debounce(run, config.debounceMs ?? 180);

  return {
    items,
    loading,
    error,
    loaded,
    query,
    setQuery(next) {
      latestQuery = next;
      setQueryValue(next);
      debounced(next);
    },
    load() {
      debounced.cancel();
      return run(latestQuery);
    },
  };
}

import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  Button,
  createFieldBinding,
  debounce,
  documentName,
  downloadText,
  followDocumentLink,
  Icon,
  IconButton,
  notify,
  openDocument,
  parseFilter,
  searchClause,
  searchDocuments,
  searchPage,
  Spinner,
  withRequiredClause,
  withTextSearch,
  type BaseDefinition,
  type ElementProps,
  type EsRequest,
  type FormbirdElementProps,
  type OpenMode,
  type SourceDocument,
} from '@solidjs-components/kit';
import {
  cellText,
  firstDirection,
  headerText,
  renderCell,
  sortClause,
  sortFieldOf,
  type Breakpoint,
  type CellContext,
  type SortDirection,
  type TableColumn,
} from './columns';
import { toCsv } from './csv';

export interface TableDefinition extends BaseDefinition {
  /** Columns, in sc-datatables' format plus the types in the README. */
  gridColumns?: TableColumn[];
  /** Rows per page. Default 10. */
  rowsPerPage?: number;
  /** Show a search box. */
  showSearch?: boolean;
  /** Clause added for the search box text (sc-datatables), `{{{search}}}` receives the text. Default: a summary-name wildcard. */
  searchBoxFilter?: string;
  searchPlaceholder?: string;
  /** `["CSV"]` adds an Export button. */
  exportTypes?: string[];
  /** Most rows an export writes. Default 2000, at most 10000. */
  exportLimit?: number;
  /** Show a reload button. */
  showReload?: boolean;
  /** Text when nothing matches. */
  emptyText?: string;
  /** Where a clicked row opens: "route" (default), "modal" or "newTab". */
  openIn?: OpenMode;
  /** `false`: rows aren't clickable (links in cells still are). */
  rowClick?: boolean;
  /** Filter listing status documents, so status columns use their colours. */
  statusFilter?: string | Record<string, unknown>;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<TableDefinition, unknown>>;

interface ActiveSort {
  index: number;
  direction: SortDirection;
}

const BREAKPOINTS: [Breakpoint, number][] = [
  ['lg', 992],
  ['md', 768],
  ['sm', 576],
];
const breakpointFor = (width: number): Breakpoint => BREAKPOINTS.find(([, min]) => width >= min)?.[0] ?? 'xs';

/** Last sort key, so pages stay stable when many rows tie on the chosen column. */
const TIE_BREAK = { documentId: { order: 'asc', unmapped_type: 'keyword' } };

const errorText = (error: unknown) =>
  typeof error === 'string' ? error : (error as Error | undefined)?.message || 'The search failed.';

/**
 * `<solid-table>`: documents matching the definition's filter, in a sortable, paged table.
 * Reads sc-datatables definitions (`filter`, `gridColumns`, `rowsPerPage`, `showSearch`,
 * `searchBoxFilter`, `exportTypes`...) and adds typed columns.
 * @param props - Formbird element properties
 */
export function Table(props: Props) {
  const field = createFieldBinding<unknown, TableDefinition>(props);
  const def = field.definition;

  const [search, setSearch] = createSignal('');
  const [query, setQuery] = createSignal('');
  const [userSort, setUserSort] = createSignal<ActiveSort>();
  const [page, setPage] = createSignal(0);
  const [rows, setRows] = createSignal<SourceDocument[]>([]);
  const [total, setTotal] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);
  const [exporting, setExporting] = createSignal(false);
  const [breakpoint, setBreakpoint] = createSignal<Breakpoint>('lg', { ownedWrite: true });
  const [statusDocs, setStatusDocs] = createSignal<ReadonlyMap<string, SourceDocument>>(new Map());

  const columns = createMemo(() => (def().gridColumns ?? []).filter((c): c is TableColumn => !!c && typeof c.field === 'string'));
  const shown = createMemo(() =>
    columns()
      .map((column, index) => ({ column, index }))
      .filter(({ column }) => column.visible !== false && column.responsive?.[breakpoint()] !== 0),
  );
  const pageSize = () => Math.max(1, Math.floor(Number(def().rowsPerPage)) || 10);
  const pages = () => Math.max(1, Math.ceil(total() / pageSize()));

  // ------------------------------------------------------------------ sorting
  const defaultSorts = createMemo(() =>
    columns()
      .map((column, index) => ({ column, index }))
      .filter(({ column }) => column.sort?.direction && sortFieldOf(column))
      .sort((a, b) => (a.column.sort?.precedence ?? 0) - (b.column.sort?.precedence ?? 0)),
  );
  const activeSort = (): ActiveSort | undefined => {
    const first = defaultSorts()[0];
    return userSort() ?? (first ? { index: first.index, direction: first.column.sort!.direction! } : undefined);
  };
  /** The request's sort: the clicked column, else the columns' `sort`, else the filter's own sort. */
  const sortOrder = (): unknown[] | undefined => {
    const user = userSort();
    const chosen = user
      ? [{ column: columns()[user.index], direction: user.direction }]
      : defaultSorts().map(({ column }) => ({ column, direction: column.sort!.direction! }));
    const clauses = chosen.map(({ column, direction }) => column && sortClause(column, direction)).filter(Boolean);
    return clauses.length ? [...clauses, TIE_BREAK] : undefined;
  };
  const toggleSort = (index: number) => {
    const current = activeSort();
    const direction = current?.index === index ? (current.direction === 'asc' ? 'desc' : 'asc') : firstDirection(columns()[index]);
    setUserSort({ index, direction });
    setPage(0);
  };

  // ------------------------------------------------------------------ data
  const buildRequest = (text: string): EsRequest | undefined => {
    const d = def();
    const context = field.templateContext();
    const request = parseFilter(d.filter, context);
    if (!request) return undefined;
    const term = text.trim();
    if (term) {
      const clause = d.searchBoxFilter ? searchClause(d.searchBoxFilter, term, context) : undefined;
      if (clause) withRequiredClause(request, clause);
      else withTextSearch(request, term);
    }
    const order = sortOrder();
    if (order) request.sort = order;
    return request;
  };

  let requestId = 0;
  const load = async () => {
    const id = ++requestId;
    let request: EsRequest | undefined;
    try {
      request = untrack(() => buildRequest(query()));
    } catch (err) {
      setError(errorText(err));
      setLoading(false);
      setLoaded(true);
      return;
    }
    if (!request) {
      setRows([]);
      setTotal(0);
      setError('This table has no filter yet.');
      setLoading(false);
      setLoaded(true);
      return;
    }
    const [current, size] = untrack(() => [page(), pageSize()] as const);
    setLoading(true);
    try {
      const result = await searchPage({ request, page: current, pageSize: size, trackTotal: true });
      if (id !== requestId) return;
      setRows(() => result.documents);
      setTotal(result.total);
      setError(undefined);
      const lastPage = Math.max(0, Math.ceil(result.total / size) - 1);
      if (current > lastPage) setPage(lastPage); // rows went away since the last load
    } catch (err) {
      if (id === requestId) setError(errorText(err));
    } finally {
      if (id === requestId) {
        setLoading(false);
        setLoaded(true);
      }
    }
  };

  // Reload when the filter (rulesets can change it), search, sort or page changes.
  createEffect(
    () =>
      JSON.stringify([
        def().filter ?? null,
        def().searchBoxFilter ?? null,
        columns().map((c) => [c.field, c.type, c.sort, c.sortField]),
        query(),
        userSort() ?? null,
        page(),
        pageSize(),
        reloads(),
      ]),
    () => void load(),
  );

  const applySearch = debounce((text: string) => {
    setPage(0);
    setQuery(text);
  }, 250);
  onCleanup(() => applySearch.cancel());

  // Status colours from the status documents, when the definition says where they are.
  createEffect(
    () => JSON.stringify(def().statusFilter ?? null),
    () => {
      let request: EsRequest | undefined;
      try {
        request = untrack(() => parseFilter(def().statusFilter, field.templateContext()));
      } catch {
        return;
      }
      if (!request) return;
      searchDocuments({ request, pageSize: 200 })
        .then((docs) => setStatusDocs(new Map(docs.map((doc) => [documentName(doc).toLowerCase(), doc]))))
        .catch(() => undefined);
    },
  );
  const cellContext: CellContext = { statusSource: (name) => statusDocs().get(name.toLowerCase()) };

  // Columns hide by the table's own width (sc-datatables' `responsive`), not the window's.
  const host = untrack(() => props.host);
  if (typeof ResizeObserver !== 'undefined' && host) {
    const observer = new ResizeObserver(([entry]) => setBreakpoint(breakpointFor(entry.contentRect.width)));
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  }

  // ------------------------------------------------------------------ actions
  const openRow = (event: MouseEvent, row: SourceDocument) => {
    if (def().rowClick === false || !row.documentId) return;
    if ((event.target as Element | null)?.closest?.('a, button, input, label, textarea, select')) return;
    const root = host?.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null | undefined;
    if ((root?.getSelection?.() ?? document.getSelection())?.toString()) return; // selecting text, not clicking
    openDocument(String(row.documentId), event.ctrlKey || event.metaKey ? 'newTab' : (def().openIn ?? 'route'));
  };

  const canExport = () => (def().exportTypes ?? []).some((type) => String(type).toUpperCase() === 'CSV');
  const exportCsv = async () => {
    if (untrack(exporting)) return;
    setExporting(true);
    try {
      const request = untrack(() => buildRequest(query()));
      if (!request) return;
      const limit = Math.min(10_000, Math.max(1, Number(untrack(def).exportLimit) || 2000));
      const result = await searchPage({ request, page: 0, pageSize: limit, trackTotal: true });
      const exported = untrack(columns).filter((c) => c.visible !== false);
      const csv = toCsv([exported.map(headerText), ...result.documents.map((row) => exported.map((c) => cellText(c, row)))]);
      const name = (untrack(field.label) || 'export').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export';
      downloadText(`${name}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
      if (result.total > result.documents.length) {
        notify('info', `Exported the first ${result.documents.length} of ${result.total} rows.`);
      }
    } catch (err) {
      notify('error', `Export failed: ${errorText(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const ariaSort = (index: number) => {
    const sort = activeSort();
    return sort?.index === index ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;
  };
  const label = () => (def().hideLabel ? '' : field.label());
  const hasBar = () => !!label() || !!def().showSearch || !!def().showReload || canExport();
  const firstRow = () => page() * pageSize() + 1;
  const lastRow = () => Math.min(total(), (page() + 1) * pageSize());
  const emptyText = () => {
    if (error()) return error();
    if (query().trim()) return `Nothing matches “${query().trim()}”.`;
    return def().emptyText || 'Nothing to show.';
  };

  return (
    <section class={['tb', loading() && loaded() && 'tb--busy']} aria-label={field.label() || 'Table'} onClick={followDocumentLink}>
      <Show when={hasBar()}>
        <header class="tb-bar">
          <div class="tb-title">
            <Show when={label()}>
              <h3 class="tb-label">{label()}</h3>
            </Show>
            <Show when={loaded() && !error()}>
              <span class="sj-count" title={`${total()} in total`}>
                {total()}
              </span>
            </Show>
            <Show when={loading() && loaded()}>
              <Spinner label="Loading" />
            </Show>
          </div>
          <div class="tb-tools">
            <Show when={def().showSearch}>
              <label class="tb-search">
                <Icon name="search" size={14} />
                <input
                  type="search"
                  value={search()}
                  placeholder={def().searchPlaceholder ?? 'Search'}
                  aria-label={def().searchPlaceholder ?? 'Search'}
                  onInput={(event) => {
                    setSearch(event.currentTarget.value);
                    applySearch(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && search()) {
                      setSearch('');
                      applySearch('');
                    }
                  }}
                />
              </label>
            </Show>
            <Show when={def().showReload}>
              <IconButton icon="refresh" label="Reload" size="sm" onClick={() => setReloads((n) => n + 1)} />
            </Show>
            <Show when={canExport()}>
              <Button size="sm" icon="download" disabled={exporting() || !loaded()} onClick={() => void exportCsv()}>
                Export CSV
              </Button>
            </Show>
          </div>
        </header>
      </Show>

      <div class="tb-scroll">
        <table class="tb-table" aria-label={field.label() || undefined} aria-busy={loading() ? 'true' : undefined}>
          <thead>
            <tr>
              <For each={shown()}>
                {(entry) => (
                  <th
                    scope="col"
                    class={['tb-th', entry.column.type === 'numeric' && 'tb-end']}
                    style={entry.column.width ? { width: entry.column.width } : undefined}
                    aria-sort={ariaSort(entry.index)}
                  >
                    <Show
                      when={sortFieldOf(entry.column)}
                      fallback={<span class={['tb-th__text', entry.column.iconOnly && 'sj-visually-hidden']}>{headerText(entry.column)}</span>}
                    >
                      <button type="button" class="tb-sort" onClick={() => toggleSort(entry.index)}>
                        <span class={['tb-th__text', entry.column.iconOnly && 'sj-visually-hidden']}>{headerText(entry.column)}</span>
                        <Icon
                          name={ariaSort(entry.index) === 'ascending' ? 'arrow-up' : 'arrow-down'}
                          size={12}
                          strokeWidth={2}
                          class={['tb-sort__icon', ariaSort(entry.index) && 'tb-sort__icon--on']}
                        />
                      </button>
                    </Show>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <Show
              when={loaded()}
              fallback={
                <For each={Array.from({ length: Math.min(pageSize(), 5) }, (_, i) => i)}>
                  {(i) => (
                    <tr class="tb-skeleton-row" aria-hidden="true">
                      <For each={shown()}>
                        {(entry) => (
                          <td>
                            <span class="sj-skeleton" style={{ width: `${45 + ((i * 17 + entry.index * 23) % 45)}%` }} />
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              }
            >
              <For each={rows()}>
                {(row) => (
                  <tr class={['tb-row', def().rowClick !== false && 'tb-row--link']} onClick={(event) => openRow(event, row)}>
                    <For each={shown()}>
                      {(entry) => (
                        <td class={['tb-td', `tb-td--${entry.column.type ?? 'text'}`, entry.column.type === 'numeric' && 'tb-end']}>
                          {renderCell(entry.column, row, cellContext)}
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
        <Show when={loaded() && !rows().length}>
          <div class={['sj-empty', error() && 'tb-error']} role={error() ? 'alert' : undefined}>
            <Icon name={error() ? 'alert' : 'search'} />
            <span>{emptyText()}</span>
            <Show when={error()}>
              <Button size="sm" variant="subtle" icon="refresh" onClick={() => setReloads((n) => n + 1)}>
                Try again
              </Button>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={loaded() && total() > pageSize()}>
        <footer class="tb-foot">
          <span class="tb-range">
            {firstRow()}–{lastRow()} of {total()}
          </span>
          <div class="tb-pager">
            <IconButton icon="chevron-left" label="Previous page" size="sm" disabled={page() === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} />
            <span class="tb-page">
              Page {page() + 1} of {pages()}
            </span>
            <IconButton
              icon="chevron-right"
              label="Next page"
              size="sm"
              disabled={page() >= pages() - 1}
              onClick={() => setPage((p) => Math.min(pages() - 1, p + 1))}
            />
          </div>
        </footer>
      </Show>
    </section>
  );
}

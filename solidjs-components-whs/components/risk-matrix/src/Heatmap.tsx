import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  documentName,
  FieldShell,
  followDocumentLink,
  formatNumber,
  getPath,
  getService,
  Icon,
  IconButton,
  Lozenge,
  parseFilter,
  Popover,
  searchPage,
  Spinner,
  uid,
  type SourceDocument,
} from '@solidjs-components/kit';
import {
  cellKey,
  CONSEQUENCES,
  heatmap,
  LIKELIHOODS,
  MATRIX,
  RATING_COLORS,
  RATINGS,
  type CellPosition,
} from '../../../packages/whs-kit/src/index';
import { MatrixGrid } from './MatrixGrid';
import type { Binding } from './RiskMatrix';

const plural = (count: number, noun: string) => `${formatNumber(count, 0)} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The heatmap: how many records sit in each cell of the matrix, by the risk value at `riskField`.
 * A cell opens the list of its records. Counts again after any save in the app.
 * @param props - The field binding (definition, label, Handlebars context)
 */
export function Heatmap(props: { field: Binding }) {
  const field = props.field;
  const def = field.definition;
  const labelId = uid('label');
  const [docs, setDocs] = createSignal<SourceDocument[]>([]);
  const [found, setFound] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);
  const [open, setOpen] = createSignal<CellPosition | null>(null);
  const cells = new Map<string, HTMLElement>();
  let list: HTMLUListElement | undefined;
  // The cell whose list is (or was last) open: the popover returns focus to it on close.
  let anchor: HTMLElement | undefined;

  const riskField = () => def().riskField || '';
  const titleField = () => def().titleField || 'systemHeader.summaryName';
  const limit = () => Math.min(10_000, Math.max(1, Math.floor(Number(def().limit)) || 500));
  const noun = () => def().noun || 'record';
  const map = createMemo(() => heatmap(docs(), riskField()));
  const countAt = (cell: CellPosition) => map().cells[cellKey(cell.likelihood, cell.consequence)]?.length ?? 0;
  const fullest = createMemo(() => Math.max(1, ...Object.values(map().cells).map((list) => list.length)));

  let requestId = 0;
  const load = async () => {
    const id = ++requestId;
    const [filter, path, title, size, context] = untrack(() => [def().filter, riskField(), titleField(), limit(), field.templateContext()] as const);
    setLoading(true);
    try {
      if (!path) throw new Error('No riskField is set: say which field holds each record’s risk.');
      const request = parseFilter(filter, context);
      if (!request) throw new Error('No filter is set: say which records to count.');
      const result = await searchPage({ request, page: 0, pageSize: size, include: ['documentId', path, title], trackTotal: true });
      if (id !== requestId) return;
      setDocs(() => result.documents);
      setFound(result.total);
      setError(undefined);
    } catch (err) {
      if (id === requestId) setError((err as Error)?.message || 'The records could not be counted.');
    } finally {
      if (id === requestId) setLoading(false);
    }
  };
  createEffect(
    () => JSON.stringify([def().filter ?? null, riskField(), titleField(), limit(), reloads()]),
    () => void load(),
  );

  // Count again after any save in the app. The broadcast replays the last save to new
  // subscribers, synchronously: skip that one.
  let listening = false;
  const saved = getService('BroadcastService')
    ?.on?.('document:updated')
    .subscribe(() => listening && setReloads((n) => n + 1));
  queueMicrotask(() => (listening = true));
  onCleanup(() => saved?.unsubscribe());

  const openCell = (cell: CellPosition) => {
    if (!countAt(cell)) return;
    const current = untrack(open);
    if (current && current.likelihood === cell.likelihood && current.consequence === cell.consequence) {
      setOpen(null);
      return;
    }
    anchor = cells.get(cellKey(cell.likelihood, cell.consequence));
    setOpen(cell);
    requestAnimationFrame(() => list?.querySelector('a')?.focus({ preventScroll: true }));
  };

  const titleOf = (doc: SourceDocument) => {
    const title = getPath(doc, titleField());
    return typeof title === 'string' && title ? title : documentName(doc);
  };
  const levels = (cell: CellPosition) =>
    `${LIKELIHOODS[cell.likelihood - 1].name} × ${CONSEQUENCES[cell.consequence - 1].name}`;
  const openDocs = () => {
    const cell = open();
    return cell ? (map().cells[cellKey(cell.likelihood, cell.consequence)] ?? []) : [];
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <div class="rm rm--heatmap" aria-busy={loading() ? 'true' : 'false'}>
        <div class="rm-summary">
          <div class="rm-summary__counts" role="status">
            <Show when={!error()} fallback={<span class="rm-summary__error">{error()}</span>}>
              <span class="rm-summary__total">{plural(map().total, noun())}</span>
              <For each={[...RATINGS].reverse()}>
                {(rating) => (
                  <span class="rm-summary__rating" data-rating={rating}>
                    <span class="rm-dot" style={{ '--rm-color': RATING_COLORS[rating] }} aria-hidden="true" />
                    {rating} {map().byRating[rating]}
                  </span>
                )}
              </For>
              <Show when={map().skipped}>
                <span class="rm-summary__skipped">{formatNumber(map().skipped, 0)} not assessed</span>
              </Show>
            </Show>
          </div>
          <Show when={loading()}>
            <Spinner label="Counting" />
          </Show>
          <IconButton icon="refresh" size="sm" label="Count again" onClick={() => setReloads((n) => n + 1)} />
        </div>
        <Show when={found() > docs().length}>
          <p class="rm-limit">
            <Icon name="info" size={13} /> Counting the first {formatNumber(docs().length, 0)} of {formatNumber(found(), 0)}.
          </p>
        </Show>

        <MatrixGrid
          labelledBy={field.label() && !def().hideLabel ? labelId : undefined}
          label={field.label() || 'Risk heatmap'}
          interactive
          hasPopup
          expanded={open()}
          onPick={openCell}
          cellDisabled={(cell) => !countAt(cell)}
          cellHeat={(cell) => countAt(cell) / fullest()}
          registerCell={(key, element) => cells.set(key, element)}
          cellLabel={(cell, rating) => `${levels(cell)}: ${rating}, ${plural(countAt(cell), noun())}`}
          cellContent={(cell) => (
            <span class="rm-count">
              {countAt(cell) ? formatNumber(countAt(cell), 0) : '·'}
            </span>
          )}
        />

        <Popover
          open={!!open()}
          anchor={() => anchor}
          onDismiss={() => setOpen(null)}
          minWidth={280}
          label={open() ? levels(open()!) : 'Records'}
        >
          <Show when={open()}>
            {(cell) => (
              <div class="rm-list" onClick={(event) => {
                followDocumentLink(event);
                if (event.defaultPrevented) setOpen(null);
              }}>
                <header class="rm-list__head">
                  <span class="rm-list__title">{levels(cell())}</span>
                  <Lozenge color={RATING_COLORS[MATRIX[cell().likelihood - 1][cell().consequence - 1]]}>
                    {MATRIX[cell().likelihood - 1][cell().consequence - 1]}
                  </Lozenge>
                  <span class="sj-count">{openDocs().length}</span>
                </header>
                <ul ref={list} class="rm-list__items">
                  <For each={openDocs()}>
                    {(doc) => (
                      <li>
                        <a class="sj-link rm-list__link" href={`/form/${doc.documentId}`}>
                          {titleOf(doc)}
                        </a>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            )}
          </Show>
        </Popover>
      </div>
    </FieldShell>
  );
}

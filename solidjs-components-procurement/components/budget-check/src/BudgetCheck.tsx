import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  createDocumentField,
  createFieldBinding,
  dayKey,
  errorText,
  FieldShell,
  fetchDocuments,
  followDocumentLink,
  formatMoney,
  getPath,
  getService,
  Icon,
  lineTotals,
  parseFilter,
  pathValues,
  searchPage,
  Spinner,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type EsRequest,
  type FormbirdElementProps,
  type LineItem,
  type SourceDocument,
} from '@solidjs-components/kit';
import { budgetPosition, financialYear, type BudgetPosition, type BudgetRequest } from '../../../packages/proc-kit/src/index';

export interface BudgetCheckDefinition extends BaseDefinition {
  /** "request" (default): this request against its cost centre; "summary": every cost centre. Read once. */
  mode?: 'request' | 'summary';
  /** Request mode: the request's cost centre (default "costCentreRel"). Read once. */
  costCentreField?: string;
  /** Request mode: the lines; the amount is their subtotal, ex GST (default "lineItemsArr"). Read once. */
  linesField?: string;
  /** Request mode: field to write what is left before this request (for the client rule). */
  remainingField?: string;
  /** Summary mode: the cost centres. Default: the app's cost centres. */
  costCentreFilter?: string | Record<string, unknown>;
  /** The requests that count against budgets; `{{costCentreId}}` and `{{fy}}` are filled in. Default: the app's requests this financial year. */
  requestsFilter?: string | Record<string, unknown>;
  /** The cost centre's budget for the year, ex GST (default "budgetNum"). */
  budgetField?: string;
  /** What was spent outside the requests this year (default "baseSpentNum"). */
  baseSpentField?: string;
  /** The cost centre's code (default "code"). */
  codeField?: string;
  /** Summary mode: who looks after it (default "ownerRel.name"). */
  ownerField?: string;
  /** Summary mode: what to say when there are no cost centres (default "No cost centres to show."). */
  emptyText?: string;
  /** The app tag of the records (default "proc"). */
  app?: string;
  /** Tax rate of the lines (default 0.1): the budget counts amounts ex tax. */
  taxRate?: number;
  currency?: string;
  timeZone?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<BudgetCheckDefinition, unknown>>;

interface CostCentre {
  id: string;
  name: string;
  code: string;
  owner: string;
  budget: number;
  baseSpent: number;
}

const DOCUMENT_UPDATED = 'document:updated';
const REQUEST_FIELDS = ['documentId', 'costCentreRel', 'requestStatusRel', 'subtotalNum', 'invoiceExGstNum'];
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** How far through the financial year (1 July) a day is, 0 to 1. */
function yearGone(today: string): number {
  const [y, m] = today.split('-').map(Number);
  const start = Date.UTC(m >= 7 ? y : y - 1, 6, 1);
  const end = Date.UTC(m >= 7 ? y + 1 : y, 6, 1);
  return Math.min(1, Math.max(0, (Date.parse(`${today}T00:00:00Z`) - start) / (end - start)));
}

/**
 * `<solid-budget-check>`: a cost centre's budget for the financial year: spent, committed, waiting for
 * approval and what is left. On a request, with the request on the bar: whether it fits, and the
 * finance override it needs when it doesn't (the same `budgetPosition` the rules use). On a page,
 * every cost centre against how far through the year it is. It stores nothing in its own field.
 * @param props - Formbird element properties
 */
export function BudgetCheck(props: Props) {
  const field = createFieldBinding<unknown, BudgetCheckDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const { mode, costCentreField, linesField, remainingField, documentId } = untrack(() => ({
    mode: def().mode ?? 'request',
    costCentreField: def().costCentreField ?? 'costCentreRel',
    linesField: def().linesField ?? 'lineItemsArr',
    remainingField: def().remainingField ?? '',
    documentId: String(props.document?.documentId ?? ''),
  }));
  const costCentreRel = createDocumentField(props, costCentreField, toRelatedList);
  const lines = createDocumentField(props, linesField, (raw) => (Array.isArray(raw) ? (raw as LineItem[]) : []));
  const remainingNow = createDocumentField(props, remainingField, (raw) => (typeof raw === 'number' ? raw : null));
  const app = () => def().app ?? 'proc';
  const today = () => dayKey(Date.now(), def().timeZone || undefined);
  const fy = () => financialYear(today());
  // Whole dollars: a budget's position doesn't need cents.
  const money = (n: number) => formatMoney(Math.round(n), def().currency ?? 'AUD').replace(/\.00$/, '');
  const amount = createMemo(() => (mode === 'request' ? lineTotals(lines(), def().taxRate ?? 0.1).subtotal : 0));

  const [centres, setCentres] = createSignal<CostCentre[]>([]);
  const [requests, setRequests] = createSignal<(BudgetRequest & { costCentreId: string })[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);

  const toCentre = (doc: SourceDocument): CostCentre => {
    const d = untrack(def);
    return {
      id: text(doc.documentId),
      name: text(getPath(doc, 'systemHeader.summaryName')),
      code: text(getPath(doc, d.codeField ?? 'code')),
      owner: text(pathValues(doc, d.ownerField ?? 'ownerRel.name')[0]),
      budget: Number(getPath(doc, d.budgetField ?? 'budgetNum')) || 0,
      baseSpent: Number(getPath(doc, d.baseSpentField ?? 'baseSpentNum')) || 0,
    };
  };
  const requestsRequest = (costCentreId: string): EsRequest => {
    const d = untrack(def);
    const context = { ...untrack(() => field.templateContext()), costCentreId, fy: untrack(fy) };
    return (
      parseFilter(d.requestsFilter, context) ??
      ({
        query: {
          bool: {
            filter: [
              { term: { 'systemHeader.systemType': 'document' } },
              { term: { appTags: untrack(app) } },
              { term: { appTags: 'request' } },
              { term: { fyKey: untrack(fy) } },
              ...(costCentreId ? [{ term: { 'costCentreRel.documentId': costCentreId } }] : []),
              { terms: { 'requestStatusRel.name': ['Submitted', 'Approved', 'Ordered', 'Received', 'Closed'] } },
            ],
          },
        },
      } as EsRequest)
    );
  };

  let requestId = 0;
  const load = async (costCentreId: string) => {
    const id = ++requestId;
    if (mode === 'request' && !costCentreId) {
      setCentres([]);
      setRequests([]);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const centreDocs =
        mode === 'request'
          ? await fetchDocuments([costCentreId])
          : (
              await searchPage({
                request:
                  parseFilter(untrack(def).costCentreFilter, untrack(() => field.templateContext())) ??
                  ({ sort: [{ code: { order: 'asc', unmapped_type: 'keyword' } }], query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: untrack(app) } }, { term: { appTags: 'costCentre' } }], must_not: [{ term: { inactiveBool: true } }] } } } as EsRequest),
                page: 0,
                pageSize: 200,
              })
            ).documents;
      const found = await searchPage({ request: requestsRequest(mode === 'request' ? costCentreId : ''), page: 0, pageSize: 2000, include: REQUEST_FIELDS });
      if (id !== requestId) return;
      setCentres(centreDocs.map(toCentre));
      setRequests(
        found.documents.map((doc) => ({
          documentId: text(doc.documentId),
          costCentreId: text(getPath(doc, 'costCentreRel.0.documentId')),
          status: text(getPath(doc, 'requestStatusRel.0.name')),
          amount: Number(doc.subtotalNum) || 0,
          invoiced: doc.invoiceExGstNum === null || doc.invoiceExGstNum === undefined || doc.invoiceExGstNum === '' ? null : Number(doc.invoiceExGstNum),
        })),
      );
      setError(undefined);
    } catch (err) {
      if (id === requestId) setError(errorText(err, 'The budget could not be loaded.'));
    } finally {
      if (id === requestId) {
        setLoading(false);
        setLoaded(true);
      }
    }
  };
  createEffect(
    () => [costCentreRel()[0]?.documentId ?? '', reloads()] as const,
    ([id]) => void load(id),
  );
  let listening = false;
  const updates = getService('BroadcastService')
    ?.on?.<unknown>(DOCUMENT_UPDATED)
    .subscribe(() => listening && setReloads((n) => n + 1));
  queueMicrotask(() => (listening = true));
  onCleanup(() => updates?.unsubscribe());

  const positionOf = (centre: CostCentre, extra = 0) =>
    budgetPosition({ budget: centre.budget, baseSpent: centre.baseSpent, requests: requests().filter((r) => r.costCentreId === centre.id), exclude: documentId, amount: extra });
  const position = createMemo(() => (mode === 'request' && centres()[0] ? positionOf(centres()[0], amount()) : null));

  // What is left before this request, for the client rule (only once loaded, only when it changes).
  createEffect(
    () => (remainingField && position() ? position()!.remaining : undefined),
    (remaining) => {
      if (remaining !== undefined && untrack(remainingNow) !== remaining) field.setOtherField(remainingField, remaining);
    },
  );

  const Bar = (p: { position: BudgetPosition; showAmount?: boolean }) => {
    const scale = () => Math.max(p.position.budget, p.position.spent + p.position.committed + p.position.pending + (p.showAmount ? p.position.amount : 0), 1);
    const pct = (n: number) => `${(Math.max(0, n) / scale()) * 100}%`;
    const fits = () => Math.max(0, Math.min(p.position.amount, p.position.remaining));
    return (
      <div class="bc-bar" aria-hidden="true">
        <span class="bc-bar__spent" style={{ width: pct(p.position.spent) }} />
        <span class="bc-bar__committed" style={{ width: pct(p.position.committed) }} />
        <Show when={p.showAmount && p.position.amount}>
          <span class="bc-bar__amount" style={{ width: pct(fits()) }} />
          <span class="bc-bar__over" style={{ width: pct(p.position.overBy) }} />
        </Show>
        <span class="bc-bar__pending" style={{ width: pct(p.position.pending) }} />
        <span class="bc-bar__budget" style={{ left: pct(p.position.budget) }} />
        <span class="bc-bar__year" style={{ left: `${(yearGone(today()) * p.position.budget) / scale() * 100}%` }} title="How far through the year" />
      </div>
    );
  };

  const Legend = (p: { position: BudgetPosition; showAmount?: boolean }) => (
    <dl class="bc-legend">
      <div class="bc-legend__item bc-legend__item--spent">
        <dt>Spent</dt>
        <dd>{money(p.position.spent)}</dd>
      </div>
      <div class="bc-legend__item bc-legend__item--committed">
        <dt>Committed</dt>
        <dd>{money(p.position.committed)}</dd>
      </div>
      <Show when={p.position.pending}>
        <div class="bc-legend__item bc-legend__item--pending">
          <dt>Waiting for approval</dt>
          <dd>{money(p.position.pending)}</dd>
        </div>
      </Show>
      <Show when={p.showAmount}>
        <div class={['bc-legend__item', p.position.overBy ? 'bc-legend__item--over' : 'bc-legend__item--amount']}>
          <dt>This request</dt>
          <dd>{money(p.position.amount)}</dd>
        </div>
      </Show>
      <div class={['bc-legend__item', 'bc-legend__item--left', { 'bc-legend__item--negative': (p.showAmount ? p.position.after : p.position.remaining) < 0 }]}>
        <dt>{p.showAmount ? 'Left after' : 'Left'}</dt>
        <dd>{money(p.showAmount ? p.position.after : p.position.remaining)}</dd>
      </div>
    </dl>
  );

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <section class={['bc', `bc--${mode}`]} aria-labelledby={def().hideLabel ? undefined : labelId} aria-label={def().hideLabel ? 'Budget' : undefined} aria-busy={loading() ? 'true' : 'false'}>
        <Show when={error()}>
          <div class="sj-note sj-note--danger" role="alert">
            <Icon name="alert" size={14} />
            <span>{error()}</span>
          </div>
        </Show>

        <Show when={mode === 'request'}>
          <Show when={costCentreRel()[0]} fallback={<p class="bc-hint">Choose the cost centre to see its budget.</p>}>
            <Show when={position()} fallback={<Show when={!loaded() || loading()}><Spinner label="Loading the budget" /></Show>}>
              {(pos) => (
                <div class="bc-card">
                  <header class="bc-head">
                    <span class="bc-name">
                      {centres()[0].name}
                      <Show when={centres()[0].code}>
                        <span class="bc-code">{centres()[0].code}</span>
                      </Show>
                    </span>
                    <span class="bc-fy">
                      {fy()} budget {money(pos().budget)}
                    </span>
                  </header>
                  <Bar position={pos()} showAmount />
                  <Legend position={pos()} showAmount />
                  <Show
                    when={pos().overBy}
                    fallback={
                      <p class="bc-verdict bc-verdict--fits">
                        <Icon name="check" size={14} strokeWidth={2.2} />
                        <span>
                          {pos().amount ? 'Fits in the budget' : 'Add lines to check them against the budget'}
                          {pos().amount ? `: ${money(pos().after)} left after this request.` : '.'}
                        </span>
                      </p>
                    }
                  >
                    <p class="bc-verdict bc-verdict--over" role="status">
                      <Icon name="alert" size={14} />
                      <span>
                        Over budget by <strong>{money(pos().overBy)}</strong>: Finance approves an override before this can be ordered.
                      </span>
                    </p>
                  </Show>
                </div>
              )}
            </Show>
          </Show>
        </Show>

        <Show when={mode === 'summary'}>
          <Show when={loaded()} fallback={<Spinner label="Loading budgets" />}>
            <Show when={centres().length} fallback={<p class="bc-empty">{def().emptyText || 'No cost centres to show.'}</p>}>
            <div class="bc-summary-head">
              <span>
                {fy()} · {Math.round(yearGone(today()) * 100)}% of the year gone
              </span>
              <span class="bc-key">
                <span class="bc-key__swatch bc-key__swatch--spent" /> Spent
                <span class="bc-key__swatch bc-key__swatch--committed" /> Committed
                <span class="bc-key__swatch bc-key__swatch--pending" /> Waiting for approval
                <span class="bc-key__year" /> Today
              </span>
            </div>
            <ul class="bc-rows" onClick={followDocumentLink}>
              <For each={centres()} keyed={(c) => c.id}>
                {(centre) => {
                  const pos = () => positionOf(centre());
                  const used = () => (pos().budget ? (pos().spent + pos().committed) / pos().budget : 0);
                  return (
                    <li class={['bc-row', { 'bc-row--over': pos().remaining < 0, 'bc-row--ahead': used() > yearGone(today()) + 0.1 }]}>
                      <a class="bc-row__name" href={`/form/${centre().id}`}>
                        <span class="bc-code">{centre().code}</span>
                        <span class="sj-truncate">{centre().name}</span>
                        <Show when={centre().owner}>
                          <span class="bc-row__owner sj-truncate">{centre().owner}</span>
                        </Show>
                      </a>
                      <div class="bc-row__bar">
                        <Bar position={pos()} />
                      </div>
                      <span class="bc-row__used">{Math.round(used() * 100)}%</span>
                      <span class={['bc-row__left', { 'bc-row__left--negative': pos().remaining < 0 }]}>
                        {money(pos().remaining)}
                        <span class="bc-row__of"> of {money(pos().budget)}</span>
                      </span>
                    </li>
                  );
                }}
              </For>
            </ul>
            </Show>
          </Show>
        </Show>
      </section>
    </FieldShell>
  );
}

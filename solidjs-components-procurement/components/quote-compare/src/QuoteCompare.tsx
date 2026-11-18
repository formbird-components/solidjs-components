import { createEffect, createMemo, createSignal, flush, For, onCleanup, Show, untrack } from 'solid-js';
import {
  Button,
  createDocument,
  createDocumentField,
  createFieldBinding,
  errorText,
  FieldShell,
  fileUrl,
  followDocumentLink,
  formatDate,
  formatMoney,
  getPath,
  getService,
  Icon,
  lineTotals,
  parseFilter,
  RelatedPicker,
  searchPage,
  Spinner,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type EsRequest,
  type FieldBinding,
  type FormbirdElementProps,
  type LineItem,
  type RelatedDoc,
  type RelatedPickerDefinition,
} from '@solidjs-components/kit';
import { quoteProblems, type QuoteRule } from '../../../packages/proc-kit/src/index';

export interface QuoteCompareDefinition extends BaseDefinition {
  /** Template of new quotes. Without it there is no Add quote. */
  templateId?: string;
  /** How many quotes an amount needs: `[{ fromAmount, quotes }]`. */
  rules?: QuoteRule[];
  /** The request's lines; the amount is their subtotal, ex GST (default "lineItemsArr"). The request's fields are read once. */
  linesField?: string;
  /** The request's reference, kept on new quotes (default "requestRef"). */
  refField?: string;
  /** Where choosing a quote writes it (default "chosenQuoteRel"). */
  chosenField?: string;
  /** Where choosing a quote writes its supplier (default "supplierRel"). */
  supplierField?: string;
  /** Where to write how many quotes are still valid, for the client rule. */
  countField?: string;
  /** Why there is only one supplier (default "soleSupplierReason"). This and `notCheapestField` are only read, to say what is still needed. */
  soleSupplierField?: string;
  /** Why not the cheapest quote (default "notCheapestReason"). */
  notCheapestField?: string;
  /** Elasticsearch request for the quotes. Default: the app's quotes for this request. */
  filter?: string | Record<string, unknown>;
  /** Elasticsearch request for suppliers, in the add form. */
  suppliers?: string | Record<string, unknown>;
  /** What supplier values keep besides documentId and name. */
  supplierFields?: Record<string, string>;
  /** The app tag of the quotes (default "proc"). */
  app?: string;
  /** Tax rate of the lines (default 0.1): quotes are compared ex tax. */
  taxRate?: number;
  currency?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<QuoteCompareDefinition, unknown>>;

interface Quote {
  documentId: string;
  ref: string;
  supplier: RelatedDoc | null;
  amount: number;
  validUntil: string;
  leadTime: number | null;
  notes: string;
  file: { fileNo: string; fileName: string } | null;
}

const DOCUMENT_UPDATED = 'document:updated';
const RESEARCH_MS = 1500;
const QUOTE_FIELDS = ['documentId', 'quoteRef', 'supplierRel', 'amountNum', 'validUntilDate', 'leadTimeDaysNum', 'notes', 'attachmentsArr'];
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (t: string): number | null => {
  const cleaned = t.replace(/[,\s$]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
const toQuote = (doc: Record<string, unknown>): Quote => {
  const supplier = toRelatedList(doc.supplierRel)[0] ?? null;
  const files = Array.isArray(doc.attachmentsArr) ? (doc.attachmentsArr as { fileNo?: string; fileName?: string }[]) : [];
  const file = files.find((f) => f && f.fileNo);
  const lead = doc.leadTimeDaysNum === null || doc.leadTimeDaysNum === undefined || doc.leadTimeDaysNum === '' ? null : Number(doc.leadTimeDaysNum);
  return {
    documentId: text(doc.documentId),
    ref: text(doc.quoteRef),
    supplier,
    amount: Number(doc.amountNum) || 0,
    validUntil: text(doc.validUntilDate),
    leadTime: Number.isFinite(lead) ? lead : null,
    notes: text(doc.notes),
    file: file ? { fileNo: String(file.fileNo), fileName: text(file.fileName) } : null,
  };
};

/**
 * `<solid-quote-compare>`: a purchase request's supplier quotes, side by side: each one's amount
 * against the cheapest, lead time, how long it is valid, whether the supplier is approved, and the
 * quote document. It says how many quotes the request's amount needs (the same `quoteProblems` the
 * rules use), lets the requester choose one (writing the chosen quote and its supplier) and add one.
 * Quotes are records of their own; this element stores nothing in its own field.
 * @param props - Formbird element properties
 */
export function QuoteCompare(props: Props) {
  const field = createFieldBinding<unknown, QuoteCompareDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const f = untrack(() => ({
    lines: def().linesField ?? 'lineItemsArr',
    ref: def().refField ?? 'requestRef',
    chosen: def().chosenField ?? 'chosenQuoteRel',
    supplier: def().supplierField ?? 'supplierRel',
    count: def().countField ?? '',
    sole: def().soleSupplierField ?? 'soleSupplierReason',
    notCheapest: def().notCheapestField ?? 'notCheapestReason',
  }));
  const { documentId, initiallySaved, initialName } = untrack(() => ({
    documentId: String(props.document?.documentId ?? ''),
    initiallySaved: !!(props.document?.systemHeader as Record<string, unknown> | undefined)?.serverCreatedDate || !!(props.document?.systemHeader as Record<string, unknown> | undefined)?.createdDate,
    initialName: text(getPath(props.document, 'systemHeader.summaryName')),
  }));
  const lines = createDocumentField(props, f.lines, (raw) => (Array.isArray(raw) ? (raw as LineItem[]) : []));
  const ref = createDocumentField(props, f.ref, text);
  const chosenRel = createDocumentField(props, f.chosen, toRelatedList);
  const sole = createDocumentField(props, f.sole, text);
  const notCheapest = createDocumentField(props, f.notCheapest, text);
  const countNow = createDocumentField(props, f.count, (raw) => (typeof raw === 'number' ? raw : null));
  const amount = createMemo(() => lineTotals(lines(), def().taxRate ?? 0.1).subtotal);
  const money = (n: number) => formatMoney(n, def().currency ?? 'AUD').replace(/\.00$/, '');

  const [saved, setSaved] = createSignal(initiallySaved);
  const [name, setName] = createSignal(initialName);
  const [found, setFound] = createSignal<Quote[]>([]);
  const [added, setAdded] = createSignal<Quote[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  onCleanup(() => timers.forEach(clearTimeout));

  let requestId = 0;
  const load = async () => {
    const id = ++requestId;
    if (!untrack(saved) || !documentId) {
      setLoaded(true);
      return;
    }
    let request: EsRequest | undefined;
    try {
      request =
        parseFilter(untrack(def).filter, untrack(() => field.templateContext())) ??
        ({
          sort: [{ amountNum: { order: 'asc', unmapped_type: 'double' } }],
          query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: untrack(def).app ?? 'proc' } }, { term: { appTags: 'quote' } }, { term: { 'requestRel.documentId': documentId } }] } },
        } as EsRequest);
    } catch (err) {
      setError((err as Error).message);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const { documents } = await searchPage({ request: request!, page: 0, pageSize: 100, include: QUOTE_FIELDS });
      if (id !== requestId) return;
      const list = documents.map((d) => toQuote(d));
      const ids = new Set(list.map((q) => q.documentId));
      setFound(list);
      setAdded((a) => a.filter((q) => !ids.has(q.documentId)));
      setError(undefined);
    } catch (err) {
      if (id === requestId) setError(errorText(err, 'The quotes could not be loaded.'));
    } finally {
      if (id === requestId) {
        setLoading(false);
        setLoaded(true);
      }
    }
  };
  createEffect(
    () => JSON.stringify([def().filter ?? null, reloads(), saved()]),
    () => void load(),
  );
  let listening = false;
  const updates = getService('BroadcastService')
    ?.on?.<unknown>(DOCUMENT_UPDATED)
    .subscribe((data) => {
      if (!listening) return;
      const docs = (Array.isArray(data) ? data : [data]) as { documentId?: unknown; systemHeader?: { summaryName?: unknown } }[];
      const self = docs.find((d) => d && d.documentId === documentId);
      if (self) {
        setSaved(true);
        if (typeof self.systemHeader?.summaryName === 'string') setName(self.systemHeader.summaryName);
      }
      setReloads((n) => n + 1);
    });
  queueMicrotask(() => (listening = true));
  onCleanup(() => updates?.unsubscribe());

  const quotes = createMemo(() => {
    const list = found();
    const ids = new Set(list.map((q) => q.documentId));
    return [...list, ...added().filter((q) => !ids.has(q.documentId))].sort((a, b) => a.amount - b.amount);
  });
  const facts = createMemo(() =>
    quoteProblems({
      amount: amount(),
      quotes: quotes().map((q) => ({ documentId: q.documentId, supplier: q.supplier?.name ?? 'the supplier', amount: q.amount, validUntil: q.validUntil || null })),
      chosenId: chosenRel()[0]?.documentId,
      soleSupplierReason: sole(),
      notCheapestReason: notCheapest(),
      rules: def().rules ?? [],
      now: Date.now(),
    }),
  );
  const validIds = createMemo(() => new Set(facts().valid.map((q) => q.documentId)));

  // How many quotes are still valid, for the client rule.
  createEffect(
    () => (f.count && loaded() ? facts().valid.length : undefined),
    (count) => {
      if (count !== undefined && untrack(countNow) !== count) field.setOtherField(f.count, count);
    },
  );

  const editable = () => !field.disabled();
  const choose = (quote: Quote) => {
    const value = { documentId: quote.documentId, name: `${quote.ref || 'Quote'}: ${quote.supplier?.name ?? ''}`.trim(), supplier: quote.supplier?.name ?? '', amount: quote.amount };
    field.setOtherField(f.chosen, [value]);
    if (quote.supplier) field.setOtherField(f.supplier, [quote.supplier]);
  };

  // ------------------------------------------------------------------ adding a quote
  const [adding, setAdding] = createSignal(false);
  const [supplier, setSupplier] = createSignal<RelatedDoc[]>([]);
  const [quoteAmount, setQuoteAmount] = createSignal('');
  const [validUntil, setValidUntil] = createSignal('');
  const [leadTime, setLeadTime] = createSignal('');
  const [notes, setNotes] = createSignal('');
  const [attempted, setAttempted] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [formError, setFormError] = createSignal<string>();
  let amountInput: HTMLInputElement | undefined;
  const missing = createMemo(() => ({
    supplier: !supplier().length ? 'Choose the supplier.' : '',
    amount: !(num(quoteAmount()) && num(quoteAmount())! > 0) ? 'Enter the quoted amount, ex GST.' : '',
  }));
  const problem = (key: 'supplier' | 'amount') => (attempted() ? missing()[key] : '');
  const supplierField: FieldBinding<RelatedDoc[], RelatedPickerDefinition> = {
    fieldName: 'supplierRel',
    controlName: uid('supplier'),
    definition: () => ({ label: 'Supplier', singleSelection: true, filter: def().suppliers, relatedFields: def().supplierFields ?? { approvedBool: 'approvedBool' }, showDropDown: true }),
    value: supplier,
    setValue: (next) => setSupplier(next),
    setOtherField: () => undefined,
    disabled: saving,
    mandatory: () => true,
    label: () => 'Supplier',
    errors: () => (problem('supplier') ? [problem('supplier')] : []),
    templateContext: () => field.templateContext(),
  };
  const reset = () => {
    setSupplier([]);
    setQuoteAmount('');
    setValidUntil('');
    setLeadTime('');
    setNotes('');
    setAttempted(false);
    setFormError(undefined);
  };
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (untrack(saving) || (event.currentTarget as HTMLFormElement).querySelector('.sj-popover[data-open]')) return;
    const gaps = untrack(missing);
    if (gaps.supplier || gaps.amount) {
      setAttempted(true);
      return;
    }
    const templateId = untrack(def).templateId;
    if (!templateId) return;
    setSaving(true);
    setFormError(undefined);
    const values: Record<string, unknown> = untrack(() => ({
      appTags: [def().app ?? 'proc', 'quote'],
      requestRel: [{ documentId, name: name() || ref(), ref: ref() }],
      supplierRel: supplier(),
      amountNum: num(quoteAmount()),
      ...(validUntil() ? { validUntilDate: new Date(`${validUntil()}T07:00:00.000Z`).toISOString() } : {}),
      ...(num(leadTime()) !== null ? { leadTimeDaysNum: num(leadTime()) } : {}),
      ...(notes().trim() ? { notes: notes().trim() } : {}),
    }));
    try {
      const savedQuote = await createDocument(templateId, values);
      setAdded((list) => [...list, toQuote({ ...values, ...savedQuote })]);
      reset();
      setAdding(false);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setReloads((n) => n + 1);
      }, RESEARCH_MS);
      timers.add(timer);
    } catch (err) {
      setFormError(errorText(err, 'The quote could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const neededText = () => {
    const n = facts().needed;
    if (!amount()) return 'Add the lines to see how many quotes the amount needs.';
    if (!n) return `No quote needed for ${money(amount())}.`;
    return `${n === 1 ? 'A written quote is' : `${n} written quotes are`} needed for ${money(amount())}.`;
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <section class="qc" aria-labelledby={def().hideLabel ? undefined : labelId} aria-label={def().hideLabel ? 'Quotes' : undefined} aria-busy={loading() ? 'true' : 'false'}>
        <Show
          when={saved()}
          fallback={
            <div class="sj-note">
              <Icon name="info" size={14} />
              <span>
                {neededText()} Save the request first, then add its quotes.
              </span>
            </div>
          }
        >
          <div class="qc-head">
            <div class="qc-need">
              <span class="qc-dots" aria-hidden="true">
                <For each={Array.from({ length: Math.max(facts().needed, facts().valid.length, 1) })}>
                  {(_, i) => <span class={['qc-dot', { 'qc-dot--on': i() < facts().valid.length, 'qc-dot--needed': i() < facts().needed }]} />}
                </For>
              </span>
              <span>
                {neededText()} <strong>{facts().valid.length}</strong> valid {facts().valid.length === 1 ? 'quote' : 'quotes'} so far.
              </span>
            </div>
            <Show when={loading() && loaded()}>
              <Spinner label="Refreshing" />
            </Show>
          </div>

          <Show when={error()}>
            <div class="sj-note sj-note--danger" role="alert">
              <Icon name="alert" size={14} />
              <span>{error()}</span>
            </div>
          </Show>

          <Show when={quotes().length} fallback={<Show when={loaded()} fallback={<Spinner label="Loading quotes" />}><p class="qc-empty">No quotes yet.</p></Show>}>
            <ul class="qc-cards" onClick={followDocumentLink}>
              <For each={quotes()} keyed={(q) => q.documentId}>
                {(quote) => {
                  const valid = () => validIds().has(quote().documentId);
                  const cheapest = () => facts().cheapest?.documentId === quote().documentId;
                  const chosen = () => chosenRel()[0]?.documentId === quote().documentId;
                  const diff = () => (facts().cheapest ? quote().amount - Number(facts().cheapest!.amount) : 0);
                  const approved = () => quote().supplier?.approvedBool !== false;
                  return (
                    <li class={['qc-card', { 'qc-card--chosen': chosen(), 'qc-card--cheapest': cheapest(), 'qc-card--expired': !valid() }]}>
                      <Show when={chosen() || cheapest()}>
                        <span class="qc-ribbons">
                          <Show when={chosen()}>
                            <span class="qc-ribbon qc-ribbon--chosen">
                              <Icon name="check" size={11} strokeWidth={2.4} /> Chosen
                            </span>
                          </Show>
                          <Show when={cheapest()}>
                            <span class="qc-ribbon qc-ribbon--cheapest">Cheapest</span>
                          </Show>
                        </span>
                      </Show>
                      <a class="qc-supplier" href={`/form/${quote().documentId}`}>
                        {quote().supplier?.name ?? 'No supplier'}
                      </a>
                      <Show when={!approved()}>
                        <span class="qc-unapproved" title="Procurement approves a supplier before it is ordered from">
                          Not an approved supplier
                        </span>
                      </Show>
                      <span class="qc-amount">{money(quote().amount)}</span>
                      <span class={['qc-diff', { 'qc-diff--more': diff() > 0 }]}>
                        {cheapest() ? 'Lowest price' : diff() > 0 ? `+${money(diff())} (${Math.round((diff() / Number(facts().cheapest!.amount)) * 100)}%)` : valid() ? 'Same as the cheapest' : ''}
                      </span>
                      <dl class="qc-facts">
                        <div>
                          <dt>Lead time</dt>
                          <dd>{quote().leadTime === null ? '–' : `${quote().leadTime} ${quote().leadTime === 1 ? 'day' : 'days'}`}</dd>
                        </div>
                        <div>
                          <dt>Valid until</dt>
                          <dd class={{ 'qc-expired': !valid() }}>{quote().validUntil ? `${formatDate(quote().validUntil)}${valid() ? '' : ' (expired)'}` : 'No end'}</dd>
                        </div>
                      </dl>
                      <Show when={quote().notes}>
                        <p class="qc-notes">{quote().notes}</p>
                      </Show>
                      <div class="qc-card__foot">
                        <span class="qc-ref">{quote().ref || 'New'}</span>
                        <Show when={quote().file}>
                          {(file) => (
                            <a class="qc-file" href={fileUrl(file().fileNo)} target="_blank" rel="noopener" title={file().fileName}>
                              <Icon name="download" size={12} /> Quote document
                            </a>
                          )}
                        </Show>
                        <span class="qc-spacer" />
                        <Show when={editable() && !chosen() && valid()}>
                          <Button size="sm" onClick={() => choose(quote())}>
                            Choose
                          </Button>
                        </Show>
                      </div>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>

          <Show when={facts().problems.length}>
            <ul class="qc-problems" role="status">
              <For each={facts().problems}>
                {(p) => (
                  <li>
                    <Icon name="alert" size={13} /> {p}
                  </li>
                )}
              </For>
            </ul>
          </Show>

          <Show when={editable() && def().templateId}>
            <Show
              when={adding()}
              fallback={
                <div>
                  <Button
                    size="sm"
                    icon="plus"
                    onClick={() => {
                      setAdding(true);
                      flush();
                      amountInput?.focus();
                    }}
                  >
                    Add a quote
                  </Button>
                </div>
              }
            >
              <form class="qc-form" aria-label="New quote" novalidate onSubmit={submit}>
                <div class="qc-form__supplier">
                  <RelatedPicker field={supplierField} labelId={uid('supplier-label')} noun="supplier" searchPlaceholder="Search suppliers" emptyLabel="Choose a supplier" />
                </div>
                <label class="qc-form__field">
                  <span class="qc-form__label">Amount, ex GST *</span>
                  <input
                    ref={amountInput}
                    class="sj-input"
                    inputmode="decimal"
                    value={quoteAmount()}
                    aria-invalid={problem('amount') ? 'true' : undefined}
                    disabled={saving()}
                    onInput={(e) => setQuoteAmount(e.currentTarget.value)}
                  />
                  <Show when={problem('amount')}>
                    <span class="qc-form__error">{problem('amount')}</span>
                  </Show>
                </label>
                <label class="qc-form__field">
                  <span class="qc-form__label">Valid until</span>
                  <input class="sj-input" type="date" value={validUntil()} disabled={saving()} onInput={(e) => setValidUntil(e.currentTarget.value)} />
                </label>
                <label class="qc-form__field">
                  <span class="qc-form__label">Lead time (days)</span>
                  <input class="sj-input" inputmode="numeric" value={leadTime()} disabled={saving()} onInput={(e) => setLeadTime(e.currentTarget.value)} />
                </label>
                <label class="qc-form__field qc-form__notes">
                  <span class="qc-form__label">Notes</span>
                  <input class="sj-input" value={notes()} disabled={saving()} onInput={(e) => setNotes(e.currentTarget.value)} />
                </label>
                <Show when={formError()}>
                  <div class="sj-note sj-note--danger qc-form__wide" role="alert">
                    <Icon name="alert" size={14} />
                    <span>{formError()}</span>
                  </div>
                </Show>
                <div class="qc-form__buttons qc-form__wide">
                  <Button type="submit" size="sm" variant="primary" disabled={saving()}>
                    {saving() ? 'Saving…' : 'Save quote'}
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    disabled={saving()}
                    onClick={() => {
                      reset();
                      setAdding(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <span class="qc-form__hint">Attach the quote document on the quote itself once saved.</span>
                </div>
              </form>
            </Show>
          </Show>
        </Show>
      </section>
    </FieldShell>
  );
}

import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  createDocumentField,
  createFieldBinding,
  currentUser,
  dayKey,
  errorText,
  FieldShell,
  fetchDocuments,
  formatNumber,
  getPath,
  getService,
  Icon,
  parseFilter,
  searchPage,
  Spinner,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type EsRequest,
  type FormbirdElementProps,
  type SourceDocument,
} from '@solidjs-components/kit';
import { leaveBalance, type Balance } from '../../../packages/hr-kit/src/index';

/** A leave type, as the lookup values store it. */
export interface LeaveTypeValue {
  documentId: string;
  name: string;
  color?: string;
  /** Which balance it uses ("annual", "personal", "longService"); none: no balance. */
  balanceKey?: string;
  /** Days a full-time employee accrues a year. */
  accrualDaysNum?: number;
}

export interface LeaveBalanceDefinition extends BaseDefinition {
  /** "request" (default): on a leave request; "summary": a person's balances as cards. Read once. */
  mode?: 'request' | 'summary';
  /** The leave types (from the lookup), with their balance and accrual. */
  leaveTypes?: LeaveTypeValue[];
  /** Request mode: fields of the request. Defaults employeeRel, leaveTypeRel, startDate, daysNum. Read once. */
  employeeField?: string;
  typeField?: string;
  startField?: string;
  daysField?: string;
  /** Request mode: field the days available on the first day are written to, for the client rule. */
  availableField?: string;
  /** Summary mode: whose balances: the signed-in person ("me", default) or the account this form shows ("document"). */
  person?: 'me' | 'document';
  /** Fields on the person's account: the opening balance per balance key, its day, and FTE. */
  openingFields?: Record<string, string>;
  sinceField?: string;
  fteField?: string;
  /** Elasticsearch request for the person's leave; `{{employeeId}}` is the person. Default: their leave in the HR app. */
  leaveFilter?: string | Record<string, unknown>;
  /** The company's time zone, for "today" and the first day. */
  timeZone?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<LeaveBalanceDefinition, unknown>>;

const DOCUMENT_UPDATED = 'document:updated';
const OPENING_FIELDS: Record<string, string> = { annual: 'annualOpeningNum', personal: 'personalOpeningNum', longService: 'longServiceOpeningNum' };
const LEAVE_FIELDS = ['documentId', 'leaveTypeRel', 'daysNum', 'startDate', 'leaveStatusRel'];

interface LeaveRecord {
  documentId: string;
  typeId: string;
  days: number;
  first: string;
  status: string;
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const days = (n: number) => `${formatNumber(n, 1)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;
/** How a balance is made up: "9.6 to start with, +8.1 accrued (1.67 a month), −4 approved". */
const balanceWorking = (b: Balance) =>
  [
    `${formatNumber(b.opening, 1)} to start with`,
    `+${formatNumber(b.accrued, 1)} accrued (${formatNumber(b.perMonth, 2)} a month)`,
    ...(b.approved ? [`−${formatNumber(b.approved, 1)} approved`] : []),
    ...(b.pending ? [`−${formatNumber(b.pending, 1)} waiting for approval`] : []),
  ].join(', ') + '.';
const shortDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

/**
 * `<solid-leave-balance>`: leave balances worked out live, the way the leave rules work them out:
 * the opening balance, plus pro rata accrual to the day, less approved and pending leave. On a leave
 * request it shows what is available on the first day, the request, and what is left; on a page, a
 * person's balances as cards. It stores nothing in its own field.
 * @param props - Formbird element properties
 */
export function LeaveBalance(props: Props) {
  const field = createFieldBinding<unknown, LeaveBalanceDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const { mode, employeeField, typeField, startField, daysField, availableField, documentId } = untrack(() => ({
    mode: def().mode ?? 'request',
    employeeField: def().employeeField ?? 'employeeRel',
    typeField: def().typeField ?? 'leaveTypeRel',
    startField: def().startField ?? 'startDate',
    daysField: def().daysField ?? 'daysNum',
    availableField: def().availableField ?? '',
    documentId: String(props.document?.documentId ?? ''),
  }));
  const zone = () => def().timeZone || undefined;
  const employee = createDocumentField(props, employeeField, toRelatedList);
  const type = createDocumentField(props, typeField, toRelatedList);
  const start = createDocumentField(props, startField, (raw) => text(raw));
  const availableNow = createDocumentField(props, availableField, (raw) => (typeof raw === 'number' ? raw : null));
  const requested = createDocumentField(props, daysField, (raw) => (raw === null || raw === undefined || raw === '' ? null : Number(raw)));

  const personId = createMemo(() => {
    if (mode === 'summary') return def().person === 'document' ? documentId : currentUser()?.documentId ?? '';
    return employee()[0]?.documentId ?? '';
  });

  // ------------------------------------------------------------------ loading
  const [account, setAccount] = createSignal<SourceDocument>();
  const [records, setRecords] = createSignal<LeaveRecord[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);

  const openingFields = () => ({ ...OPENING_FIELDS, ...(def().openingFields ?? {}) });
  let requestId = 0;
  const load = async (id: string) => {
    const mine = ++requestId;
    if (!id) {
      setAccount(undefined);
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const d = untrack(def);
      const fields = [...Object.values(untrack(openingFields)), d.sinceField ?? 'balanceDate', d.fteField ?? 'fteNum', 'employmentStartDate'];
      const leaveRequest: EsRequest =
        parseFilter(d.leaveFilter, { ...untrack(() => field.templateContext()), employeeId: id }) ??
        ({
          query: {
            bool: {
              filter: [{ term: { appTags: 'hr' } }, { term: { appTags: 'leave' } }, { term: { 'employeeRel.documentId': id } }, { terms: { 'leaveStatusRel.name': ['Approved', 'Pending'] } }],
            },
          },
        } as EsRequest);
      const [people, leave] = await Promise.all([fetchDocuments([id], fields), searchPage({ request: leaveRequest, page: 0, pageSize: 500, include: LEAVE_FIELDS })]);
      if (mine !== requestId) return;
      setAccount(people[0]);
      setRecords(
        leave.documents.map((doc) => ({
          documentId: text(doc.documentId),
          typeId: text(getPath(doc, 'leaveTypeRel.0.documentId')),
          days: Number(doc.daysNum) || 0,
          first: dayKey(doc.startDate as string, untrack(zone)),
          status: text(getPath(doc, 'leaveStatusRel.0.name')),
        })),
      );
      setError(undefined);
    } catch (err) {
      if (mine === requestId) setError(errorText(err, 'The balances could not be loaded.'));
    } finally {
      if (mine === requestId) setLoading(false);
    }
  };
  createEffect(
    () => [personId(), reloads()] as const,
    ([id]) => void load(id),
  );
  let listening = false;
  const updates = getService('BroadcastService')
    ?.on?.<unknown>(DOCUMENT_UPDATED)
    .subscribe(() => listening && setReloads((n) => n + 1));
  queueMicrotask(() => (listening = true));
  onCleanup(() => updates?.unsubscribe());

  // ------------------------------------------------------------------ balances
  const types = createMemo(() => (def().leaveTypes ?? []).filter((t) => t && t.documentId && t.name));
  const typeInfo = (value: { documentId: string; name: string; [k: string]: unknown } | undefined): LeaveTypeValue | undefined => {
    if (!value) return undefined;
    const known = types().find((t) => t.documentId === value.documentId);
    return known ?? { documentId: value.documentId, name: value.name, balanceKey: text(value.balanceKey), accrualDaysNum: Number(value.accrualDaysNum) || 0, color: text(value.color) };
  };
  const balanceOf = (t: LeaveTypeValue, at: string): Balance | null => {
    const acc = account();
    if (!acc || !t.balanceKey) return null;
    const since = dayKey(getPath(acc, def().sinceField ?? 'balanceDate') as string, zone()) || at;
    const sameKind = types().filter((x) => x.balanceKey === t.balanceKey).map((x) => x.documentId);
    return leaveBalance({
      opening: Number(getPath(acc, openingFields()[t.balanceKey] ?? `${t.balanceKey}OpeningNum`)) || 0,
      accrualPerYear: t.accrualDaysNum,
      fte: Number(getPath(acc, def().fteField ?? 'fteNum')) || 1,
      since,
      at,
      exclude: mode === 'request' ? documentId : undefined,
      requests: records().filter((r) => (sameKind.length ? sameKind.includes(r.typeId) : r.typeId === t.documentId)),
    });
  };
  const today = () => dayKey(Date.now(), zone());

  // Request mode: the chosen type, on the first day.
  const requestType = createMemo(() => typeInfo(type()[0]));
  const firstDay = () => dayKey(start(), zone()) || today();
  const requestBalance = createMemo(() => (requestType() ? balanceOf(requestType()!, firstDay()) : null));
  const after = () => (requestBalance() ? requestBalance()!.available - (requested() ?? 0) : null);

  // The available days, for the client PreSave rule (only once loaded, and only when they change).
  createEffect(
    () => (availableField && account() && requestType() ? (requestBalance()?.available ?? null) : undefined),
    (available) => {
      if (available === undefined) return;
      if (untrack(availableNow) !== available) field.setOtherField(availableField, available);
    },
  );

  const Bar = (p: { balance: Balance; taking?: number; color?: string }) => {
    const scale = () => Math.max(p.balance.available, p.taking ?? 0, 0.0001);
    const takingPct = () => Math.min(100, ((p.taking ?? 0) / scale()) * 100);
    const leftPct = () => Math.max(0, ((p.balance.available - (p.taking ?? 0)) / scale()) * 100);
    return (
      <div class="lb-bar" style={{ '--lb-color': p.color || 'var(--sj-accent)' }} aria-hidden="true">
        <Show when={p.taking}>
          <span class={['lb-bar__taking', { 'lb-bar__taking--over': (p.taking ?? 0) > p.balance.available }]} style={{ width: `${takingPct()}%` }} />
        </Show>
        <span class="lb-bar__left" style={{ width: `${leftPct()}%` }} />
      </div>
    );
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <section class={['lb', `lb--${mode}`]} aria-labelledby={def().hideLabel ? undefined : labelId} aria-label={def().hideLabel ? 'Leave balance' : undefined} aria-busy={loading() ? 'true' : 'false'}>
        <Show when={error()}>
          <div class="sj-note sj-note--danger" role="alert">
            <Icon name="alert" size={14} />
            <span>{error()}</span>
          </div>
        </Show>

        <Show when={mode === 'request'}>
          <Show
            when={personId() && requestType()}
            fallback={<p class="lb-hint">{personId() ? 'Choose the type of leave to see the balance.' : 'Choose who the leave is for.'}</p>}
          >
            <Show
              when={requestType()!.balanceKey}
              fallback={
                <p class="lb-hint">
                  <Icon name="info" size={14} />
                  {requestType()!.name} doesn't come from a balance.
                </p>
              }
            >
              <Show when={requestBalance()} fallback={<Spinner label="Working out the balance" />}>
                {(b) => (
                  <div class="lb-request">
                    <div class="lb-figures">
                      <div class="lb-figure">
                        <span class="lb-figure__label">Available {firstDay() === today() ? 'today' : `on ${shortDay(firstDay())}`}</span>
                        <span class="lb-figure__value">{days(b().available)}</span>
                      </div>
                      <div class="lb-figure">
                        <span class="lb-figure__label">This request</span>
                        <span class="lb-figure__value lb-figure__value--taking">{requested() === null ? '–' : days(requested()!)}</span>
                      </div>
                      <div class={['lb-figure', { 'lb-figure--over': (after() ?? 0) < 0 }]}>
                        <span class="lb-figure__label">Left after</span>
                        <span class="lb-figure__value">{after() === null ? '–' : days(after()!)}</span>
                      </div>
                    </div>
                    <Bar balance={b()} taking={requested() ?? 0} color={requestType()!.color} />
                    <Show
                      when={(after() ?? 0) < 0}
                      fallback={
                        <p class="lb-detail">{balanceWorking(b())}</p>
                      }
                    >
                      <div class="sj-note sj-note--danger lb-over" role="status">
                        <Icon name="alert" size={14} />
                        <span>
                          That's {days(-after()!)} more {requestType()!.name.toLowerCase()} than {employee()[0]?.documentId === currentUser()?.documentId ? 'you' : employee()[0]?.name.split(' ')[0]} will have on {shortDay(firstDay())}.
                        </span>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </Show>
          </Show>
        </Show>

        <Show when={mode === 'summary'}>
          <Show when={account()} fallback={<Show when={loading()} fallback={<p class="lb-hint">No balances to show.</p>}><Spinner label="Loading balances" /></Show>}>
            <div class="lb-cards">
              <For each={types().filter((t, i, all) => t.balanceKey && all.findIndex((x) => x.balanceKey === t.balanceKey) === i)}>
                {(t) => {
                  const b = () => balanceOf(t, today());
                  return (
                    <Show when={b()}>
                      {(balance) => (
                        <article class="lb-card" style={{ '--lb-color': t.color || 'var(--sj-accent)' }}>
                          <header class="lb-card__head">
                            <span class="lb-dot" aria-hidden="true" />
                            <span class="lb-card__name">{t.name}</span>
                          </header>
                          <div class="lb-card__value">
                            <strong>{formatNumber(balance().available, 1)}</strong> <span>days available</span>
                          </div>
                          <Bar balance={balance()} color={t.color} />
                          <ul class="lb-card__facts">
                            <li>+{formatNumber(balance().perMonth, 2)} a month</li>
                            <Show when={balance().pending}>
                              <li class="lb-card__pending">{formatNumber(balance().pending, 1)} waiting for approval</li>
                            </Show>
                            <li>{formatNumber(balance().approved, 1)} approved this year</li>
                          </ul>
                        </article>
                      )}
                    </Show>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </section>
    </FieldShell>
  );
}

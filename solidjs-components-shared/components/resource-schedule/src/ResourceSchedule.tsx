import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  Avatar,
  Button,
  cssColor,
  currentUser,
  dayKey,
  dayStart,
  errorText,
  FieldShell,
  followDocumentLink,
  formatNumber,
  getService,
  hueOf,
  Icon,
  IconButton,
  openDocument,
  openNewDocument,
  parseFilter,
  pathValues,
  searchPage,
  Spinner,
  toRelatedDoc,
  uid,
  withRequiredClause,
  workingDays,
  createFieldBinding,
  type BaseDefinition,
  type ElementProps,
  type EsRequest,
  type FormbirdElementProps,
  type Holiday,
  type OpenMode,
  type SourceDocument,
} from '@solidjs-components/kit';
import { addDayKey, dragRange, groupStaffing, placeItems, weekStart, windowDays, type ScheduleItem } from './schedule';

/** A figure shown beside each row's name: a leave balance, hours this week. */
export interface RowFigure {
  label: string;
  /** Dot path on the row's document. */
  path: string;
  /** After the number ("d"). */
  unit?: string;
  /** Shown as a warning below this. */
  warnBelow?: number;
}

export interface ResourceScheduleDefinition extends BaseDefinition {
  /** Elasticsearch request for the rows (people, assets). Default: active accounts, by name. */
  rowFilter?: string | Record<string, unknown>;
  /** Row name and second line (dot paths). Default the summary name and nothing. */
  rowLabelField?: string;
  /** Second line under a row's name (dot path). */
  rowDetailField?: string;
  /** Group rows by this path ("teamRel.name"); each group shows who is left each day. */
  groupField?: string;
  /** The group's minimum on a work day, read from its rows ("teamRel.minOnDutyNum"). */
  groupMinField?: string;
  /** Figures beside each name. */
  rowFigures?: RowFigure[];

  /** Elasticsearch request for the records; the element adds the visible days. */
  filter?: string | Record<string, unknown>;
  /** Path on a record to its row's documentId. Default "employeeRel.documentId". */
  rowField?: string;
  /** A record's first and last day (instants read in `timeZone`). Default "startDate" / "endDate". */
  startField?: string;
  /** A record's last day (default "endDate"). */
  endField?: string;
  /** Boolean fields: the record starts / ends at midday. */
  startHalfField?: string;
  /** Boolean field: the record ends at midday. */
  endHalfField?: string;
  /** What a bar says and its colour (dot paths; arrays are read through). */
  labelField?: string;
  /** A bar's colour (default: a colour from its label). */
  colorField?: string;
  /** A record's status (dot path to its name), in the tooltip. */
  statusField?: string;
  /** Statuses drawn hatched: not confirmed yet. */
  tentativeStatuses?: string[];
  /** Count tentative records when working out who is left. Default true: a pending request is a clash in waiting. */
  countTentative?: boolean;

  /** Time zone the days are in. Default the browser's. */
  timeZone?: string;
  /** Public holidays: shaded, and not counted as days off ("YYYY-MM-DD" or `{ date, name }`). */
  holidays?: (string | Holiday)[];
  /** Days of the week that are worked, 0 (Sunday) to 6. Default Monday to Friday. */
  workDays?: number[];
  /** Days shown, and the lengths offered. Default 14, [14, 28]. */
  days?: number;
  /** The lengths, in days, offered as views (default [14, 28]). */
  views?: number[];

  /** Template of new records: drag across free days in a row to start one. */
  templateId?: string;
  /** Who can start a new record on their row: "me" (default) or "anyone" (managers). */
  createFor?: 'me' | 'anyone';
  /** Field of the new record that holds the row. Default: the first part of `rowField` ("employeeRel"). */
  newRowField?: string;
  /** What the new record keeps of its row besides documentId and name: `{ storedKey: 'path' }`. */
  rowValueFields?: Record<string, string>;
  /** Text of the toolbar button and the drag confirmation. Default "New". */
  newLabel?: string;
  /** Where a record opens: "route" (default), "modal" or "newTab". */
  openIn?: OpenMode;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<ResourceScheduleDefinition, unknown>>;

interface Row {
  id: string;
  name: string;
  detail: string;
  group: string;
  min: number;
  figures: { label: string; value: number | null; text: string; warn: boolean }[];
  doc: SourceDocument;
}

const DOCUMENT_UPDATED = 'document:updated';
const ACTIVE_ACCOUNTS = {
  sort: [{ 'systemHeader.summaryName': 'asc' }],
  query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }], must_not: [{ term: { inactiveBool: true } }] } },
};
const first = (doc: unknown, path: string | undefined): unknown => (path ? pathValues(doc, path)[0] : undefined);
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const keyLabel = (key: string, options: Intl.DateTimeFormatOptions) => new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
const shortDay = (key: string) => keyLabel(key, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * `<solid-resource-schedule>`: rows of people (or assets) by day, with their records as bars: the
 * team's leave, a dispatch board, a roster. Rows can be grouped (a team), and each group shows how
 * many are left each day against its minimum. Weekends and public holidays are shaded, figures such
 * as leave balances sit beside each name, and dragging across free days starts a new record. It
 * stores nothing in its own field.
 * @param props - Formbird element properties
 */
export function ResourceSchedule(props: Props) {
  const field = createFieldBinding<unknown, ResourceScheduleDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const me = currentUser();
  const zone = () => def().timeZone || undefined;
  const today = () => dayKey(Date.now(), zone());

  const [length, setLength] = createSignal(untrack(() => Math.max(7, Number(def().days) || 14)));
  const [start, setStart] = createSignal(untrack(() => weekStart(today())));
  const [rows, setRows] = createSignal<Row[]>([]);
  const [items, setItems] = createSignal<ScheduleItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);

  const holidays = createMemo(() => {
    const map = new Map<string, string>();
    for (const h of def().holidays ?? []) {
      const holiday = typeof h === 'string' ? { date: h } : h;
      if (holiday && typeof holiday.date === 'string') map.set(holiday.date, holiday.name || 'Public holiday');
    }
    return map;
  });
  const workDays = () => (Array.isArray(def().workDays) && def().workDays!.length ? def().workDays! : [1, 2, 3, 4, 5]);
  const days = createMemo(() => windowDays(start(), length(), { today: today(), workDays: workDays(), holidays: holidays() }));
  const lastDay = () => addDayKey(start(), length() - 1);

  // ------------------------------------------------------------------ loading
  const toRow = (doc: SourceDocument): Row => {
    const d = untrack(def);
    return {
      id: text(doc.documentId),
      name: text(first(doc, d.rowLabelField ?? 'systemHeader.summaryName')) || 'Unnamed',
      detail: text(first(doc, d.rowDetailField)),
      group: d.groupField ? text(first(doc, d.groupField)) || 'Others' : '',
      min: Number(first(doc, d.groupMinField)) || 0,
      figures: (d.rowFigures ?? []).map((f) => {
        const raw = first(doc, f.path);
        const value = raw === null || raw === undefined || raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw);
        return {
          label: f.label,
          value,
          text: value === null ? '–' : `${formatNumber(value, 1)}${f.unit ? ` ${f.unit}` : ''}`,
          warn: value !== null && f.warnBelow !== undefined && value < f.warnBelow,
        };
      }),
      doc,
    };
  };
  const toItem = (doc: SourceDocument): ScheduleItem => {
    const d = untrack(def);
    const tz = untrack(zone);
    const firstDay = dayKey(first(doc, d.startField ?? 'startDate') as string, tz);
    const lastOf = dayKey(first(doc, d.endField ?? 'endDate') as string, tz);
    const label = text(first(doc, d.labelField)) || text(first(doc, 'systemHeader.summaryName'));
    const status = text(first(doc, d.statusField));
    const halfFirst = first(doc, d.startHalfField) === true;
    const halfLast = first(doc, d.endHalfField) === true;
    const count = workingDays({ first: firstDay, last: lastOf, holidays: d.holidays, workDays: d.workDays, halfFirst, halfLast }).days;
    const range = firstDay === lastOf ? shortDay(firstDay) : `${shortDay(firstDay)} – ${shortDay(lastOf)}`;
    return {
      documentId: text(doc.documentId),
      rowId: text(first(doc, d.rowField ?? 'employeeRel.documentId')),
      first: firstDay,
      last: lastOf,
      label,
      color: cssColor(first(doc, d.colorField)) ?? `oklch(0.62 0.13 ${hueOf(label)})`,
      tentative: !!status && (d.tentativeStatuses ?? []).includes(status),
      halfFirst,
      halfLast,
      title: [label, status, `${range}${count ? ` · ${count} ${count === 1 ? 'day' : 'days'}` : ''}`].filter(Boolean).join(' · '),
    };
  };

  let rowRequest = 0;
  const loadRows = async () => {
    const id = ++rowRequest;
    try {
      const request = parseFilter(untrack(def).rowFilter, untrack(() => field.templateContext())) ?? structuredClone(ACTIVE_ACCOUNTS);
      const { documents } = await searchPage({ request, page: 0, pageSize: 300 });
      if (id !== rowRequest) return;
      setRows(documents.map(toRow));
    } catch (err) {
      if (id === rowRequest) setError(errorText(err, 'The rows could not be loaded.'));
    }
  };
  let itemRequest = 0;
  const loadItems = async () => {
    const id = ++itemRequest;
    const d = untrack(def);
    let request: EsRequest | undefined;
    try {
      request = parseFilter(d.filter, untrack(() => field.templateContext()));
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (!request) {
      setItems([]);
      return;
    }
    // Only records touching the visible days: starting before the day after the last, ending on or after the first.
    const tz = untrack(zone);
    withRequiredClause(request, { range: { [d.startField ?? 'startDate']: { lt: dayStart(addDayKey(untrack(lastDay), 1), tz) } } });
    withRequiredClause(request, { range: { [d.endField ?? 'endDate']: { gte: dayStart(untrack(start), tz) } } });
    try {
      const { documents } = await searchPage({ request, page: 0, pageSize: 500 });
      if (id !== itemRequest) return;
      setItems(documents.map(toItem).filter((item) => item.rowId && item.first && item.last));
    } catch (err) {
      if (id === itemRequest) setError(errorText(err, 'The records could not be loaded.'));
    }
  };
  createEffect(
    () => JSON.stringify([def().rowFilter ?? null, def().rowFigures ?? null, reloads()]),
    () => void loadRows(),
  );
  createEffect(
    () => JSON.stringify([def().filter ?? null, start(), length(), reloads()]),
    () => {
      setLoading(true);
      setError(undefined);
      void Promise.all([loadItems()]).finally(() => {
        setLoading(false);
        setLoaded(true);
      });
    },
  );

  // Look again after any save in the app (a request approved in another tab, a new one saved).
  let listening = false;
  const updates = getService('BroadcastService')
    ?.on?.<unknown>(DOCUMENT_UPDATED)
    .subscribe(() => listening && setReloads((n) => n + 1));
  queueMicrotask(() => (listening = true));
  onCleanup(() => updates?.unsubscribe());

  // ------------------------------------------------------------------ layout
  const layout = createMemo(() => placeItems(items(), start(), length()));
  const itemsByRow = createMemo(() => {
    const map = new Map<string, ReturnType<typeof layout>['placed']>();
    for (const item of layout().placed) map.set(item.rowId, [...(map.get(item.rowId) ?? []), item]);
    return map;
  });
  const groups = createMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows()) map.set(row.group, [...(map.get(row.group) ?? []), row]);
    return [...map.entries()].map(([name, list]) => {
      const min = Math.max(0, ...list.map((r) => r.min));
      return {
        name,
        rows: list,
        min,
        staffing: groupStaffing({ rows: list.map((r) => ({ id: r.id, name: r.name })), items: items(), days: days(), min, countTentative: def().countTentative !== false }),
      };
    });
  });
  const belowCount = createMemo(() => groups().reduce((sum, g) => sum + g.staffing.filter((d) => d.below).length, 0));
  const legend = createMemo(() => {
    const seen = new Map<string, string>();
    for (const item of layout().placed) if (!seen.has(item.label)) seen.set(item.label, item.color);
    return [...seen.entries()];
  });
  const hasTentative = createMemo(() => layout().placed.some((item) => item.tentative));

  // ------------------------------------------------------------------ navigating
  const move = (direction: number) => setStart((s) => addDayKey(s, direction * (length() >= 28 ? 28 : 7)));
  const goToday = () => setStart(weekStart(today()));
  const rangeText = () => {
    const a = start();
    const b = lastDay();
    const sameYear = a.slice(0, 4) === b.slice(0, 4);
    return `${keyLabel(a, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })} – ${keyLabel(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  // ------------------------------------------------------------------ new records
  const canCreateOn = (rowId: string) => !!def().templateId && !field.disabled() && (def().createFor === 'anyone' || rowId === me?.documentId);
  const [drag, setDrag] = createSignal<{ rowId: string; a: string; b: string } | null>(null);
  const [pick, setPick] = createSignal<{ rowId: string; first: string; last: string } | null>(null);
  let dragging = false;
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    const d = untrack(drag);
    setDrag(null);
    if (d) setPick({ rowId: d.rowId, ...dragRange(d.a, d.b) });
  };
  document.addEventListener('pointerup', endDrag);
  onCleanup(() => document.removeEventListener('pointerup', endDrag));
  const selected = (rowId: string, key: string) => {
    const d = drag();
    if (d && d.rowId === rowId) {
      const r = dragRange(d.a, d.b);
      return key >= r.first && key <= r.last;
    }
    const p = pick();
    return !!p && p.rowId === rowId && key >= p.first && key <= p.last;
  };
  const rowValue = (rowId: string) => {
    const row = rows().find((r) => r.id === rowId);
    return row ? toRelatedDoc(row.doc, def().rowValueFields) : null;
  };
  const newRowField = () => def().newRowField || (def().rowField ?? 'employeeRel.documentId').split('.')[0];
  const create = (range?: { rowId: string; first: string; last: string }) => {
    const d = untrack(def);
    if (!d.templateId) return;
    const tz = untrack(zone);
    const rowId = range?.rowId ?? me?.documentId ?? '';
    const value = untrack(() => rowValue(rowId));
    const values: Record<string, unknown> = {};
    if (value) values[untrack(newRowField)] = [value];
    if (range) {
      values[d.startField ?? 'startDate'] = dayStart(range.first, tz);
      values[d.endField ?? 'endDate'] = dayStart(range.last, tz);
    }
    setPick(null);
    openNewDocument(d.templateId, values);
  };
  const pickSummary = () => {
    const p = pick();
    if (!p) return '';
    const row = rows().find((r) => r.id === p.rowId);
    const count = workingDays({ first: p.first, last: p.last, holidays: def().holidays, workDays: workDays() }).days;
    const range = p.first === p.last ? shortDay(p.first) : `${shortDay(p.first)} – ${shortDay(p.last)}`;
    return `${row?.id === me?.documentId ? 'You' : row?.name ?? ''}: ${range} · ${count} working ${count === 1 ? 'day' : 'days'}`;
  };

  const open = (event: MouseEvent, documentId: string) => {
    const mode = def().openIn ?? 'route';
    if (event.ctrlKey || event.metaKey || event.shiftKey || mode === 'route') return;
    event.preventDefault();
    openDocument(documentId, mode);
  };

  const columns = () => `repeat(${length()}, minmax(var(--rs-day-min), 1fr))`;

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <section class="rs" aria-labelledby={def().hideLabel ? undefined : labelId} aria-label={def().hideLabel ? 'Schedule' : undefined} aria-busy={loading() ? 'true' : 'false'}>
        <div class="rs-toolbar">
          <div class="rs-nav">
            <IconButton icon="chevron-left" label="Earlier" onClick={() => move(-1)} />
            <Button size="sm" onClick={goToday}>
              Today
            </Button>
            <IconButton icon="chevron-right" label="Later" onClick={() => move(1)} />
            <strong class="rs-range" aria-live="polite">
              {rangeText()}
            </strong>
            <Show when={loading() && loaded()}>
              <Spinner label="Refreshing" />
            </Show>
          </div>
          <div class="rs-tools">
            <Show when={belowCount()}>
              <span class="rs-alert" title="Days a team would have fewer people than its minimum">
                <Icon name="alert" size={13} />
                {belowCount()} {belowCount() === 1 ? 'day' : 'days'} below minimum
              </span>
            </Show>
            <Show when={(def().views ?? [14, 28]).length > 1}>
              <div class="sj-segmented" role="group" aria-label="Days shown">
                <For each={def().views ?? [14, 28]}>
                  {(n) => (
                    <button type="button" aria-pressed={length() === n ? 'true' : 'false'} onClick={() => setLength(n)}>
                      {n % 7 === 0 ? `${n / 7} weeks` : `${n} days`}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={def().templateId && me && !field.disabled()}>
              <Button size="sm" variant="primary" icon="plus" onClick={() => create()}>
                {def().newLabel || 'New'}
              </Button>
            </Show>
          </div>
        </div>

        <Show when={error()}>
          <div class="sj-note sj-note--danger" role="alert">
            <Icon name="alert" size={14} />
            <span>{error()}</span>
            <Button size="sm" variant="subtle" icon="refresh" onClick={() => setReloads((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </Show>

        <Show when={pick()}>
          <div class="rs-pick" role="group" aria-label="New record">
            <Icon name="calendar" size={14} />
            <span class="rs-pick__text">{pickSummary()}</span>
            <Button size="sm" variant="primary" onClick={() => create(pick()!)}>
              {def().newLabel || 'New'}
            </Button>
            <Button size="sm" variant="subtle" onClick={() => setPick(null)}>
              Cancel
            </Button>
          </div>
        </Show>

        <div class="rs-scroll" style={{ '--rs-days': String(length()) }}>
          <div class="rs-grid" role="grid" aria-label={`Schedule, ${rangeText()}`} aria-rowcount={rows().length + 1} onClick={followDocumentLink}>
            <div class="rs-row rs-row--head" role="row">
              <div class="rs-name rs-name--head" role="columnheader">
                {rows().length} {rows().length === 1 ? 'person' : 'people'}
              </div>
              <div class="rs-track rs-track--head" style={{ 'grid-template-columns': columns() }}>
                <For each={days()} keyed={(day) => day.key}>
                  {(day) => (
                    <div
                      role="columnheader"
                      class={['rs-day-head', { 'rs-day--off': day().off, 'rs-day--holiday': !!day().holiday, 'rs-day--today': day().today, 'rs-day--month': day().monthStart }]}
                      title={day().holiday ? `${keyLabel(day().key, { weekday: 'long', day: 'numeric', month: 'long' })}: ${day().holiday}` : keyLabel(day().key, { weekday: 'long', day: 'numeric', month: 'long' })}
                    >
                      <Show when={day().monthStart}>
                        <span class="rs-month">{keyLabel(day().key, { month: 'short' })}</span>
                      </Show>
                      <span class="rs-dow">{keyLabel(day().key, { weekday: 'narrow' })}</span>
                      <span class="rs-date">{Number(day().key.slice(8))}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <Show
              when={rows().length}
              fallback={
                <div class="rs-empty">
                  <Show when={loaded()} fallback={<Spinner label="Loading" />}>
                    Nobody to show.
                  </Show>
                </div>
              }
            >
              <For each={groups()} keyed={(group) => group.name}>
                {(group) => (
                  <>
                    <Show when={group().name}>
                      <div class="rs-row rs-row--group" role="row">
                        <div class="rs-name rs-name--group" role="rowheader">
                          <span class="rs-group__name">{group().name}</span>
                          <span class="rs-group__meta">
                            {group().rows.length}
                            <Show when={group().min}> · min {group().min}</Show>
                          </span>
                        </div>
                        <div class="rs-track rs-track--group" style={{ 'grid-template-columns': columns() }}>
                          <For each={group().staffing}>
                            {(day, i) => {
                              const info = () => days()[i()];
                              return (
                                <div
                                  role="gridcell"
                                  class={['rs-staff', { 'rs-staff--below': day.below, 'rs-staff--short': !day.below && day.away > 0, 'rs-day--off': info()?.off || !!info()?.holiday }]}
                                  title={
                                    info()?.off || info()?.holiday
                                      ? ''
                                      : `${formatNumber(day.available, 1)} of ${group().rows.length} in${group().min ? ` (minimum ${group().min})` : ''}${day.names.length ? `. Away: ${day.names.join(', ')}` : ''}`
                                  }
                                >
                                  <Show when={!info()?.off && !info()?.holiday && (day.away > 0 || group().min)}>{formatNumber(day.available, 1)}</Show>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    </Show>
                    <For each={group().rows} keyed={(row) => row.id}>
                      {(row) => {
                        const placed = () => itemsByRow().get(row().id) ?? [];
                        const lanes = () => Math.max(1, layout().lanes.get(row().id) ?? 1);
                        const creatable = () => canCreateOn(row().id);
                        return (
                          <div class={['rs-row', { 'rs-row--me': row().id === me?.documentId }]} role="row">
                            <div class="rs-name" role="rowheader">
                              <Avatar name={row().name} size="sm" />
                              <span class="rs-name__text">
                                <a class="rs-name__link" href={`/form/${row().id}`} onClick={(event) => open(event, row().id)}>
                                  {row().name}
                                </a>
                                <Show when={row().detail}>
                                  <span class="rs-name__detail">{row().detail}</span>
                                </Show>
                              </span>
                              <Show when={row().figures.length}>
                                <span class="rs-figures">
                                  <For each={row().figures}>
                                    {(f) => (
                                      <span class={['rs-figure', { 'rs-figure--warn': f.warn }]} title={`${f.label}: ${f.text}`}>
                                        <span class="sj-visually-hidden">{f.label}: </span>
                                        {f.text}
                                      </span>
                                    )}
                                  </For>
                                </span>
                              </Show>
                            </div>
                            <div
                              class={['rs-track', { 'rs-track--create': creatable() }]}
                              style={{ 'grid-template-columns': columns(), 'grid-template-rows': `repeat(${lanes()}, var(--rs-lane))` }}
                            >
                              <For each={days()} keyed={(day) => day.key}>
                                {(day, i) => (
                                  <div
                                    class={[
                                      'rs-cell',
                                      { 'rs-day--off': day().off, 'rs-day--holiday': !!day().holiday, 'rs-day--today': day().today, 'rs-cell--selected': selected(row().id, day().key) },
                                    ]}
                                    style={{ 'grid-column': String(i() + 1), 'grid-row': `1 / span ${lanes()}` }}
                                    data-day={day().key}
                                    onPointerDown={(event) => {
                                      if (!creatable() || event.button !== 0) return;
                                      event.preventDefault();
                                      dragging = true;
                                      setPick(null);
                                      setDrag({ rowId: row().id, a: day().key, b: day().key });
                                    }}
                                    onPointerEnter={() => {
                                      const d = drag();
                                      if (dragging && d && d.rowId === row().id) setDrag({ ...d, b: day().key });
                                    }}
                                  />
                                )}
                              </For>
                              <For each={placed()} keyed={(item) => item.documentId}>
                                {(item) => (
                                  <a
                                    class={['rs-bar', { 'rs-bar--tentative': item().tentative, 'rs-bar--clip-start': item().clippedStart, 'rs-bar--clip-end': item().clippedEnd }]}
                                    href={`/form/${item().documentId}`}
                                    title={item().title}
                                    aria-label={`${row().name}: ${item().title}`}
                                    style={{
                                      'grid-column': `${item().from + 1} / ${item().to + 2}`,
                                      'grid-row': String(item().lane + 1),
                                      '--rs-bar': item().color,
                                      '--rs-span': String(item().to - item().from + 1),
                                      'margin-left': item().halfFirst && !item().clippedStart ? 'calc(100% / var(--rs-span) / 2)' : undefined,
                                      'margin-right': item().halfLast && !item().clippedEnd ? 'calc(100% / var(--rs-span) / 2)' : undefined,
                                    }}
                                    onClick={(event) => open(event, item().documentId)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                  >
                                    <span class="rs-bar__label">{item().label}</span>
                                  </a>
                                )}
                              </For>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </>
                )}
              </For>
            </Show>
          </div>
        </div>

        <Show when={legend().length || hasTentative() || holidays().size}>
          <ul class="rs-legend" aria-label="Key">
            <For each={legend()}>
              {([label, color]) => (
                <li>
                  <span class="rs-swatch" style={{ '--rs-bar': color }} aria-hidden="true" />
                  {label}
                </li>
              )}
            </For>
            <Show when={hasTentative()}>
              <li>
                <span class="rs-swatch rs-swatch--tentative" aria-hidden="true" />
                {(def().tentativeStatuses ?? []).join(', ') || 'Tentative'}
              </li>
            </Show>
            <Show when={days().some((d) => d.holiday)}>
              <li>
                <span class="rs-swatch rs-swatch--holiday" aria-hidden="true" />
                Public holiday
              </li>
            </Show>
            <Show when={groups().some((g) => g.min)}>
              <li>
                <span class="rs-swatch rs-swatch--below" aria-hidden="true" />
                Below minimum
              </li>
            </Show>
            <Show when={rows().some((r) => canCreateOn(r.id))}>
              <li class="rs-legend__hint">Drag across free days to start a new one.</li>
            </Show>
          </ul>
        </Show>
      </section>
    </FieldShell>
  );
}


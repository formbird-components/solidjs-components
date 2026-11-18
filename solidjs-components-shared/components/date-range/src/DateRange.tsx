import { createMemo, For, Show, untrack } from 'solid-js';
import {
  addDays,
  createDocumentField,
  createFieldBinding,
  dayKey,
  dayStart,
  FieldShell,
  formatDuration,
  fromInputs,
  getPath,
  HOUR,
  Icon,
  MINUTE,
  rangeLabel,
  roundUp,
  startOfDay,
  timeRangeProblems,
  toDate,
  toDateInput,
  toTimeInput,
  uid,
  workingDays,
  type BaseDefinition,
  type ElementProps,
  type FieldBinding,
  type FormbirdElementProps,
  type Holiday,
} from '@solidjs-components/kit';

export interface DateRangeDefinition extends BaseDefinition {
  /** "datetime" (default): a start and end date and time; "days": a first and last day, counted in working days. Read once. */
  mode?: 'datetime' | 'days';
  /** Field the end is written to; this element's own field holds the start. */
  endField: string;
  /** Label of the start (default "Starts"). */
  startLabel?: string;
  /** Label of the end (default "Ends"). */
  endLabel?: string;
  /** What the range is of, in the messages: "The booking must end after it starts" (default "booking", or "leave" for days). */
  noun?: string;
  /** Warn when a new range starts in the past (default true). */
  warnPast?: boolean;
  hideLabel?: boolean;

  // ---------------------------------------------------------------- datetime
  /** Minutes between the times offered (default 30). */
  stepMinutes?: number;
  /** Quick durations offered: hours (default [1, 2, 4, 8]); working days in days mode (default [1, 2, 5, 10]). */
  presets?: number[];
  /** Shortest range allowed, in minutes (default 15). */
  minMinutes?: number;
  /** Longest range allowed, in hours. */
  maxHours?: number;
  /** Where else the longest range comes from: another field's path, e.g. "assetRel.0.maxBookingHours". */
  maxHoursFrom?: string;
  /** The message when the range is too long; `{max}` receives the hours. */
  maxText?: string;
  /** Length of a new range when only the start is set, in hours (default 2). */
  defaultHours?: number;

  // ---------------------------------------------------------------- days
  /** Time zone the days are in (the company's, e.g. "Australia/Sydney"). Default: the browser's. */
  timeZone?: string;
  /** Public holidays: "YYYY-MM-DD", or `{ date, name }`. Not counted as working days. */
  holidays?: (string | Holiday)[];
  /** Days of the week that are worked, 0 (Sunday) to 6 (Saturday). Default Monday to Friday. */
  workDays?: number[];
  /** Offer half days: "Starts at midday" and "Ends at midday", written to these boolean fields. */
  startHalfField?: string;
  /** Boolean field: the last day ends at midday. */
  endHalfField?: string;
  /** Field the working-day count is written to (e.g. "daysNum"), so other fields and rules can use it. */
  daysField?: string;
}

type Props = ElementProps<FormbirdElementProps<DateRangeDefinition, unknown>>;

const asIso = (raw: unknown): string => {
  const date = toDate(raw);
  return date ? date.toISOString() : '';
};

/**
 * `<solid-date-range>`: when something starts and ends, as two fields. In date and time mode, moving
 * the start keeps the duration, quick durations set the end, and the range is checked with the same
 * rules the booking rulesets apply on save. In days mode it holds a first and last day, offers half
 * days, and counts working days without weekends and public holidays.
 * @param props - Formbird element properties
 */
export function DateRange(props: Props) {
  const field = createFieldBinding<string, DateRangeDefinition>(props, { parse: asIso });
  return untrack(() => field.definition().mode) === 'days' ? <DayRange props={props} field={field} /> : <TimeRange props={props} field={field} />;
}

// ------------------------------------------------------------------------------------------------
// Date and time
// ------------------------------------------------------------------------------------------------

function TimeRange(o: { props: Props; field: FieldBinding<string, DateRangeDefinition> }) {
  const { props, field } = o;
  const def = field.definition;
  const labelId = uid('label');
  const startId = uid('start');
  const endId = uid('end');
  const endField = untrack(() => def().endField || 'endDate');
  const end = createDocumentField(props, endField, asIso);
  const [maxSourceField, ...maxSourcePath] = untrack(() => (def().maxHoursFrom ?? '').split('.'));
  const maxSource = createDocumentField(props, maxSourceField ?? '');

  const step = () => Math.max(5, Number(def().stepMinutes) || 30);
  const isNew = untrack(() => !props.document?.systemHeader?.versionId);

  const startTime = () => toDate(field.value())?.getTime();
  const endTime = () => toDate(end())?.getTime();
  const maxHours = createMemo(() => {
    const fromField = maxSourceField ? Number(getPath(maxSource(), maxSourcePath.join('.'))) : NaN;
    return Number.isFinite(fromField) && fromField > 0 ? fromField : Number(def().maxHours) || undefined;
  });

  const problems = createMemo(() => {
    if (!field.value() && !end()) return [];
    const list = timeRangeProblems({ start: field.value(), end: end(), maxHours: maxHours(), minMinutes: def().minMinutes, noun: def().noun, maxText: def().maxText });
    const start = startTime();
    if (isNew && def().warnPast !== false && start !== undefined && start < Date.now() - 5 * MINUTE) {
      list.push('This starts in the past.');
    }
    return list;
  });

  const write = (start: number | undefined, finish: number | undefined) => {
    field.setValue(start === undefined ? '' : new Date(start).toISOString());
    field.setOtherField(endField, finish === undefined ? '' : new Date(finish).toISOString());
  };

  const setStart = (dateText: string, timeText: string) => {
    const iso = fromInputs(dateText, timeText);
    if (!iso) return;
    const next = new Date(iso).getTime();
    const before = startTime();
    const finish = endTime();
    // Keep the duration when the start moves; give a new range its default length.
    const duration = before !== undefined && finish !== undefined && finish > before ? finish - before : (Number(def().defaultHours) || 2) * HOUR;
    write(next, next + duration);
  };

  const setEnd = (dateText: string, timeText: string) => {
    const iso = fromInputs(dateText, timeText);
    if (!iso) return;
    field.setOtherField(endField, iso);
  };

  const applyPreset = (hours: number) => {
    const start = startTime() ?? roundUp(Date.now(), step());
    write(start, start + hours * HOUR);
  };

  const restOfDay = () => {
    const start = startTime() ?? roundUp(Date.now(), step());
    const evening = startOfDay(start) + 17 * HOUR;
    write(start, evening > start ? evening : addDays(startOfDay(start), 1) + 17 * HOUR);
  };

  const timeOptions = (current: string) => {
    const options: string[] = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += step()) {
      options.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    }
    if (current && !options.includes(current)) options.push(current);
    return options.sort();
  };
  const timeText = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  // The label column fits the longer label ("Booking Completion"), so the inputs line up.
  const labelWidth = () => `${Math.max(4, (def().startLabel ?? 'Starts').length, (def().endLabel ?? 'Ends').length) * 0.62 + 0.6}em`;

  const duration = () => {
    const start = startTime();
    const finish = endTime();
    return start !== undefined && finish !== undefined && finish > start ? formatDuration(finish - start) : '';
  };

  const Row = (rowProps: { id: string; label: string; value: string; onChange: (date: string, time: string) => void }) => {
    const date = () => toDateInput(rowProps.value);
    const time = () => toTimeInput(rowProps.value);
    return (
      <div class="dr-row">
        <label class="dr-row__label" for={rowProps.id}>
          {rowProps.label}
        </label>
        <input
          id={rowProps.id}
          class="sj-input dr-date"
          type="date"
          value={date()}
          aria-invalid={problems().length ? 'true' : undefined}
          onChange={(event) => rowProps.onChange(event.currentTarget.value, time() || toTimeInput(roundUp(Date.now(), step())))}
        />
        <select
          class="sj-input dr-time"
          aria-label={`${rowProps.label} time`}
          value={time()}
          disabled={!date()}
          onChange={(event) => rowProps.onChange(date(), event.currentTarget.value)}
        >
          <Show when={!time()}>
            <option value="">--:--</option>
          </Show>
          <For each={timeOptions(time())}>{(option) => <option value={option}>{timeText(option)}</option>}</For>
        </select>
      </div>
    );
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <Show
        when={!field.disabled()}
        fallback={
          <div class="dr-readonly" aria-labelledby={labelId}>
            <Icon name="calendar" size={14} />
            <span>{rangeLabel(field.value(), end()) || 'Not set'}</span>
            <Show when={duration()}>
              <span class="dr-duration">{duration()}</span>
            </Show>
          </div>
        }
      >
        <div class="dr" role="group" aria-labelledby={labelId} style={{ '--dr-label': labelWidth() }}>
          <Row id={startId} label={def().startLabel ?? 'Starts'} value={field.value()} onChange={setStart} />
          <Row id={endId} label={def().endLabel ?? 'Ends'} value={end()} onChange={setEnd} />
          <div class="dr-meta">
            <div class="dr-presets" role="group" aria-label="Quick durations">
              <For each={def().presets ?? [1, 2, 4, 8]}>
                {(hours) => (
                  <button type="button" class="dr-preset" onClick={() => applyPreset(hours)}>
                    {hours < 1 ? `${hours * 60} min` : `${hours} h`}
                  </button>
                )}
              </For>
              <button type="button" class="dr-preset" onClick={restOfDay}>
                Until 5 pm
              </button>
            </div>
            <Show when={duration()}>
              <span class="dr-duration" aria-live="polite">
                <Icon name="clock" size={13} />
                {duration()}
                <Show when={maxHours()}>{(max) => <span class="dr-max"> of max {max()} h</span>}</Show>
              </span>
            </Show>
          </div>
          <Show when={problems().length}>
            <div class="sj-note sj-note--warning dr-problems" role="status">
              <Icon name="alert" size={14} />
              <div>
                <For each={problems()}>{(problem) => <div>{problem}</div>}</For>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </FieldShell>
  );
}

// ------------------------------------------------------------------------------------------------
// Days
// ------------------------------------------------------------------------------------------------

/** Days shown in the strip before it says "+N more". */
const STRIP_DAYS = 42;

/** A day key ("2026-11-05") as a calendar date at UTC midnight, for arithmetic and labels. */
const keyTime = (key: string) => Date.parse(`${key}T00:00:00Z`);
const keyAdd = (key: string, days: number) => new Date(keyTime(key) + days * 86_400_000).toISOString().slice(0, 10);
const keyLabel = (key: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  key ? new Date(keyTime(key)).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' }) : '';
const dayCount = (days: number) => `${days % 1 ? days.toFixed(1) : days} working ${days === 1 ? 'day' : 'days'}`;

function DayRange(o: { props: Props; field: FieldBinding<string, DateRangeDefinition> }) {
  const { props, field } = o;
  const def = field.definition;
  const labelId = uid('label');
  const firstId = uid('first');
  const lastId = uid('last');
  const { endField, startHalfField, endHalfField, daysField, isNew } = untrack(() => ({
    endField: def().endField || 'endDate',
    startHalfField: def().startHalfField ?? '',
    endHalfField: def().endHalfField ?? '',
    daysField: def().daysField ?? '',
    isNew: !props.document?.systemHeader?.versionId,
  }));
  const end = createDocumentField(props, endField, asIso);
  const halfFirst = createDocumentField(props, startHalfField, (raw) => raw === true);
  const halfLast = createDocumentField(props, endHalfField, (raw) => raw === true);
  const noun = () => def().noun || 'leave';
  const zone = () => def().timeZone || undefined;

  const first = createMemo(() => dayKey(field.value(), zone()));
  const last = createMemo(() => dayKey(end(), zone()));
  const holidays = createMemo(() =>
    (def().holidays ?? []).map((h) => (typeof h === 'string' ? { date: h } : h)).filter((h): h is Holiday => !!h && typeof h.date === 'string'),
  );
  const holidayName = createMemo(() => new Map(holidays().map((h) => [h.date, h.name ?? 'Public holiday'])));
  const workDays = () => (Array.isArray(def().workDays) && def().workDays!.length ? def().workDays! : [1, 2, 3, 4, 5]);
  const count = createMemo(() =>
    workingDays({ first: first(), last: last(), holidays: holidays(), workDays: workDays(), halfFirst: halfFirst(), halfLast: halfLast() }),
  );
  const today = () => dayKey(Date.now(), zone());

  const problems = createMemo(() => {
    if (!first() && !last()) return [];
    if (!first() || !last()) return [`Choose the first and last day of the ${noun()}.`];
    if (last() < first()) return ["The last day can't be before the first."];
    const list: string[] = [];
    if (!count().days) list.push(`These days are all weekends or public holidays: the ${noun()} has no working days.`);
    if (isNew && def().warnPast !== false && first() < today()) list.push('This starts in the past.');
    return list;
  });

  const write = (firstKey: string, lastKey: string, halves?: { first: boolean; last: boolean }) => {
    field.setValue(firstKey ? dayStart(firstKey, untrack(zone)) : '');
    field.setOtherField(endField, lastKey ? dayStart(lastKey, untrack(zone)) : '');
    const h = halves ?? { first: untrack(halfFirst), last: untrack(halfLast) };
    // A one-day range has one half at most: keep the one just set.
    if (firstKey && firstKey === lastKey && h.first && h.last) h.first = false;
    if (startHalfField && h.first !== untrack(halfFirst)) field.setOtherField(startHalfField, h.first);
    if (endHalfField && h.last !== untrack(halfLast)) field.setOtherField(endHalfField, h.last);
    if (daysField) {
      const days = workingDays({ first: firstKey, last: lastKey, holidays: untrack(holidays), workDays: untrack(workDays), halfFirst: h.first, halfLast: h.last }).days;
      field.setOtherField(daysField, firstKey && lastKey ? days : null);
    }
  };

  const setFirst = (key: string) => {
    if (!key) return;
    const before = untrack(first);
    const after = untrack(last);
    // Moving the first day keeps the length; a range without a last day becomes one day.
    const length = before && after && after >= before ? Math.round((keyTime(after) - keyTime(before)) / 86_400_000) : 0;
    write(key, keyAdd(key, length));
  };
  const setLast = (key: string) => {
    if (!key) return;
    write(untrack(first) || key, key);
  };
  const setHalf = (which: 'first' | 'last', on: boolean) => {
    const halves = { first: which === 'first' ? on : untrack(halfFirst), last: which === 'last' ? on : untrack(halfLast) };
    write(untrack(first), untrack(last), halves);
  };

  /** The next work day on or after a day. */
  const nextWorkDay = (key: string) => {
    let k = key;
    for (let i = 0; i < 14; i++, k = keyAdd(k, 1)) {
      if (workDays().includes(new Date(keyTime(k)).getUTCDay()) && !holidayName().has(k)) return k;
    }
    return key;
  };
  const applyPreset = (days: number) => {
    const start = untrack(first) || nextWorkDay(untrack(today));
    let k = start;
    let counted = 0;
    for (let i = 0; i < 400; i++, k = keyAdd(k, 1)) {
      if (workDays().includes(new Date(keyTime(k)).getUTCDay()) && !holidayName().has(k)) counted++;
      if (counted >= days) break;
    }
    write(start, k, { first: false, last: false });
  };

  const strip = createMemo(() => {
    const a = first();
    const b = last();
    if (!a || !b || b < a) return { days: [] as { key: string; kind: 'work' | 'off' | 'holiday'; half: '' | 'pm' | 'am' }[], more: 0 };
    const total = Math.round((keyTime(b) - keyTime(a)) / 86_400_000) + 1;
    const days = [];
    for (let i = 0; i < Math.min(total, STRIP_DAYS); i++) {
      const key = keyAdd(a, i);
      const kind = !workDays().includes(new Date(keyTime(key)).getUTCDay()) ? 'off' : holidayName().has(key) ? 'holiday' : 'work';
      const half = key === a && halfFirst() ? 'pm' : key === b && halfLast() ? 'am' : '';
      days.push({ key, kind: kind as 'work' | 'off' | 'holiday', half: half as '' | 'pm' | 'am' });
    }
    return { days, more: total - days.length };
  });

  const summary = () => {
    const c = count();
    const parts = [`${c.calendarDays} calendar ${c.calendarDays === 1 ? 'day' : 'days'}`];
    if (c.holidays.length) parts.push(c.holidays.map((h) => h.name ?? holidayName().get(h.date) ?? 'Public holiday').join(', '));
    return parts.join(' · ');
  };
  const rangeText = () => {
    if (!first() || !last()) return '';
    const half = (on: boolean, text: string) => (on ? ` (${text})` : '');
    return first() === last()
      ? `${keyLabel(first())}${half(halfFirst(), 'from midday')}${half(halfLast(), 'until midday')}`
      : `${keyLabel(first())}${half(halfFirst(), 'from midday')} – ${keyLabel(last())}${half(halfLast(), 'until midday')}`;
  };

  const Half = (h: { which: 'first' | 'last'; fieldName: string; label: string; checked: boolean }) => (
    <Show when={h.fieldName}>
      <label class="dr-half">
        <input type="checkbox" checked={h.checked} disabled={!first() || !last()} onChange={(event) => setHalf(h.which, event.currentTarget.checked)} />
        <span class="dr-half__switch" aria-hidden="true" />
        <span>{h.label}</span>
      </label>
    </Show>
  );

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <Show
        when={!field.disabled()}
        fallback={
          <div class="dr-readonly" aria-labelledby={labelId}>
            <Icon name="calendar" size={14} />
            <span>{rangeText() || 'Not set'}</span>
            <Show when={first() && last() && last() >= first()}>
              <span class="dr-duration">{dayCount(count().days)}</span>
            </Show>
          </div>
        }
      >
        <div class="dr dr--days" role="group" aria-labelledby={labelId}>
          <div class="dr-days">
            <div class="dr-day">
              <label class="dr-row__label" for={firstId}>
                {def().startLabel ?? 'First day'}
              </label>
              <input
                id={firstId}
                class="sj-input dr-date"
                type="date"
                value={first()}
                aria-invalid={problems().length ? 'true' : undefined}
                onChange={(event) => setFirst(event.currentTarget.value)}
              />
              <Half which="first" fieldName={startHalfField} label="Starts at midday" checked={halfFirst()} />
            </div>
            <span class="dr-arrow" aria-hidden="true">
              <Icon name="chevron-right" size={16} />
            </span>
            <div class="dr-day">
              <label class="dr-row__label" for={lastId}>
                {def().endLabel ?? 'Last day'}
              </label>
              <input
                id={lastId}
                class="sj-input dr-date"
                type="date"
                value={last()}
                min={first() || undefined}
                aria-invalid={problems().length ? 'true' : undefined}
                onChange={(event) => setLast(event.currentTarget.value)}
              />
              <Half which="last" fieldName={endHalfField} label="Ends at midday" checked={halfLast()} />
            </div>
          </div>

          <Show when={strip().days.length}>
            <ol class="dr-strip" aria-label={`${rangeText()}: ${dayCount(count().days)}`}>
              <For each={strip().days} keyed={(day) => day.key}>
                {(day) => (
                  <li
                    class={['dr-strip__day', `dr-strip__day--${day().kind}`, day().half && `dr-strip__day--${day().half}`]}
                    title={`${keyLabel(day().key, { weekday: 'long', day: 'numeric', month: 'long' })}${day().kind === 'holiday' ? `: ${holidayName().get(day().key)}` : day().kind === 'off' ? ': not a work day' : day().half === 'pm' ? ': from midday' : day().half === 'am' ? ': until midday' : ''}`}
                  >
                    <span class="dr-strip__dow">{keyLabel(day().key, { weekday: 'narrow' })}</span>
                    <span class="dr-strip__date">{Number(day().key.slice(8))}</span>
                  </li>
                )}
              </For>
              <Show when={strip().more}>
                <li class="dr-strip__more">+{strip().more}</li>
              </Show>
            </ol>
          </Show>

          <div class="dr-meta dr-meta--days">
            <div class="dr-presets" role="group" aria-label="Quick lengths">
              <For each={def().presets ?? [1, 2, 5, 10]}>
                {(days) => (
                  <button type="button" class="dr-preset" onClick={() => applyPreset(days)}>
                    {days === 5 ? '1 week' : days === 10 ? '2 weeks' : `${days} ${days === 1 ? 'day' : 'days'}`}
                  </button>
                )}
              </For>
            </div>
            <Show when={first() && last() && last() >= first()}>
              <span class="dr-duration" aria-live="polite">
                <Icon name="calendar" size={13} />
                <span class="dr-days-count">{dayCount(count().days)}</span>
                <span class="dr-max">{summary()}</span>
              </span>
            </Show>
          </div>
          <Show when={problems().length}>
            <div class="sj-note sj-note--warning dr-problems" role="status">
              <Icon name="alert" size={14} />
              <div>
                <For each={problems()}>{(problem) => <div>{problem}</div>}</For>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </FieldShell>
  );
}

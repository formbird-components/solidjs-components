import { createMemo, For, Show, untrack } from 'solid-js';
import {
  createDocumentField,
  createFieldBinding,
  FieldShell,
  formatDuration,
  getPath,
  Icon,
  toDate,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
} from '@solidjs-components/kit';
import { bookingTimeProblems } from '../../../packages/fleet-kit/src/logic/booking';
import { addDays, fromInputs, HOUR, MINUTE, rangeLabel, roundUp, startOfDay, toDateInput, toTimeInput } from '../../../packages/fleet-kit/src/time';

export interface DateRangeDefinition extends BaseDefinition {
  /** Field the end is written to; this element's own field holds the start. */
  endField: string;
  startLabel?: string;
  endLabel?: string;
  /** What the range is of, in the messages: "The booking must end after it starts" (default "booking"). */
  noun?: string;
  /** Minutes between the times offered (default 30). */
  stepMinutes?: number;
  /** Quick durations offered, in hours (default [1, 2, 4, 8]). */
  presets?: number[];
  /** Shortest range allowed, in minutes (default 15). */
  minMinutes?: number;
  /** Longest range allowed, in hours. */
  maxHours?: number;
  /** Where else the longest range comes from: another field's path, e.g. "assetRel.0.maxBookingHours". */
  maxHoursFrom?: string;
  /** Length of a new range when only the start is set, in hours (default 2). */
  defaultHours?: number;
  /** Warn when a new range starts in the past (default true). */
  warnPast?: boolean;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<DateRangeDefinition, unknown>>;

const asIso = (raw: unknown): string => {
  const date = toDate(raw);
  return date ? date.toISOString() : '';
};

/**
 * `<solid-date-range>`: when something starts and ends, as two fields. Moving the start keeps the
 * duration; quick durations set the end; the range is checked with the same rules the booking
 * rulesets apply on save.
 * @param props - Formbird element properties
 */
export function DateRange(props: Props) {
  const field = createFieldBinding<string, DateRangeDefinition>(props, { parse: asIso });
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
    const list = bookingTimeProblems({ start: field.value(), end: end(), maxHours: maxHours(), minMinutes: def().minMinutes, noun: def().noun });
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

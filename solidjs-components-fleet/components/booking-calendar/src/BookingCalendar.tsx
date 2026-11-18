import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  addDays,
  Button,
  createDocumentField,
  createFieldBinding,
  FieldShell,
  formatDuration,
  dayLabel,
  formatTime,
  getService,
  HOUR,
  Icon,
  IconButton,
  LookupIcon,
  MINUTE,
  openDocument,
  openNewDocument,
  Popover,
  rangeLabel,
  roundUp,
  Spinner,
  startOfDay,
  toDate,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FieldBinding,
  type FormbirdElementProps,
} from '@solidjs-components/kit';
import { assignLanes, axisTicks, clashes, shiftAnchor, windowFor, xOf, type CalendarView, type TimeWindow } from '../../../packages/fleet-kit/src/calendar';
import { loadAssets, loadItems, type CalendarAsset, type CalendarItem, type CalendarSources } from './data';

export interface BookingCalendarDefinition extends BaseDefinition, CalendarSources {
  /** "page": the calendar (default); "field": availability for the booking being edited. */
  mode?: 'page' | 'field';
  /** Template new bookings are made from (dragging across free time, the + on a row). */
  bookingTemplateId?: string;
  /** Fields a new booking (or, in field mode, this booking) keeps its asset and times in. */
  assetField?: string;
  /** A booking's start (default "startDate"). */
  startField?: string;
  /** A booking's end (default "endDate"). */
  endField?: string;
  /** "day" (default) or "week". */
  view?: CalendarView;
  /** Snap of drag-to-book, in minutes (default 30). */
  slotMinutes?: number;
  /** Hour the day view scrolls to (default 7). */
  dayStartHour?: number;
  /** Height of the calendar, CSS (default 70vh). */
  height?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<BookingCalendarDefinition, unknown>>;
type Field = FieldBinding<unknown, BookingCalendarDefinition>;

const LANE_H = 34;
const errorText = (error: unknown) => (error as Error)?.message || String(error) || 'Loading failed';

/** Reloads after any save in the app (a booking made or closed elsewhere). */
function onSaved(reload: () => void) {
  let listening = false; // the broadcast replays the last save to new subscribers
  const subscription = getService('BroadcastService')
    ?.on?.('document:updated')
    .subscribe(() => listening && reload());
  queueMicrotask(() => (listening = true));
  onCleanup(() => subscription?.unsubscribe());
}

/**
 * `<solid-booking-calendar>`: in "page" mode the fleet booking calendar, in "field" mode the
 * availability of the asset a booking form is about.
 * @param props - Formbird element properties
 */
export function BookingCalendar(props: Props) {
  const field = createFieldBinding<unknown, BookingCalendarDefinition>(props);
  return (
    <Show when={untrack(() => field.definition().mode) === 'field'} fallback={<Timeline field={field} />}>
      <Availability field={field} props={props} />
    </Show>
  );
}

// ------------------------------------------------------------------------------------------------
// Page mode: the calendar
// ------------------------------------------------------------------------------------------------

interface Selection {
  asset: CalendarAsset;
  start: number;
  end: number;
}

function Timeline(componentProps: { field: Field }) {
  const field = componentProps.field;
  const def = field.definition;
  const labelId = uid('label');
  const [view, setView] = createSignal<CalendarView>(untrack(() => def().view) === 'week' ? 'week' : 'day');
  const [anchor, setAnchor] = createSignal(Date.now());
  const [assets, setAssets] = createSignal<CalendarAsset[]>([]);
  const [items, setItems] = createSignal<CalendarItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string>();
  const [search, setSearch] = createSignal('');
  const [onlyAvailable, setOnlyAvailable] = createSignal(false);
  const [reloads, setReloads] = createSignal(0);
  const [drag, setDrag] = createSignal<Selection & { from: number }>();
  const [selection, setSelection] = createSignal<Selection>();
  const [selectionEl, setSelectionEl] = createSignal<HTMLElement>();
  const [now, setNow] = createSignal(Date.now());
  let scroller: HTMLDivElement | undefined;

  const timer = setInterval(() => setNow(Date.now()), 60_000);
  onCleanup(() => clearInterval(timer));
  onSaved(() => setReloads((n) => n + 1));

  const slot = () => Math.max(5, Number(def().slotMinutes) || 30) * MINUTE;
  const pxPerHour = () => (view() === 'day' ? 56 : 9);
  const window = createMemo<TimeWindow>(() => windowFor(view(), anchor()));
  const width = () => ((window().end - window().start) / HOUR) * pxPerHour();

  // Assets: on load, when the filter changes, after saves.
  createEffect(
    () => JSON.stringify([def().assetFilter ?? null, def().assetFields ?? null, reloads()]),
    () => {
      setLoading(true);
      loadAssets(untrack(def), untrack(() => field.templateContext()))
        .then((list) => {
          setAssets(list);
          setError(undefined);
        })
        .catch((err) => {
          setError(errorText(err));
          setLoading(false);
        });
    },
  );

  // Bars: whenever the assets or the window change.
  let itemsRequest = 0;
  createEffect(
    () => [assets(), window()] as const,
    ([list, win]) => {
      const id = ++itemsRequest;
      if (!list.length) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      loadItems(untrack(def), untrack(() => field.templateContext()), list.map((a) => a.documentId), win)
        .then((loaded) => {
          if (id !== itemsRequest) return;
          setItems(loaded);
          setError(undefined);
        })
        .catch((err) => id === itemsRequest && setError(errorText(err)))
        .finally(() => id === itemsRequest && setLoading(false));
    },
  );

  // Scroll the day view to the start of the working day (or just before now, later in the day).
  createEffect(
    () => [view(), startOfDay(anchor())] as const,
    ([currentView]) => {
      if (currentView !== 'day') return;
      requestAnimationFrame(() => {
        if (!scroller) return;
        const startHour = Number(untrack(def).dayStartHour ?? 7);
        const target = Math.max(window().start + startHour * HOUR, Math.min(now() - HOUR, window().start + 16 * HOUR));
        scroller.scrollLeft = xOf(target, window(), pxPerHour());
      });
    },
  );

  const shown = createMemo(() => {
    const text = search().trim().toLowerCase();
    return assets().filter(
      (a) =>
        (!onlyAvailable() || !a.unavailable) &&
        (!text || `${a.id} ${a.label} ${a.typeName} ${a.location}`.toLowerCase().includes(text)),
    );
  });
  const groups = createMemo(() => {
    const map = new Map<string, CalendarAsset[]>();
    for (const asset of shown()) map.set(asset.location, [...(map.get(asset.location) ?? []), asset]);
    return [...map.entries()].map(([location, list]) => ({ location, list }));
  });
  const itemsByAsset = createMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items()) map.set(item.assetId, [...(map.get(item.assetId) ?? []), item]);
    return map;
  });

  const legend = createMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items()) if (item.kind === 'booking' && item.status && !seen.has(item.status)) seen.set(item.status, item.color);
    return [...seen.entries()];
  });

  const ticks = createMemo(() => axisTicks(window(), view() === 'day' ? 1 : 24));

  // Drag across free time to book.
  const timeAt = (event: PointerEvent, track: HTMLElement) => {
    const rect = track.getBoundingClientRect();
    return window().start + ((event.clientX - rect.left) / pxPerHour()) * HOUR;
  };
  const startDrag = (event: PointerEvent, asset: CalendarAsset) => {
    if (event.button !== 0 || !def().bookingTemplateId) return;
    if ((event.target as HTMLElement).closest('.bc-bar')) return;
    const track = event.currentTarget as HTMLElement;
    const from = Math.floor(timeAt(event, track) / slot()) * slot();
    track.setPointerCapture(event.pointerId);
    setSelection(undefined);
    setDrag({ asset, from, start: from, end: from + slot() });
  };
  const moveDrag = (event: PointerEvent) => {
    const current = drag();
    if (!current) return;
    const t = timeAt(event, event.currentTarget as HTMLElement);
    const snapped = Math.floor(t / slot()) * slot();
    setDrag({ ...current, start: Math.min(current.from, snapped), end: Math.max(current.from, snapped) + slot() });
  };
  const endDrag = () => {
    const current = drag();
    if (!current) return;
    setDrag(undefined);
    setSelection({ asset: current.asset, start: current.start, end: current.end });
  };
  const quickBook = (asset: CalendarAsset) => {
    const start = Math.max(roundUp(now(), 30), window().start + 9 * HOUR);
    setSelection({ asset, start, end: start + 2 * HOUR });
  };
  const book = () => {
    const chosen = selection();
    const templateId = def().bookingTemplateId;
    if (!chosen || !templateId) return;
    openNewDocument(templateId, {
      [def().assetField ?? 'assetRel']: [chosen.asset.value],
      [def().startField ?? 'startDate']: new Date(chosen.start).toISOString(),
      [def().endField ?? 'endDate']: new Date(chosen.end).toISOString(),
    });
    setSelection(undefined);
  };
  // Focus moves into the popover when it opens, so Escape closes it and the keyboard reaches "Book".
  let popoverButtons: HTMLDivElement | undefined;
  createEffect(
    () => selection(),
    (chosen) => {
      if (!chosen) return;
      requestAnimationFrame(() => {
        const buttons = popoverButtons ? [...popoverButtons.querySelectorAll('button')] : [];
        (buttons.find((b) => !b.disabled && b.classList.contains('sj-btn--primary')) ?? buttons[0])?.focus();
      });
    },
  );
  const selectionClashes = () => {
    const chosen = selection();
    return chosen ? clashes(itemsByAsset().get(chosen.asset.documentId) ?? [], chosen.start, chosen.end) : [];
  };

  const headerLabel = () =>
    view() === 'day'
      ? `${dayLabel(window().start, now())}${dayLabel(window().start, now()).length < 10 ? `, ${new Date(window().start).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` : ''}`
      : `${new Date(window().start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(window().end - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <section class="bc" aria-labelledby={labelId}>
      <div class="bc-toolbar">
        {/* The heading names the section, so hideLabel only hides it from view. */}
        <h2 class={def().hideLabel ? 'sj-visually-hidden' : 'bc-title'} id={labelId}>
          {field.label() || 'Booking calendar'}
        </h2>
        <div class="bc-nav">
          <Button size="sm" onClick={() => setAnchor(Date.now())}>
            Today
          </Button>
          <IconButton icon="chevron-left" size="sm" label={view() === 'day' ? 'Previous day' : 'Previous week'} onClick={() => setAnchor((a) => shiftAnchor(view(), a, -1))} />
          <IconButton icon="chevron-right" size="sm" label={view() === 'day' ? 'Next day' : 'Next week'} onClick={() => setAnchor((a) => shiftAnchor(view(), a, 1))} />
          <span class="bc-range" aria-live="polite">
            {headerLabel()}
          </span>
          <Show when={loading()}>
            <Spinner label="Loading bookings" />
          </Show>
        </div>
        <div class="bc-filters">
          <label class="bc-search">
            <Icon name="search" size={14} />
            <input type="search" placeholder="Find an asset" aria-label="Find an asset" value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
          </label>
          <label class="bc-check">
            <input type="checkbox" checked={onlyAvailable()} onChange={(e) => setOnlyAvailable(e.currentTarget.checked)} />
            Available for hire
          </label>
          <div class="sj-segmented" role="group" aria-label="View">
            <button type="button" aria-pressed={view() === 'day' ? 'true' : 'false'} onClick={() => setView('day')}>
              Day
            </button>
            <button type="button" aria-pressed={view() === 'week' ? 'true' : 'false'} onClick={() => setView('week')}>
              Week
            </button>
          </div>
          <IconButton icon="refresh" size="sm" label="Reload" onClick={() => setReloads((n) => n + 1)} />
        </div>
      </div>

      <Show when={error()}>
        <div class="sj-note sj-note--danger" role="alert">
          <Icon name="alert" size={14} />
          <span>{error()}</span>
        </div>
      </Show>

      <div class="bc-scroll" ref={scroller} style={{ 'max-height': def().height ?? '70vh' }}>
        <div class={['bc-grid', `bc-grid--${view()}`]} style={{ width: `calc(var(--bc-label-w) + ${width()}px)`, '--bc-hour': `${pxPerHour()}px` }}>
          <div class="bc-head">
            <div class="bc-corner">{shown().length} assets</div>
            <div class="bc-axis" style={{ width: `${width()}px` }}>
              <For each={ticks()}>
                {(tick) => (
                  <span class="bc-tick" style={{ left: `${xOf(tick, window(), pxPerHour())}px` }}>
                    {view() === 'day' ? formatTime(tick).replace(':00', '') : dayLabel(tick, now())}
                  </span>
                )}
              </For>
            </div>
          </div>

          <Show
            when={shown().length}
            fallback={
              <div class="bc-empty sj-empty">
                <Icon name="calendar" />
                {loading() ? 'Loading assets…' : search() || onlyAvailable() ? 'No assets match.' : 'No bookable assets.'}
              </div>
            }
          >
            <For each={groups()}>
              {(group) => (
                <div class="bc-group" role="rowgroup">
                  <div class="bc-group__title">
                    <span>
                      <Icon name="map-pin" size={12} /> {group.location}
                    </span>
                    <span class="bc-group__count">{group.list.length}</span>
                  </div>
                  <For each={group.list}>
                    {(asset) => {
                      const rowItems = () => itemsByAsset().get(asset.documentId) ?? [];
                      const lanes = createMemo(() => assignLanes(rowItems().map((i) => ({ ...i, end: i.drawEnd }))));
                      const isDragging = () => drag()?.asset.documentId === asset.documentId;
                      const isSelected = () => selection()?.asset.documentId === asset.documentId;
                      return (
                        <div class={['bc-row', asset.unavailable && 'bc-row--unavailable']} role="row">
                          <div class="bc-label" role="rowheader">
                            <LookupIcon set="asset" name={asset.typeName} override={asset.iconKind ? { icon: asset.iconKind } : undefined} title={asset.typeName} />
                            <button type="button" class="bc-label__text" title={asset.label} onClick={() => openDocument(asset.documentId)}>
                              <span class="bc-label__id">{asset.id}</span>
                              <span class="bc-label__type">{asset.typeName}</span>
                            </button>
                            <Show when={asset.hireStatus}>
                              {(hire) => <span class="bc-dot" style={{ background: hire().color }} title={hire().name} aria-label={hire().name} />}
                            </Show>
                            <Show when={def().bookingTemplateId && !asset.unavailable}>
                              <IconButton icon="plus" size="sm" class="bc-quick" label={`Book ${asset.id}`} onClick={() => quickBook(asset)} />
                            </Show>
                          </div>
                          <div
                            class="bc-track"
                            style={{ width: `${width()}px`, height: `${lanes().count * LANE_H + 8}px` }}
                            onPointerDown={(e) => startDrag(e, asset)}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={() => setDrag(undefined)}
                          >
                            <Show when={now() > window().start}>
                              <div class="bc-past" style={{ width: `${xOf(now(), window(), pxPerHour())}px` }} />
                            </Show>
                            <For each={rowItems()}>
                              {(item) => {
                                const left = () => xOf(item.start, window(), pxPerHour());
                                const right = () => xOf(item.drawEnd, window(), pxPerHour());
                                const overdueAt = () => xOf(item.end, window(), pxPerHour());
                                const label = () =>
                                  `${item.ref}${item.person ? `, ${item.person}` : ''}, ${rangeLabel(item.start, item.end)}, ${item.overdue ? 'Hire Overdue' : item.status}`;
                                return (
                                  <button
                                    type="button"
                                    class={['bc-bar', `bc-bar--${item.kind}`, item.overdue && 'bc-bar--overdue', /closed|cancel/i.test(item.status) && 'bc-bar--done']}
                                    style={{
                                      left: `${left()}px`,
                                      width: `${Math.max(6, right() - left())}px`,
                                      top: `${4 + (lanes().lanes.get(item.id) ?? 0) * LANE_H}px`,
                                      '--bc-color': item.color,
                                      '--bc-overdue-at': `${Math.max(0, overdueAt() - left())}px`,
                                    }}
                                    aria-label={label()}
                                    title={label()}
                                    onClick={() => openDocument(item.id)}
                                  >
                                    <span class="bc-bar__text">
                                      <span class="bc-bar__ref">{item.ref}</span>
                                      <span class="bc-bar__who">{item.overdue ? 'Overdue' : item.kind === 'block' ? item.status || 'Workshop' : item.person}</span>
                                    </span>
                                  </button>
                                );
                              }}
                            </For>
                            <Show when={isDragging() || isSelected()}>
                              <div
                                ref={(el) => {
                                  // One overlay at a time: it stays mounted from the drag to the selection.
                                  setSelectionEl(el);
                                }}
                                class="bc-selection"
                                style={{
                                  left: `${xOf((isDragging() ? drag() : selection())!.start, window(), pxPerHour())}px`,
                                  width: `${xOf((isDragging() ? drag() : selection())!.end, window(), pxPerHour()) - xOf((isDragging() ? drag() : selection())!.start, window(), pxPerHour())}px`,
                                }}
                              />
                            </Show>
                            <Show when={now() >= window().start && now() < window().end}>
                              <div class="bc-now" style={{ left: `${xOf(now(), window(), pxPerHour())}px` }} />
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>

      <div class="bc-legend" aria-label="Legend">
        <For each={legend()}>
          {([status, color]) => (
            <span class="bc-key">
              <span class="bc-swatch" style={{ '--bc-color': color }} /> {status}
            </span>
          )}
        </For>
        <span class="bc-key">
          <span class="bc-swatch bc-swatch--overdue" /> Hire Overdue
        </span>
        <span class="bc-key">
          <span class="bc-swatch bc-swatch--block" /> In the workshop
        </span>
        <Show when={def().bookingTemplateId}>
          <span class="bc-hint">Drag across free time to book.</span>
        </Show>
      </div>

      <Popover open={!!selection()} anchor={selectionEl} onDismiss={() => setSelection(undefined)} minWidth={280} label="New booking">
        <Show when={selection()}>
          {(chosen) => (
            <div class="bc-pop">
              <div class="bc-pop__title">
                <LookupIcon set="asset" name={chosen().asset.typeName} override={chosen().asset.iconKind ? { icon: chosen().asset.iconKind } : undefined} />
                <strong>{chosen().asset.id}</strong>
                <span class="bc-pop__type">{chosen().asset.typeName}</span>
              </div>
              <div class="bc-pop__when">
                {rangeLabel(chosen().start, chosen().end)} · {formatDuration(chosen().end - chosen().start)}
              </div>
              <Show when={selectionClashes().length}>
                <div class="sj-note sj-note--danger">
                  <Icon name="alert" size={14} />
                  <span>Clashes with {selectionClashes().map((c) => `${c.ref}${c.person ? ` (${c.person})` : ''}`).join(', ')}.</span>
                </div>
              </Show>
              <Show when={chosen().asset.unavailable}>
                <div class="sj-note sj-note--warning">
                  <Icon name="alert" size={14} />
                  <span>{chosen().asset.hireStatus?.name ?? 'Unavailable For Hire'}</span>
                </div>
              </Show>
              <div class="bc-pop__actions" ref={popoverButtons}>
                <Button variant="subtle" size="sm" onClick={() => setSelection(undefined)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" icon="plus" disabled={selectionClashes().length > 0} onClick={book}>
                  Book {chosen().asset.id}
                </Button>
              </div>
            </div>
          )}
        </Show>
      </Popover>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// Field mode: availability for the booking being edited
// ------------------------------------------------------------------------------------------------

const asIso = (raw: unknown) => toDate(raw)?.toISOString() ?? '';

function Availability(componentProps: { field: Field; props: Props }) {
  const field = componentProps.field;
  const props = componentProps.props;
  const def = field.definition;
  const labelId = uid('label');
  const assetField = untrack(() => def().assetField ?? 'assetRel');
  const asset = createDocumentField(props, assetField, toRelatedList);
  const start = createDocumentField(props, untrack(() => def().startField ?? 'startDate'), asIso);
  const end = createDocumentField(props, untrack(() => def().endField ?? 'endDate'), asIso);
  const selfId = untrack(() => props.document?.documentId as string | undefined);
  const [assets, setAssets] = createSignal<CalendarAsset[]>([]);
  const [items, setItems] = createSignal<CalendarItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);
  onSaved(() => setReloads((n) => n + 1));

  const period = createMemo(() => {
    const s = toDate(start())?.getTime();
    const e = toDate(end())?.getTime();
    return s !== undefined && e !== undefined && e > s ? { start: s, end: e } : undefined;
  });
  // The strip shows the whole days the period touches (up to a week).
  const strip = createMemo<TimeWindow | undefined>(() => {
    const p = period();
    if (!p) return undefined;
    const first = startOfDay(p.start);
    return { start: first, end: Math.min(addDays(startOfDay(p.end - 1), 1), addDays(first, 7)) };
  });

  createEffect(
    () => JSON.stringify([def().assetFilter ?? null, reloads()]),
    () => {
      loadAssets(untrack(def), untrack(() => field.templateContext()))
        .then(setAssets)
        .catch((err) => setError(errorText(err)));
    },
  );

  let request = 0;
  createEffect(
    () => [assets(), strip(), reloads()] as const,
    ([list, win]) => {
      const id = ++request;
      if (!win || !list.length) {
        setItems([]);
        return;
      }
      const ids = new Set(list.map((a) => a.documentId));
      const chosen = untrack(asset)[0]?.documentId;
      if (chosen) ids.add(chosen);
      setLoading(true);
      loadItems(untrack(def), untrack(() => field.templateContext()), [...ids], win)
        .then((loaded) => {
          if (id !== request) return;
          setItems(loaded.filter((item) => item.id !== selfId));
          setError(undefined);
        })
        .catch((err) => id === request && setError(errorText(err)))
        .finally(() => id === request && setLoading(false));
    },
  );

  const clashesFor = (assetId: string) => {
    const p = period();
    return p ? clashes(items().filter((i) => i.assetId === assetId), p.start, p.end, selfId) : [];
  };
  const chosen = () => asset()[0];
  const chosenAsset = () => assets().find((a) => a.documentId === chosen()?.documentId);
  const chosenClashes = () => (chosen() ? clashesFor(chosen()!.documentId) : []);
  const free = createMemo(() => {
    const p = period();
    if (!p) return [];
    const current = chosenAsset();
    return assets()
      .filter((a) => a.documentId !== current?.documentId && !a.unavailable && !clashesFor(a.documentId).length)
      .sort((a, b) => Number(b.typeId === current?.typeId) - Number(a.typeId === current?.typeId));
  });
  const choose = (option: CalendarAsset) => field.setOtherField(assetField, [option.value]);
  const pct = (time: number) => {
    const w = strip()!;
    return `${((Math.min(Math.max(time, w.start), w.end) - w.start) / (w.end - w.start)) * 100}%`;
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <div class="av" aria-labelledby={labelId}>
        <Show when={period()} fallback={<p class="av-empty">Choose when you need it to see what is free.</p>}>
          {(p) => (
            <>
              <Show when={chosen()}>
                {(current) => (
                  <div class="av-current">
                    <div class="av-status">
                      <Show
                        when={!chosenClashes().length && !chosenAsset()?.unavailable}
                        fallback={
                          <span class="av-bad">
                            <Icon name="alert" size={15} /> {chosenAsset()?.unavailable ? `${current().name} is ${chosenAsset()?.hireStatus?.name ?? 'unavailable'}` : `${current().name} isn't free then`}
                          </span>
                        }
                      >
                        <span class="av-good">
                          <Icon name="check" size={15} /> {current().name} is free for the whole period
                        </span>
                      </Show>
                      <Show when={loading()}>
                        <Spinner label="Checking availability" />
                      </Show>
                    </div>
                    <Show when={strip()}>
                      {(w) => (
                        <div class="av-strip" aria-hidden="true">
                          <For each={axisTicks(w(), (w().end - w().start) / HOUR > 24 ? 24 : 3)}>
                            {(tick) => (
                              <span class="av-tick" style={{ left: pct(tick) }}>
                                {(w().end - w().start) / HOUR > 24 ? dayLabel(tick) : formatTime(tick).replace(':00', '')}
                              </span>
                            )}
                          </For>
                          <For each={items().filter((i) => i.assetId === current().documentId)}>
                            {(item) => (
                              <span
                                class={['av-item', `av-item--${item.kind}`]}
                                style={{ left: pct(item.start), width: `calc(${pct(item.drawEnd)} - ${pct(item.start)})`, '--bc-color': item.color }}
                                title={`${item.ref} ${rangeLabel(item.start, item.end)}`}
                              />
                            )}
                          </For>
                          <span
                            class={['av-period', chosenClashes().length && 'av-period--clash']}
                            style={{ left: pct(p().start), width: `calc(${pct(p().end)} - ${pct(p().start)})` }}
                          />
                        </div>
                      )}
                    </Show>
                    <Show when={chosenClashes().length}>
                      <ul class="av-clashes">
                        <For each={chosenClashes()}>
                          {(clash) => (
                            <li>
                              <button type="button" class="av-link" onClick={() => openDocument(clash.id)}>
                                {clash.ref}
                              </button>{' '}
                              {clash.kind === 'block' ? `in the workshop (${clash.status})` : clash.person}: {rangeLabel(clash.start, clash.drawEnd)}
                              {clash.overdue ? ' (not returned yet)' : ''}
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </div>
                )}
              </Show>

              <Show when={!chosen() || chosenClashes().length || chosenAsset()?.unavailable}>
                <div class="av-free">
                  <div class="av-free__title">
                    {chosen() ? 'Free instead' : 'Free for this period'}
                    <span class="av-free__count">{free().length}</span>
                  </div>
                  <Show when={free().length} fallback={<p class="av-empty">{loading() ? 'Checking…' : 'Nothing else is free then.'}</p>}>
                    <div class="av-options">
                      <For each={free().slice(0, 12)}>
                        {(option) => (
                          <button type="button" class="av-option" disabled={field.disabled()} onClick={() => choose(option)} title={option.label}>
                            <LookupIcon set="asset" name={option.typeName} override={option.iconKind ? { icon: option.iconKind } : undefined} />
                            <span class="av-option__id">{option.id}</span>
                            <span class="av-option__meta">
                              {option.typeName} · {option.location}
                            </span>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
              <Show when={error()}>
                <div class="sj-note sj-note--danger">
                  <Icon name="alert" size={14} />
                  <span>{error()}</span>
                </div>
              </Show>
            </>
          )}
        </Show>
      </div>
    </FieldShell>
  );
}

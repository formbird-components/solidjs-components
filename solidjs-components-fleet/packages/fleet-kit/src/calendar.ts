// Timeline maths for the booking calendar: the visible window, positions, lanes for overlapping
// bars, and which assets are free for a period.

import { overlaps, UNRETURNED_BLOCK_MS } from './logic/booking';
import { addDays, HOUR, startOfDay } from './time';

export type CalendarView = 'day' | 'week';

/** The time range a view shows around a day. */
export interface TimeWindow {
  start: number;
  end: number;
}

/**
 * The window a view shows: the local day, or the week from Monday.
 * @param view - "day" or "week"
 * @param anchor - Any time inside the wanted day/week
 * @returns Window in epoch ms
 */
export function windowFor(view: CalendarView, anchor: number): TimeWindow {
  const day = startOfDay(anchor);
  if (view === 'day') return { start: day, end: addDays(day, 1) };
  const weekday = (new Date(day).getDay() + 6) % 7; // Monday = 0
  const monday = addDays(day, -weekday);
  return { start: monday, end: addDays(monday, 7) };
}

/**
 * Moves a window by one view length.
 * @param view - "day" or "week"
 * @param anchor - Current anchor
 * @param direction - -1 back, 1 forward
 * @returns New anchor
 */
export function shiftAnchor(view: CalendarView, anchor: number, direction: -1 | 1): number {
  return addDays(anchor, direction * (view === 'day' ? 1 : 7));
}

/**
 * Horizontal position of a time in the window, in px.
 * @param time - Epoch ms
 * @param window - Visible window
 * @param pxPerHour - Scale
 * @returns Pixels from the window start, clamped to the window
 */
export function xOf(time: number, window: TimeWindow, pxPerHour: number): number {
  const clamped = Math.min(Math.max(time, window.start), window.end);
  return ((clamped - window.start) / HOUR) * pxPerHour;
}

/** The latest time a Date can hold: "until further notice". */
export const FOREVER = 8.64e15;

/**
 * Until when a booking keeps its asset: a hire out past its end blocks the next 24 hours, a closed
 * one only until it was returned (an early return frees the rest of the slot).
 */
export function blockedUntil(o: { end: number; overdue: boolean; closed?: number; now: number }): number {
  if (o.overdue) return Math.max(o.end, o.now + UNRETURNED_BLOCK_MS);
  return o.closed !== undefined && o.closed < o.end ? o.closed : o.end;
}

/** Something on a row: a booking or a block-out. */
export interface TimedItem {
  id: string;
  start: number;
  end: number;
  /** Blocks the asset until then instead of `end` (see blockedUntil). */
  until?: number;
}

/**
 * Puts overlapping items on separate lanes (bookings shouldn't overlap, but a block-out and a
 * booking can, and old data might).
 * @param items - Items of one row
 * @returns Lane per item id, and the number of lanes
 */
export function assignLanes<T extends TimedItem>(items: T[]): { lanes: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    lanes.set(item.id, lane);
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}

/**
 * The items of a row that clash with a period.
 * @param items - Bookings and block-outs of one asset
 * @param start - Period start
 * @param end - Period end
 * @param ignoreId - An item to leave out (the booking being edited)
 * @returns Clashing items
 */
export function clashes<T extends TimedItem>(items: T[], start: number, end: number, ignoreId?: string): T[] {
  return items.filter((item) => item.id !== ignoreId && overlaps(item.start, item.until ?? item.end, start, end));
}

/**
 * Hour labels for the time axis.
 * @param window - Visible window
 * @param everyHours - Label spacing
 * @returns Times to label
 */
export function axisTicks(window: TimeWindow, everyHours: number): number[] {
  const ticks: number[] = [];
  for (let t = window.start; t < window.end; t += everyHours * HOUR) ticks.push(t);
  return ticks;
}

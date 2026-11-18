// Local-time helpers for date ranges, calendars and schedules: days, slots and labels in the
// viewer's time zone (what they see on screen), as opposed to the company time zone rulesets use.

import { toDate } from './format';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Midnight of the local day containing `time`.
 * @param time - Epoch ms
 * @returns Epoch ms
 */
export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Adds calendar days in local time (keeps the wall-clock time across DST changes).
 * @param time - Epoch ms
 * @param days - Days to add (may be negative)
 * @returns Epoch ms
 */
export function addDays(time: number, days: number): number {
  const date = new Date(time);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/**
 * Rounds up to the next slot boundary ("next half hour").
 * @param time - Epoch ms
 * @param minutes - Slot length
 * @returns Epoch ms
 */
export function roundUp(time: number, minutes: number): number {
  const step = minutes * MINUTE;
  return Math.ceil(time / step) * step;
}

/**
 * Rounds to the nearest slot boundary.
 * @param time - Epoch ms
 * @param minutes - Slot length
 * @returns Epoch ms
 */
export function roundTo(time: number, minutes: number): number {
  const step = minutes * MINUTE;
  return Math.round(time / step) * step;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The value a `<input type="date">` shows for a stored date ("2026-11-04"), local time.
 * @param value - Stored date
 * @returns Input value, or ""
 */
export function toDateInput(value: unknown): string {
  const date = toDate(value);
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
}

/**
 * The value a `<input type="time">` shows ("09:30"), local time.
 * @param value - Stored date
 * @returns Input value, or ""
 */
export function toTimeInput(value: unknown): string {
  const date = toDate(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}

/**
 * Joins a date input and a time input into an ISO instant (local time).
 * @param dateText - "2026-11-04"
 * @param timeText - "09:30" (default "00:00")
 * @returns ISO string, or undefined when the date isn't valid
 */
export function fromInputs(dateText: string, timeText = '00:00'): string | undefined {
  const [y, m, d] = dateText.split('-').map(Number);
  const [hh, mm] = (timeText || '00:00').split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return undefined;
  const date = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * A day as a heading: "Today", "Tomorrow", "Yesterday", else "Wed 5 Nov".
 * @param time - Epoch ms
 * @param now - Reference time (tests)
 * @returns Label
 */
export function dayLabel(time: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(time) - startOfDay(now)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return new Date(time).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * A time range, compact: "9:00 – 11:30 am" on one day, "Wed 5 Nov 9:00 am – Thu 6 Nov 5:00 pm" across days.
 * @param start - Stored start
 * @param end - Stored end
 * @returns Label, or ""
 */
export function rangeLabel(start: unknown, end: unknown): string {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return '';
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return startOfDay(a.getTime()) === startOfDay(b.getTime()) ? `${day(a)}, ${time(a)} – ${time(b)}` : `${day(a)} ${time(a)} – ${day(b)} ${time(b)}`;
}

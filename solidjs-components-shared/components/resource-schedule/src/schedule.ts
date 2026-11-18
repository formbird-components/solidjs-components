// The schedule's maths, apart from the element so it can be tested: the visible days, where each
// record's bar goes and in which lane, and how many of a group are left on each day against its
// minimum. Days are "YYYY-MM-DD" keys in the schedule's time zone, so a bar covers whole days
// whatever the viewer's zone.

/** One visible day. */
export interface ScheduleDay {
  key: string;
  /** 0 (Sunday) to 6 (Saturday). */
  dow: number;
  /** Not a work day (weekend). */
  off: boolean;
  /** Public holiday name, or ''. */
  holiday: string;
  today: boolean;
  /** First of a month, or the first day shown: the header names the month here. */
  monthStart: boolean;
}

/** A record as the schedule places it. */
export interface ScheduleItem {
  documentId: string;
  rowId: string;
  /** First and last day it covers (both included). */
  first: string;
  last: string;
  label: string;
  color: string;
  /** Not confirmed yet (pending approval): drawn hatched. */
  tentative: boolean;
  /** Starts at midday / ends at midday. */
  halfFirst: boolean;
  halfLast: boolean;
  /** Tooltip and screen reader text. */
  title: string;
}

/** An item laid out in the window: column span (0-based, inclusive) and lane. */
export interface PlacedItem extends ScheduleItem {
  from: number;
  to: number;
  lane: number;
  /** Starts before / ends after the visible days. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

const keyTime = (key: string) => Date.parse(`${key}T00:00:00Z`);

/**
 * A day key moved by whole days.
 * @param key - "YYYY-MM-DD"
 * @param days - Days to add (negative: back)
 * @returns The new key
 */
export const addDayKey = (key: string, days: number): string => new Date(keyTime(key) + days * 86_400_000).toISOString().slice(0, 10);

/** Days from `a` to `b` (negative when b is earlier). */
export const daysBetween = (a: string, b: string): number => Math.round((keyTime(b) - keyTime(a)) / 86_400_000);

/** Day of the week of a key, 0 (Sunday) to 6. */
export const weekday = (key: string): number => new Date(keyTime(key)).getUTCDay();

/**
 * The Monday of the week a day is in.
 * @param key - "YYYY-MM-DD"
 * @returns The Monday's key
 */
export function weekStart(key: string): string {
  return addDayKey(key, -((weekday(key) + 6) % 7));
}

/**
 * The visible days.
 * @param first - First day shown
 * @param count - How many days
 * @param o - Today, work days of the week and public holidays (key → name)
 * @returns One entry per day
 */
export function windowDays(first: string, count: number, o: { today: string; workDays: number[]; holidays: Map<string, string> }): ScheduleDay[] {
  const days: ScheduleDay[] = [];
  for (let i = 0; i < count; i++) {
    const key = addDayKey(first, i);
    const dow = weekday(key);
    days.push({ key, dow, off: !o.workDays.includes(dow), holiday: o.holidays.get(key) ?? '', today: key === o.today, monthStart: i === 0 || key.endsWith('-01') });
  }
  return days;
}

/**
 * Places items in the window: clipped to the visible days, and in lanes so that overlapping items of
 * one row don't cover each other (first come, lowest free lane).
 * @param items - Items of one or more rows
 * @param first - First visible day
 * @param count - Visible days
 * @returns Items in view, with their columns and lanes; and the lanes each row needs
 */
export function placeItems(items: ScheduleItem[], first: string, count: number): { placed: PlacedItem[]; lanes: Map<string, number> } {
  const last = addDayKey(first, count - 1);
  const inView = items
    .filter((item) => item.first && item.last && item.last >= item.first && item.first <= last && item.last >= first)
    .sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.last < b.last ? 1 : a.last > b.last ? -1 : a.documentId.localeCompare(b.documentId)));
  const lanesByRow = new Map<string, string[]>();
  const placed: PlacedItem[] = [];
  for (const item of inView) {
    const ends = lanesByRow.get(item.rowId) ?? [];
    let lane = ends.findIndex((end) => end < item.first);
    if (lane === -1) lane = ends.length;
    ends[lane] = item.last;
    lanesByRow.set(item.rowId, ends);
    placed.push({
      ...item,
      from: Math.max(0, daysBetween(first, item.first)),
      to: Math.min(count - 1, daysBetween(first, item.last)),
      lane,
      clippedStart: item.first < first,
      clippedEnd: item.last > last,
    });
  }
  return { placed, lanes: new Map([...lanesByRow].map(([row, ends]) => [row, ends.length])) };
}

/** How a group stands on one day. */
export interface GroupDay {
  key: string;
  /** People away (a half day counts half). */
  away: number;
  /** People left. */
  available: number;
  /** Below the group's minimum on a work day. */
  below: boolean;
  /** Who is away, for the tooltip. */
  names: string[];
}

/**
 * How many of a group are left on each day: its rows less those with an item covering the day,
 * compared with the group's minimum on work days. Only confirmed items count unless
 * `countTentative` (a pending request is a clash in waiting).
 * @param o - The group's rows (id and name), the items, the days, the minimum
 * @returns One entry per day
 */
export function groupStaffing(o: {
  rows: { id: string; name: string }[];
  items: ScheduleItem[];
  days: ScheduleDay[];
  min: number;
  countTentative?: boolean;
}): GroupDay[] {
  const ids = new Set(o.rows.map((r) => r.id));
  const nameOf = new Map(o.rows.map((r) => [r.id, r.name]));
  const relevant = o.items.filter((item) => ids.has(item.rowId) && (o.countTentative || !item.tentative));
  return o.days.map((day) => {
    const awayBy = new Map<string, number>();
    for (const item of relevant) {
      if (day.key < item.first || day.key > item.last) continue;
      const half = (day.key === item.first && item.halfFirst) || (day.key === item.last && item.halfLast);
      awayBy.set(item.rowId, Math.max(awayBy.get(item.rowId) ?? 0, half ? 0.5 : 1));
    }
    const away = [...awayBy.values()].reduce((sum, n) => sum + n, 0);
    const available = o.rows.length - away;
    return {
      key: day.key,
      away,
      available,
      below: !day.off && !day.holiday && o.min > 0 && available < o.min,
      names: [...awayBy.keys()].map((id) => nameOf.get(id) ?? '').filter(Boolean),
    };
  });
}

/**
 * The days a drag across a row selects, in order.
 * @param a - Day the drag started on
 * @param b - Day it is over now
 * @returns First and last day
 */
export function dragRange(a: string, b: string): { first: string; last: string } {
  return a <= b ? { first: a, last: b } : { first: b, last: a };
}

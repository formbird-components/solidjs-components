// Time ranges and working days: what <solid-date-range> checks and counts, and what the apps'
// rulesets check on save (fleet's booking times, HR's leave days). Rulesets embed these functions as
// source text (functionsLib), so each one must stay self-contained: no imports, no module-level
// helpers, only erasable TypeScript.

/** A stored date: ISO string, epoch milliseconds or Date. */
export type When = string | number | Date;

/** A time range, checked before it is saved. */
export interface TimeRangeInput {
  start: When | null | undefined;
  end: When | null | undefined;
  /** Longest range allowed, in hours; falls back to `defaultMaxHours`. */
  maxHours?: number | null;
  defaultMaxHours?: number;
  /** Shortest range allowed, in minutes (default 15). */
  minMinutes?: number;
  /** What the range is of, in the messages (default "booking"). */
  noun?: string;
  /** The message when the range is too long; `{max}` receives the hours. Default "The <noun> can be at most {max} hours long." */
  maxText?: string;
}

/**
 * Problems with a time range, as messages for the person entering it (empty when fine): both ends
 * set, valid dates, the end after the start, at least `minMinutes`, at most the maximum.
 * @param input - Start, end and limits
 * @returns Messages
 */
export function timeRangeProblems(input: TimeRangeInput): string[] {
  const problems: string[] = [];
  const noun = input.noun || 'booking';
  if (!input.start || !input.end) {
    problems.push(`Choose when the ${noun} starts and ends.`);
    return problems;
  }
  const start = new Date(input.start).getTime();
  const end = new Date(input.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    problems.push(`The ${noun} times are not valid dates.`);
    return problems;
  }
  if (end <= start) {
    problems.push(`The ${noun} must end after it starts.`);
    return problems;
  }
  const minutes = (end - start) / 60_000;
  const minMinutes = input.minMinutes ?? 15;
  if (minutes < minMinutes) problems.push(`The ${noun} must be at least ${minMinutes} minutes long.`);
  const maxHours = Number(input.maxHours) || input.defaultMaxHours || 0;
  if (maxHours && minutes > maxHours * 60) {
    problems.push((input.maxText || `The ${noun} can be at most {max} hours long.`).replace('{max}', String(maxHours)));
  }
  return problems;
}

/**
 * The calendar day an instant falls on in a time zone, as "YYYY-MM-DD". A value that already is a
 * day ("2026-12-25") is returned as it is.
 * @param when - ISO string, epoch ms, Date, or a day
 * @param timeZone - IANA zone (default: the runtime's)
 * @returns The day, or '' when the value isn't a date
 */
export function dayKey(when: When | null | undefined, timeZone?: string): string {
  if (when === null || when === undefined || when === '') return '';
  if (typeof when === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(when)) return when;
  const time = new Date(when).getTime();
  if (Number.isNaN(time)) return '';
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time))) {
    parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * The instant a day starts (00:00) in a time zone: what a day-based range stores.
 * @param key - "YYYY-MM-DD"
 * @param timeZone - IANA zone (default: the runtime's)
 * @returns ISO string, or '' when the key isn't a day
 */
export function dayStart(key: string, timeZone?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  if (!match) return '';
  const guess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // Minutes the zone is ahead of UTC at an instant, from its wall-clock reading.
  const offset = (time: number) => {
    const p: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(time))) {
      p[part.type] = part.value;
    }
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second)) - Math.floor(time / 1000) * 1000;
  };
  // Twice: the second pass corrects a guess that landed on the other side of a daylight saving change.
  let time = guess - offset(guess);
  time = guess - offset(time);
  return new Date(time).toISOString();
}

/** A public holiday: its day, and a name to show. */
export interface Holiday {
  date: string;
  name?: string;
}

/** A day-based range (leave, a roster period), counted in working days. */
export interface WorkingDaysInput {
  /** The first day: "YYYY-MM-DD", or an instant read in `timeZone`. */
  first: When | null | undefined;
  /** The last day, included. */
  last: When | null | undefined;
  timeZone?: string;
  /** Days that aren't worked: "YYYY-MM-DD", or `{ date, name }`. */
  holidays?: (string | Holiday)[] | null;
  /** Days of the week that are worked, 0 (Sunday) to 6 (Saturday). Default Monday to Friday. */
  workDays?: number[] | null;
  /** The first day starts at midday. */
  halfFirst?: boolean | null;
  /** The last day ends at midday. */
  halfLast?: boolean | null;
}

/** What a day-based range counts to. */
export interface WorkingDays {
  /** Working days, halves included (3.5). */
  days: number;
  /** Every day of the range, first to last. */
  calendarDays: number;
  /** The working days, "YYYY-MM-DD". */
  dates: string[];
  /** Days skipped because they aren't work days (weekends). */
  weekends: number;
  /** Holidays that fell on work days. */
  holidays: Holiday[];
  /** The first and last day ("YYYY-MM-DD"), or '' when not set. */
  first: string;
  last: string;
}

/**
 * Counts the working days of a day-based range: work days of the week, less public holidays, less
 * half a day for a first day starting at midday or a last day ending at midday. A one-day range with
 * either half is half a day. The last day comes before the first: nothing.
 * @param input - First and last day, time zone, holidays, work days and halves
 * @returns Days, the working dates and what was skipped
 * @example
 * ```ts
 * workingDays({ first: '2026-12-24', last: '2026-12-29', holidays: ['2026-12-25', '2026-12-28'] }).days; // 2
 * ```
 */
export function workingDays(input: WorkingDaysInput): WorkingDays {
  const toKey = (when: unknown): string => {
    if (when === null || when === undefined || when === '') return '';
    if (typeof when === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(when)) return when;
    const time = new Date(when as string).getTime();
    if (Number.isNaN(time)) return '';
    const parts: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time))) {
      parts[part.type] = part.value;
    }
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const first = toKey(input.first);
  const last = toKey(input.last);
  const result: WorkingDays = { days: 0, calendarDays: 0, dates: [], weekends: 0, holidays: [], first, last };
  if (!first || !last || last < first) return result;
  const workDays = Array.isArray(input.workDays) && input.workDays.length ? input.workDays : [1, 2, 3, 4, 5];
  const holidays: Record<string, Holiday> = {};
  for (const h of input.holidays ?? []) {
    const holiday = typeof h === 'string' ? { date: h } : h;
    if (holiday && typeof holiday.date === 'string') holidays[holiday.date] = holiday;
  }
  // Walk the days as UTC dates: a day key names a calendar day, whatever the zone.
  const [fy, fm, fd] = first.split('-').map(Number);
  const [ly, lm, ld] = last.split('-').map(Number);
  const end = Date.UTC(ly, lm - 1, ld);
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end && result.calendarDays < 3700; t += 86_400_000) {
    const date = new Date(t);
    const key = date.toISOString().slice(0, 10);
    result.calendarDays++;
    if (workDays.indexOf(date.getUTCDay()) === -1) result.weekends++;
    else if (holidays[key]) result.holidays.push(holidays[key]);
    else result.dates.push(key);
  }
  let days = result.dates.length;
  const firstWorked = result.dates[0] === first;
  const lastWorked = result.dates[result.dates.length - 1] === last;
  if (first === last) {
    if (days && (input.halfFirst || input.halfLast)) days = 0.5;
  } else {
    if (input.halfFirst && firstWorked) days -= 0.5;
    if (input.halfLast && lastWorked) days -= 0.5;
  }
  result.days = Math.max(0, days);
  return result;
}

/**
 * Whether two day-based ranges share a day (both ends included).
 * @param a - First range's first and last day ("YYYY-MM-DD")
 * @param b - Second range's first and last day
 * @returns True when they share at least one day
 */
export function daysOverlap(a: { first: string; last: string }, b: { first: string; last: string }): boolean {
  return !!a.first && !!a.last && !!b.first && !!b.last && a.first <= b.last && b.first <= a.last;
}

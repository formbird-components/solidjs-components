// Booking rules shared by the elements (in the browser) and the fleet rulesets (on the server).
//
// The rulesets embed these functions' source (`${hireCost}` in demo/lib/rules.mjs), so each one
// must stand alone: no imports, no module-level helpers, only erasable TypeScript (Node strips the
// types when the demo seed imports this file).

/**
 * How far ahead a hire that is out past its end blocks its asset: bookings starting within this of
 * now clash with it (the booking calendar, and the PreSaveServer rule ruleConflicts).
 */
export const UNRETURNED_BLOCK_MS = 24 * 3_600_000;

/** A stored date: ISO string, epoch milliseconds or Date. */
export type When = string | number | Date;

/**
 * Whether two time ranges overlap. Touching ends don't: 09:00–11:00 and 11:00–12:00 are both fine.
 * @param aStart - Start of the first range
 * @param aEnd - End of the first range
 * @param bStart - Start of the second range
 * @param bEnd - End of the second range
 * @returns True when they share any time
 */
export function overlaps(aStart: When, aEnd: When, bStart: When, bEnd: When): boolean {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  return a0 < b1 && b0 < a1;
}

/**
 * Hire duration in hours: from the booked start to whichever is later, the booked end or the
 * actual close (an overdue return keeps counting).
 * @param start - Booking start
 * @param end - Booking end
 * @param closed - When the booking was closed, if it has been
 * @returns Hours, never negative
 */
export function hireHours(start: When, end: When, closed?: When | null): number {
  const from = new Date(start).getTime();
  const until = Math.max(new Date(end).getTime(), closed ? new Date(closed).getTime() : 0);
  return Math.max(0, (until - from) / 3_600_000);
}

/** What a booking costs: inputs. */
export interface HireCostInput {
  start: When;
  end: When;
  closed?: When | null;
  /** Rate per hour; with a daily rate, each day's hours are capped at the daily rate. */
  hourlyRate?: number | null;
  /** Rate per day used. */
  dailyRate?: number | null;
  /** Time zone that decides calendar days and weekends (default the runtime's). */
  timeZone?: string;
}

/**
 * The hire cost of a booking, charged per calendar day in the company's time zone: hours × hourly
 * rate, capped at the daily rate (or the daily rate for any day used, with no hourly rate).
 * Saturdays and Sundays are free, as in Formbird FLEET's "Combined" charging.
 * @param input - Times, rates and time zone
 * @returns Cost rounded to cents
 * @example
 * ```ts
 * hireCost({ start: '2026-11-04T08:00', end: '2026-11-04T12:30', hourlyRate: 18, dailyRate: 95 }); // 81
 * ```
 */
export function hireCost(input: HireCostInput): number {
  const hourly = Number(input.hourlyRate) || 0;
  const daily = Number(input.dailyRate) || 0;
  if (!hourly && !daily) return 0;
  const from = new Date(input.start).getTime();
  const until = Math.max(new Date(input.end).getTime(), input.closed ? new Date(input.closed).getTime() : 0);
  if (!(until > from)) return 0;
  const parts = (time: number) => {
    const values: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat('en-US', {
      timeZone: input.timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(time))) {
      values[part.type] = part.value;
    }
    return { day: `${values.year}-${values.month}-${values.day}`, weekend: values.weekday === 'Sat' || values.weekday === 'Sun' };
  };
  // Hours per calendar day, walking in 15-minute steps (exact enough for hire, and DST-safe).
  const step = 15 * 60_000;
  const days: Record<string, { hours: number; weekend: boolean }> = {};
  for (let t = from; t < until; t += step) {
    const slice = Math.min(step, until - t);
    const { day, weekend } = parts(t);
    const entry = days[day] ?? (days[day] = { hours: 0, weekend });
    entry.hours += slice / 3_600_000;
  }
  let total = 0;
  for (const key of Object.keys(days)) {
    const day = days[key];
    if (day.weekend || day.hours <= 0) continue;
    let cost = hourly ? day.hours * hourly : daily;
    if (daily && cost > daily) cost = daily;
    total += cost;
  }
  return Math.round(total * 100) / 100;
}

/** A booking's time range, checked before it is saved. */
export interface BookingTimesInput {
  start: When | null | undefined;
  end: When | null | undefined;
  /** The asset's maximum booking duration in hours; falls back to `defaultMaxHours`. */
  maxHours?: number | null;
  defaultMaxHours?: number;
  /** Shortest booking allowed, in minutes (default 15). */
  minMinutes?: number;
  /** What the range is of, in the messages (default "booking"; "job" on a workshop request). */
  noun?: string;
}

/**
 * Problems with a booking's times, as messages for the person booking (empty when fine).
 * @param input - Start, end and limits
 * @returns Messages
 */
export function bookingTimeProblems(input: BookingTimesInput): string[] {
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
  if (maxHours && minutes > maxHours * 60) problems.push(`This asset can be booked for at most ${maxHours} hours at a time.`);
  return problems;
}

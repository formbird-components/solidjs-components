const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Reads what Formbird documents store for dates: ISO strings, epoch milliseconds or Date objects.
 * @param value - Stored value
 * @returns A valid Date, or undefined
 */
export function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'number' || (typeof value === 'string' && value.trim())) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

const startOfDay = (time: number) => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * A date, short: "12 Mar" this year, "12 Mar 2025" otherwise (in the browser's locale).
 * @param value - Stored date
 * @param now - Reference time (tests)
 * @returns The formatted date, or "" when the value isn't a date
 */
export function formatDate(value: unknown, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) return '';
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * Date and time, for tooltips and audit columns: "3 Nov 2026, 9:49 am" (browser locale).
 * @param value - Stored date
 * @returns The formatted value, or "" when the value isn't a date
 */
export function formatDateTime(value: unknown): string {
  const date = toDate(value);
  return date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

/**
 * How long ago, the way issue trackers show it: "just now", "5 minutes ago", "3 hours ago",
 * "yesterday", "4 days ago", then the date.
 * @param value - Stored date
 * @param now - Reference time (tests)
 * @returns Relative text, or "" when the value isn't a date
 */
export function relativeTime(value: unknown, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) return '';
  const diff = now - date.getTime();
  if (diff < -MINUTE) return formatDate(date, now); // clock skew or a future date: show it plainly
  if (diff < 45_000) return 'just now';
  if (diff < HOUR) {
    const minutes = Math.max(1, Math.round(diff / MINUTE));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const days = Math.round((startOfDay(now) - startOfDay(date.getTime())) / DAY);
  if (days === 0 || diff < 12 * HOUR) {
    const hours = Math.max(1, Math.floor(diff / HOUR));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(date, now);
}

/**
 * Time of day: "9:30 am" (browser locale).
 * @param value - Stored date
 * @returns The formatted time, or "" when the value isn't a date
 */
export function formatTime(value: unknown): string {
  const date = toDate(value);
  return date ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

/**
 * A number with grouping: "48,210", "12.5" (browser locale).
 * @param value - Number (or numeric string)
 * @param maximumFractionDigits - Decimals to keep (default 1)
 * @returns The formatted number, or "" when the value isn't a number
 */
export function formatNumber(value: unknown, maximumFractionDigits = 1): string {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return '';
  return number.toLocaleString(undefined, { maximumFractionDigits });
}

/**
 * An amount of money: "$1,240.50" (browser locale, the given currency).
 * @param value - Amount
 * @param currency - ISO 4217 code (default AUD)
 * @returns The formatted amount, or "" when the value isn't a number
 */
export function formatMoney(value: unknown, currency = 'AUD'): string {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return '';
  return number.toLocaleString(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });
}

/**
 * A length of time, compact: "45 min", "2 h 30 min", "3 d 4 h".
 * @param ms - Milliseconds
 * @returns The duration, or "" for negative or invalid input
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const rest = minutes % 60;
  if (days) return hours ? `${days} d ${hours} h` : `${days} d`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * How far away a due date is, by calendar day: "today", "tomorrow", "in 5 days", "yesterday",
 * "3 days ago", then the date beyond a month.
 * @param value - Due date
 * @param now - Reference time (tests)
 * @returns Relative text, or "" when the value isn't a date
 */
export function dueText(value: unknown, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) return '';
  const days = Math.round((startOfDay(date.getTime()) - startOfDay(now)) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (Math.abs(days) > 31) return formatDate(date, now);
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/**
 * Whole calendar days from `now` to a date (negative when past).
 * @param value - Date
 * @param now - Reference time (tests)
 * @returns Days, or undefined when the value isn't a date
 */
export function daysUntil(value: unknown, now: number = Date.now()): number | undefined {
  const date = toDate(value);
  return date ? Math.round((startOfDay(date.getTime()) - startOfDay(now)) / DAY) : undefined;
}

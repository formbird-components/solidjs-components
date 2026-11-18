// Certificates and onboarding readiness: when a certificate expires, where it stands, and which of
// a position's required certificates someone still lacks. Shared by <solid-skills-matrix>, the
// rulesets (embedded as source: keep each function self-contained) and the seed.

/** Days ahead a certificate counts as expiring (and its holder and manager are told). */
export const EXPIRY_WARN_DAYS = 30;

/** Where a certificate stands. */
export interface CertState {
  state: 'valid' | 'expiring' | 'expired' | 'none';
  /** Whole days until it expires (negative once expired), or null with no expiry. */
  daysLeft: number | null;
  /** "Valid", "Expiring", "Expired", "No expiry". */
  label: string;
}

/**
 * Where a certificate stands on a day: expired once its expiry date has passed, expiring within
 * `warnDays`, valid otherwise; one without an expiry date never expires.
 * @param expiry - Its expiry date (ISO, ms or Date)
 * @param now - Now (ms)
 * @param warnDays - Days ahead that count as expiring (default 30)
 * @returns State, days left and a label
 */
export function certState(expiry: unknown, now: number, warnDays?: number): CertState {
  const time = expiry instanceof Date ? expiry.getTime() : typeof expiry === 'number' ? expiry : Date.parse(String(expiry || ''));
  if (!expiry || Number.isNaN(time)) return { state: 'none', daysLeft: null, label: 'No expiry' };
  const daysLeft = Math.floor((time - now) / 86_400_000);
  if (time < now) return { state: 'expired', daysLeft, label: 'Expired' };
  if (daysLeft < (warnDays === undefined ? 30 : warnDays)) return { state: 'expiring', daysLeft, label: 'Expiring' };
  return { state: 'valid', daysLeft, label: 'Valid' };
}

/**
 * When a certificate issued on a day expires: `months` later, on the same day of the month (or the
 * month's last day: 31 Jan + 1 month is 28 or 29 Feb).
 * @param issued - Issue date (ISO, ms or Date)
 * @param months - How long it is valid; 0 or less: it doesn't expire
 * @returns ISO date, or '' when it doesn't expire or the issue date isn't a date
 */
export function expiryFromIssue(issued: unknown, months: number | null | undefined): string {
  const time = issued instanceof Date ? issued.getTime() : typeof issued === 'number' ? issued : Date.parse(String(issued || ''));
  const m = Number(months) || 0;
  if (Number.isNaN(time) || m <= 0) return '';
  const d = new Date(time);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target.toISOString();
}

/**
 * The required certificates someone doesn't hold in date: missing altogether, or held only expired.
 * @param required - The position's required certificate types
 * @param held - Their certificates: type id and expiry
 * @param now - Now (ms)
 * @returns The names of the types still needed, in the order required
 */
export function missingCertificates(
  required: { documentId: string; name: string }[] | null | undefined,
  held: { typeId: string; expiryDate?: unknown }[] | null | undefined,
  now: number,
): string[] {
  const missing: string[] = [];
  for (const type of required || []) {
    if (!type || !type.documentId) continue;
    const ok = (held || []).some((c) => {
      if (!c || c.typeId !== type.documentId) return false;
      if (!c.expiryDate) return true;
      const time = Date.parse(String(c.expiryDate));
      return Number.isNaN(time) || time >= now;
    });
    if (!ok) missing.push(type.name);
  }
  return missing;
}

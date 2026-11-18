// Leave: balances and accrual, minimum staffing, and who approves a request. Shared by
// <solid-leave-balance>, the rulesets (embedded as source: keep each function self-contained, no
// imports and no calls to other module functions) and the seed. Days are "YYYY-MM-DD" keys in the
// company's time zone; working days are counted by the kit's workingDays.

/** What a balance is worked out from. */
export interface BalanceInput {
  /** Days held on `since` (the opening balance). */
  opening: number | null | undefined;
  /** Days a full-time employee accrues in a year (20 for annual leave, 10 for personal leave). */
  accrualPerYear: number | null | undefined;
  /** Full-time equivalent: 1 full time, 0.6 three days a week. Default 1. */
  fte?: number | null;
  /** The day of the opening balance ("YYYY-MM-DD"). */
  since: string;
  /** The day to work the balance out for. */
  at: string;
  /** Requests of this kind of leave: their days and status; only Approved and Pending count. */
  requests: { documentId?: string; days: number | null | undefined; status: string | null | undefined; first?: string }[];
  /** A request to leave out (the one being checked). */
  exclude?: string;
}

/** Where a balance stands on a day. */
export interface Balance {
  opening: number;
  /** Accrued from `since` to `at`. */
  accrued: number;
  /** Days of approved requests. */
  approved: number;
  /** Days of requests waiting for approval (held back, so they can't be spent twice). */
  pending: number;
  /** opening + accrued − approved − pending. */
  available: number;
  /** What accrues a month at this FTE. */
  perMonth: number;
}

/**
 * A leave balance on a day: the opening balance, plus what accrues pro rata (daily) up to that day,
 * less approved and pending requests since the opening balance.
 * @param input - Opening balance and its day, accrual, FTE, the day, and the requests
 * @returns The balance, rounded to hundredths of a day
 * @example
 * ```ts
 * leaveBalance({ opening: 8, accrualPerYear: 20, since: '2026-07-01', at: '2026-12-31', requests: [{ days: 3, status: 'Approved' }] }).available; // 15.03
 * ```
 */
export function leaveBalance(input: BalanceInput): Balance {
  const round = (n: number) => Math.round(n * 100) / 100;
  const fte = Number(input.fte) > 0 ? Number(input.fte) : 1;
  const rate = (Number(input.accrualPerYear) || 0) * fte;
  const from = Date.parse(`${input.since}T00:00:00Z`);
  const to = Date.parse(`${input.at}T00:00:00Z`);
  const days = Number.isNaN(from) || Number.isNaN(to) ? 0 : Math.max(0, (to - from) / 86_400_000);
  let approved = 0;
  let pending = 0;
  for (const r of input.requests || []) {
    if (!r || (input.exclude && r.documentId === input.exclude)) continue;
    if (r.first && input.since && r.first < input.since) continue;
    const n = Number(r.days) || 0;
    if (r.status === 'Approved') approved += n;
    else if (r.status === 'Pending') pending += n;
  }
  const opening = Number(input.opening) || 0;
  const accrued = (rate * days) / 365;
  return {
    opening: round(opening),
    accrued: round(accrued),
    approved: round(approved),
    pending: round(pending),
    available: round(opening + accrued - approved - pending),
    perMonth: round(rate / 12),
  };
}

/** Leave of others in the team that could overlap a request. */
export interface TeamLeave {
  employeeId: string;
  first: string;
  last: string;
  halfFirst?: boolean;
  halfLast?: boolean;
}

/** A day a team would be below its minimum. */
export interface StaffingBreach {
  date: string;
  /** People left that day, this request included (a half day counts half). */
  available: number;
}

/**
 * The days a request would leave its team below the minimum: for each working day of the request,
 * the team less everyone away (other approved and pending leave, and this request), compared with
 * the team's minimum.
 * @param input - The request's working days and halves, the team's size and minimum, and the team's other leave
 * @returns The days below the minimum, in order (empty when there is no minimum or no breach)
 */
export function staffingBreaches(input: {
  dates: string[];
  first?: string;
  last?: string;
  halfFirst?: boolean | null;
  halfLast?: boolean | null;
  employeeId: string;
  teamSize: number;
  min: number | null | undefined;
  others: TeamLeave[];
}): StaffingBreach[] {
  const min = Number(input.min) || 0;
  if (!min || !input.teamSize) return [];
  const breaches: StaffingBreach[] = [];
  for (const date of input.dates || []) {
    const away: Record<string, number> = {};
    for (const o of input.others || []) {
      if (!o || !o.employeeId || o.employeeId === input.employeeId || date < o.first || date > o.last) continue;
      const half = (date === o.first && o.halfFirst) || (date === o.last && o.halfLast);
      away[o.employeeId] = Math.max(away[o.employeeId] || 0, half ? 0.5 : 1);
    }
    const mine = (date === input.first && input.halfFirst) || (date === input.last && input.halfLast) ? 0.5 : 1;
    let total = mine;
    for (const id of Object.keys(away)) total += away[id];
    const available = input.teamSize - total;
    if (available < min) breaches.push({ date, available });
  }
  return breaches;
}

/** A person on an approval step. */
export interface Approver {
  documentId: string;
  name: string;
}

/**
 * The approval steps a leave request needs: the employee's line manager; a second approver (the
 * manager's own manager) when the leave would leave the team below its minimum; and People &
 * Culture for leave that needs them (unpaid leave). Nobody approves their own leave: a manager's
 * request goes to their manager, and a step without anyone goes to People & Culture.
 * @param o - The employee, their manager and the manager's manager, People & Culture, the breaches, and the team
 * @returns Steps for the kit's approval chain (no decisions)
 */
export function leaveApprovalSteps(o: {
  employee: Approver;
  manager?: Approver | null;
  skipLevel?: Approver | null;
  hr: Approver[];
  breaches: StaffingBreach[];
  teamName?: string;
  teamSize?: number;
  min?: number | null;
  needsHr?: boolean;
  typeName?: string;
}): { id: string; label: string; reason?: string; approvers: Approver[] }[] {
  const pick = (p: Approver | null | undefined) => (p && p.documentId ? { documentId: p.documentId, name: p.name } : null);
  const notMe = (list: (Approver | null)[]) => list.filter((p): p is Approver => !!p && p.documentId !== o.employee.documentId);
  const hr = notMe((o.hr || []).map(pick));
  const steps: { id: string; label: string; reason?: string; approvers: Approver[] }[] = [];
  let manager = notMe([pick(o.manager)]);
  if (!manager.length) manager = notMe([pick(o.skipLevel)]);
  if (!manager.length) manager = hr;
  steps.push({ id: 'manager', label: 'Line manager', approvers: manager });
  if (o.breaches && o.breaches.length) {
    const taken = manager.map((p) => p.documentId);
    let second = notMe([pick(o.skipLevel)]).filter((p) => taken.indexOf(p.documentId) === -1);
    if (!second.length) second = hr.filter((p) => taken.indexOf(p.documentId) === -1);
    const day = (key: string) => {
      const d = new Date(`${key}T00:00:00Z`);
      return `${d.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short' })} ${d.getUTCDate()} ${d.toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'short' })}`;
    };
    const shown = o.breaches.slice(0, 3).map((b) => day(b.date)).join(', ') + (o.breaches.length > 3 ? ` and ${o.breaches.length - 3} more` : '');
    const fewest = Math.min(...o.breaches.map((b) => b.available));
    steps.push({
      id: 'second',
      label: 'Second approver',
      reason: `${o.teamName || 'The team'} would have ${fewest}${o.teamSize ? ` of ${o.teamSize}` : ''} on ${shown}, below its minimum of ${o.min}.`,
      approvers: second,
    });
  }
  if (o.needsHr) {
    const taken = steps.reduce((ids, s) => ids.concat(s.approvers.map((p) => p.documentId)), [] as string[]);
    const people = hr.filter((p) => taken.indexOf(p.documentId) === -1);
    steps.push({ id: 'hr', label: 'People & Culture', reason: `${o.typeName || 'This leave'} is approved by People & Culture.`, approvers: people.length ? people : hr });
  }
  return steps;
}

/**
 * What a leave request covers, as lists show it: "Tue 8 Dec (pm) – Thu 10 Dec", "Fri 11 Dec (am)".
 * @param first - First day ("YYYY-MM-DD")
 * @param last - Last day
 * @param halfFirst - Starts at midday
 * @param halfLast - Ends at midday
 * @returns The text, or '' without both days
 */
export function leavePeriodText(first: string, last: string, halfFirst?: boolean | null, halfLast?: boolean | null): string {
  if (!first || !last) return '';
  const day = (key: string) => {
    const d = new Date(`${key}T00:00:00Z`);
    return `${d.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short' })} ${d.getUTCDate()} ${d.toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'short' })}`;
  };
  if (first === last) return `${day(first)}${halfFirst ? ' (pm)' : halfLast ? ' (am)' : ''}`;
  return `${day(first)}${halfFirst ? ' (pm)' : ''} – ${day(last)}${halfLast ? ' (am)' : ''}`;
}

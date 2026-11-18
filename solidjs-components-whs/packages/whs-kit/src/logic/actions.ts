// Corrective actions and controls: the hierarchy of controls, due dates, and where a list of
// actions stands. Shared by <solid-corrective-actions>, the rulesets (embedded as source: keep
// each function self-contained) and the seed.

/** The hierarchy of controls, most effective first (the Control level lookup's values). */
export const CONTROL_LEVELS = [
  { rank: 1, name: 'Eliminate', hint: 'Remove the hazard altogether' },
  { rank: 2, name: 'Substitute', hint: 'Replace it with something safer' },
  { rank: 3, name: 'Isolate', hint: 'Separate people from it (barriers, guarding, exclusion zones)' },
  { rank: 4, name: 'Engineering', hint: 'Change the plant or process (extraction, interlocks, mechanical aids)' },
  { rank: 5, name: 'Administrative', hint: 'Procedures, training, signage, rosters' },
  { rank: 6, name: 'PPE', hint: 'Personal protective equipment' },
];

/** Action statuses (the Action status lookup's values). */
export const ACTION_STATUSES = ['Open', 'In Progress', 'Completed', 'Verified', 'Cancelled'];

/**
 * Rank of a control level in the hierarchy: 1 (Eliminate) is the most effective.
 * @param level - A control level name
 * @returns 1 to 6, or 99 when unknown
 */
export function controlRank(level: unknown): number {
  const ranks: Record<string, number> = { Eliminate: 1, Substitute: 2, Isolate: 3, Engineering: 4, Administrative: 5, PPE: 6 };
  return ranks[String(level)] ?? 99;
}

/**
 * When an action is due: `days` after it was raised, at 5 pm UTC+10 that day (end of the working day
 * in eastern Australia).
 * @param raised - When it was raised (ISO or ms)
 * @param days - Days allowed
 * @returns ISO date
 */
export function actionDueDate(raised: unknown, days: number): string {
  const from = typeof raised === 'number' ? raised : Date.parse(String(raised));
  const due = new Date(from + days * 86_400_000);
  const eastern = new Date(due.getTime() + 10 * 3_600_000);
  return new Date(Date.UTC(eastern.getUTCFullYear(), eastern.getUTCMonth(), eastern.getUTCDate(), 7, 0, 0)).toISOString();
}

/** Where one action stands. */
export type ActionState = 'open' | 'dueSoon' | 'overdue' | 'done' | 'cancelled';

/**
 * Where one action stands.
 * @param action - Its status name and due date
 * @param now - Now (ms)
 * @returns done (Completed or Verified), cancelled, overdue, dueSoon (within 3 days) or open
 */
export function actionState(action: { status?: string | null; dueDate?: string | null }, now: number): ActionState {
  const status = String(action.status ?? '');
  if (status === 'Completed' || status === 'Verified') return 'done';
  if (status === 'Cancelled') return 'cancelled';
  const due = Date.parse(String(action.dueDate ?? ''));
  if (Number.isNaN(due)) return 'open';
  if (due < now) return 'overdue';
  return due - now < 3 * 86_400_000 ? 'dueSoon' : 'open';
}

/** Where a record's actions stand. */
export interface ActionsSummary {
  /** Actions not cancelled. */
  total: number;
  open: number;
  overdue: number;
  /** Completed or Verified. */
  done: number;
  /** Verified only. */
  verified: number;
  cancelled: number;
  /** The most effective control level among actions not cancelled (99: none). */
  strongestRank: number;
}

/**
 * Where a record's actions stand.
 * @param actions - Status, due date and control level of each
 * @param now - Now (ms)
 * @returns Counts and the strongest control
 */
export function actionsSummary(actions: { status?: string | null; dueDate?: string | null; controlLevel?: string | null }[] | null | undefined, now: number): ActionsSummary {
  const ranks: Record<string, number> = { Eliminate: 1, Substitute: 2, Isolate: 3, Engineering: 4, Administrative: 5, PPE: 6 };
  const summary: ActionsSummary = { total: 0, open: 0, overdue: 0, done: 0, verified: 0, cancelled: 0, strongestRank: 99 };
  for (const action of actions ?? []) {
    const status = String(action.status ?? '');
    if (status === 'Cancelled') {
      summary.cancelled++;
      continue;
    }
    summary.total++;
    if (status === 'Completed' || status === 'Verified') summary.done++;
    else {
      summary.open++;
      const due = Date.parse(String(action.dueDate ?? ''));
      if (!Number.isNaN(due) && due < now) summary.overdue++;
    }
    if (status === 'Verified') summary.verified++;
    const rank = ranks[String(action.controlLevel ?? '')] ?? 99;
    if (rank < summary.strongestRank) summary.strongestRank = rank;
  }
  return summary;
}

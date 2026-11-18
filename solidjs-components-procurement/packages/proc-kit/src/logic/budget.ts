// Cost centre budgets and invoices: where a budget stands for the financial year, whether a request
// fits, and how an invoice compares with what was approved. Shared by <solid-budget-check>, the
// rulesets (embedded as source: keep each function self-contained) and the seed. Amounts are ex GST.

/** A request as the budget counts it. */
export interface BudgetRequest {
  documentId: string;
  /** Submitted: waiting for approval; Approved, Ordered, Received: committed; Closed: spent. */
  status: string;
  /** Its amount, ex GST. */
  amount: number | null | undefined;
  /** For a closed request, what the invoice came to, ex GST (else its amount counts). */
  invoiced?: number | null;
}

/** Where a budget stands. */
export interface BudgetPosition {
  budget: number;
  /** Spent before the requests (other costs), plus closed requests. */
  spent: number;
  /** Approved, ordered and received requests not yet invoiced. */
  committed: number;
  /** Requests waiting for approval (shown, not taken off). */
  pending: number;
  /** budget − spent − committed. */
  remaining: number;
  /** The amount being checked, and what is left after it. */
  amount: number;
  after: number;
  /** How far the amount goes over what is left (0: it fits). */
  overBy: number;
}

/**
 * Where a cost centre's budget stands, and whether an amount fits in what is left.
 * @param o - The budget, other spending, the cost centre's requests this year, a request to leave
 *   out (the one being checked), and the amount to check
 * @returns The position, rounded to cents
 */
export function budgetPosition(o: { budget: number | null | undefined; baseSpent?: number | null; requests: BudgetRequest[]; exclude?: string; amount?: number | null }): BudgetPosition {
  const round = (n: number) => Math.round(n * 100) / 100;
  let spent = Number(o.baseSpent) || 0;
  let committed = 0;
  let pending = 0;
  for (const r of o.requests || []) {
    if (!r || (o.exclude && r.documentId === o.exclude)) continue;
    const amount = Number(r.amount) || 0;
    const invoiced = r.invoiced === null || r.invoiced === undefined ? NaN : Number(r.invoiced);
    if (r.status === 'Closed') spent += Number.isFinite(invoiced) ? invoiced : amount;
    else if (r.status === 'Approved' || r.status === 'Ordered' || r.status === 'Received') committed += amount;
    else if (r.status === 'Submitted') pending += amount;
  }
  const budget = Number(o.budget) || 0;
  const remaining = budget - spent - committed;
  const amount = Number(o.amount) || 0;
  return {
    budget: round(budget),
    spent: round(spent),
    committed: round(committed),
    pending: round(pending),
    remaining: round(remaining),
    amount: round(amount),
    after: round(remaining - amount),
    overBy: round(Math.max(0, amount - Math.max(0, remaining))),
  };
}

/** How an invoice compares with the approved total. */
export interface InvoiceMatch {
  /** invoiced − approved (inc GST). */
  variance: number;
  /** The variance as a percentage of the approved total. */
  pct: number;
  /** Matched (to the cent), Within tolerance, Over tolerance, or Under. */
  result: 'Matched' | 'Within tolerance' | 'Over tolerance' | 'Under';
}

/**
 * Matches an invoice to what was approved: over by more than the tolerance (a percentage and a
 * minimum amount, both must be exceeded) needs a reason before the request closes.
 * @param o - Approved and invoiced totals (inc GST), the tolerance
 * @returns The variance and the result
 */
export function invoiceMatch(o: { approved: number; invoiced: number; tolerancePct?: number; toleranceAmount?: number }): InvoiceMatch {
  const approved = Number(o.approved) || 0;
  const invoiced = Number(o.invoiced) || 0;
  const variance = Math.round((invoiced - approved) * 100) / 100;
  const pct = approved ? Math.round((variance / approved) * 1000) / 10 : 0;
  const tolerancePct = o.tolerancePct === undefined ? 5 : Number(o.tolerancePct);
  const toleranceAmount = o.toleranceAmount === undefined ? 100 : Number(o.toleranceAmount);
  let result: InvoiceMatch['result'] = 'Matched';
  if (Math.abs(variance) < 0.01) result = 'Matched';
  else if (variance < 0) result = 'Under';
  else if (pct > tolerancePct && variance > toleranceAmount) result = 'Over tolerance';
  else result = 'Within tolerance';
  return { variance, pct, result };
}

/**
 * The financial year (1 July to 30 June) a day falls in: "FY2026-27".
 * @param key - "YYYY-MM-DD"
 * @returns The year's name, or '' for no day
 */
export function financialYear(key: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(String(key || ''));
  if (!match) return '';
  const year = Number(match[1]);
  const start = Number(match[2]) >= 7 ? year : year - 1;
  return 'FY' + start + '-' + String((start + 1) % 100).padStart(2, '0');
}

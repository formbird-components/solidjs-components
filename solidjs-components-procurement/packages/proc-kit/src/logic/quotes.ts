// Quotes: how many the amount of a purchase needs, and what's wrong with the quotes a request has.
// Shared by <solid-quote-compare>, the rulesets (embedded as source: keep each function
// self-contained) and the seed.

/** From this amount (ex GST, exclusive) a purchase needs this many written quotes. */
export interface QuoteRule {
  fromAmount: number;
  quotes: number;
}

/** A quote as the rules read it. */
export interface QuoteFact {
  documentId: string;
  supplier: string;
  /** Ex GST. */
  amount: number | null | undefined;
  /** ISO date it is valid until; none: no end. */
  validUntil?: string | null;
}

/**
 * How many written quotes a purchase of this amount needs.
 * @param amount - Ex GST
 * @param rules - The thresholds (any order)
 * @returns The number (0: none)
 */
export function quotesNeeded(amount: number | null | undefined, rules: QuoteRule[]): number {
  const n = Number(amount) || 0;
  let needed = 0;
  for (const rule of rules || []) if (n > (Number(rule.fromAmount) || 0) && rule.quotes > needed) needed = rule.quotes;
  return needed;
}

/**
 * The state of a request's quotes: which are still valid, the cheapest valid one, how many the amount
 * needs, and what's wrong (fewer than needed without a sole-supplier reason; no quote chosen; the
 * chosen one expired, not the cheapest without a reason, or far from the request's amount).
 * @param o - The amount, the quotes, the chosen quote, the reasons, the rules, and now
 * @returns The facts and the problems (messages, empty when fine)
 */
export function quoteProblems(o: {
  amount: number;
  quotes: QuoteFact[];
  chosenId?: string | null;
  soleSupplierReason?: string | null;
  notCheapestReason?: string | null;
  rules: QuoteRule[];
  now: number;
}): { needed: number; valid: QuoteFact[]; cheapest: QuoteFact | null; chosen: QuoteFact | null; shortBy: number; problems: string[] } {
  const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  let needed = 0;
  for (const rule of o.rules || []) if ((Number(o.amount) || 0) > (Number(rule.fromAmount) || 0) && rule.quotes > needed) needed = rule.quotes;
  const isValid = (q: QuoteFact) => Number(q.amount) > 0 && (!q.validUntil || Date.parse(String(q.validUntil)) >= o.now - 86_400_000);
  const valid = (o.quotes || []).filter(isValid);
  const cheapest = valid.reduce<QuoteFact | null>((best, q) => (!best || Number(q.amount) < Number(best.amount) ? q : best), null);
  const chosen = (o.quotes || []).find((q) => q.documentId === o.chosenId) || null;
  const shortBy = Math.max(0, needed - valid.length);
  const problems: string[] = [];
  const sole = !!String(o.soleSupplierReason || '').trim();
  if (shortBy && !sole) {
    const rule = (o.rules || []).filter((r) => r.quotes === needed)[0];
    problems.push(
      (needed === 1 ? 'A written quote is' : needed + ' written quotes are') + ' needed above ' + money(rule ? rule.fromAmount : 0) + ' (' + valid.length + ' so far)' + (needed > 1 ? ', or a reason there is only one supplier.' : '.'),
    );
  }
  if (needed && valid.length && !chosen) problems.push('Choose the quote you are going with.');
  if (chosen) {
    if (!isValid(chosen)) problems.push('The chosen quote from ' + chosen.supplier + ' has expired: ask for a new one.');
    else if (cheapest && chosen.documentId !== cheapest.documentId && Number(chosen.amount) > Number(cheapest.amount) && !String(o.notCheapestReason || '').trim()) {
      problems.push('Say why not the cheapest quote (' + cheapest.supplier + ', ' + money(Number(cheapest.amount)) + ').');
    }
    const amount = Number(o.amount) || 0;
    if (isValid(chosen) && amount > 0 && Math.abs(amount - Number(chosen.amount)) > Math.max(1, Number(chosen.amount) * 0.05)) {
      problems.push('The request comes to ' + money(amount) + ' but the chosen quote is ' + money(Number(chosen.amount)) + ': make the lines match the quote.');
    }
  }
  return { needed, valid, cheapest, chosen, shortBy, problems };
}

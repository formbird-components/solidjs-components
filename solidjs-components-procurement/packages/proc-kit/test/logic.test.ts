import { describe, expect, it } from 'vitest';
import { purchaseApprovalSteps, type ApprovalTier } from '../src/logic/approvals';
import { budgetPosition, financialYear, invoiceMatch } from '../src/logic/budget';
import { quoteProblems, quotesNeeded } from '../src/logic/quotes';

const p = (documentId: string) => ({ documentId, name: documentId[0].toUpperCase() + documentId.slice(1) });
const TIERS: ApprovalTier[] = [
  { id: 'manager', label: 'Cost centre manager', fromAmount: 0, rule: 'owner' },
  { id: 'senior', label: 'Senior manager', fromAmount: 5000, rule: 'ownerManager' },
  { id: 'cfo', label: 'Chief Financial Officer', fromAmount: 25000, rule: 'people', approvers: [p('anjali')] },
  { id: 'ceo', label: 'Chief Executive', fromAmount: 100000, rule: 'people', approvers: [p('robert')] },
];
const steps = (o: Partial<Parameters<typeof purchaseApprovalSteps>[0]>) =>
  purchaseApprovalSteps({ requester: p('kai'), owner: p('tom'), ownerManager: p('greg'), amount: 1000, tiers: TIERS, finance: [p('lachlan')], procurement: [p('marco')], ...o }).map((s) => [s.id, s.approvers.map((a) => a.documentId)]);

describe('purchaseApprovalSteps', () => {
  it('adds a delegation for each threshold the amount passes', () => {
    expect(steps({ amount: 3480 })).toEqual([['manager', ['tom']]]);
    expect(steps({ amount: 5000 })).toEqual([['manager', ['tom']]]);
    expect(steps({ amount: 18900 })).toEqual([['manager', ['tom']], ['senior', ['greg']]]);
    expect(steps({ amount: 120000 })).toEqual([['manager', ['tom']], ['senior', ['greg']], ['cfo', ['anjali']], ['ceo', ['robert']]]);
  });

  it('adds Procurement and a Finance override when the request needs them, before the higher delegations', () => {
    const planned = purchaseApprovalSteps({
      requester: p('noah'), owner: p('daniel'), ownerManager: p('anjali'), amount: 46200, tiers: TIERS, finance: [p('lachlan')], procurement: [p('marco')],
      procurementReasons: ['Sole supplier: only the manufacturer services it.'], overBudget: { by: 8420, remaining: 37780, costCentre: 'IT' },
    });
    expect(planned.map((s) => [s.id, s.approvers.map((a) => a.documentId)])).toEqual([
      ['manager', ['daniel']], ['procurement', ['marco']], ['finance', ['lachlan']], ['senior', ['anjali']],
    ]);
    expect(planned[2].reason).toBe('IT has $37,780 left this year: this request goes $8,420 over.');
    expect(planned[3].reason).toBe('Above $5,000.');
  });

  it('never has the requester approve, and nobody approves twice', () => {
    // Tom's own request goes to Greg; Greg then covers the senior step.
    expect(steps({ requester: p('tom'), amount: 9000 })).toEqual([['manager', ['greg']]]);
    // Daniel's manager is the CFO: the CFO step is already covered.
    expect(steps({ requester: p('noah'), owner: p('daniel'), ownerManager: p('anjali'), amount: 30000 })).toEqual([['manager', ['daniel']], ['senior', ['anjali']]]);
    // Nobody left for a step: Finance.
    expect(steps({ requester: p('robert'), owner: p('robert'), ownerManager: null, amount: 2000 })).toEqual([['manager', ['lachlan']]]);
  });
});

describe('quotes', () => {
  const RULES = [{ fromAmount: 2000, quotes: 1 }, { fromAmount: 10000, quotes: 3 }];
  const now = Date.parse('2026-11-18T00:00:00Z');
  const q = (documentId: string, supplier: string, amount: number, validUntil = '2026-12-31') => ({ documentId, supplier, amount, validUntil });

  it('needs more quotes as the amount rises', () => {
    expect([quotesNeeded(1500, RULES), quotesNeeded(2000, RULES), quotesNeeded(2001, RULES), quotesNeeded(18900, RULES)]).toEqual([0, 0, 1, 3]);
  });

  it('wants enough valid quotes, or a sole-supplier reason', () => {
    const two = [q('a', 'Acme', 18900), q('b', 'Bolt', 19400), q('c', 'Crane', 17000, '2026-11-01')];
    const r = quoteProblems({ amount: 18900, quotes: two, chosenId: 'a', rules: RULES, now });
    expect(r.valid.map((x) => x.documentId)).toEqual(['a', 'b']);
    expect(r.problems).toEqual(['3 written quotes are needed above $10,000 (2 so far), or a reason there is only one supplier.']);
    expect(quoteProblems({ amount: 18900, quotes: two, chosenId: 'a', soleSupplierReason: 'Only two suppliers stock it.', rules: RULES, now }).problems).toEqual([]);
  });

  it('wants a quote chosen, a reason for not the cheapest, and the lines to match it', () => {
    const three = [q('a', 'Acme', 18900), q('b', 'Bolt', 17950), q('c', 'Crane', 19400)];
    expect(quoteProblems({ amount: 18900, quotes: three, rules: RULES, now }).problems).toEqual(['Choose the quote you are going with.']);
    expect(quoteProblems({ amount: 18900, quotes: three, chosenId: 'a', rules: RULES, now }).problems).toEqual(['Say why not the cheapest quote (Bolt, $17,950).']);
    expect(quoteProblems({ amount: 18900, quotes: three, chosenId: 'a', notCheapestReason: 'Bolt can’t deliver before the shutdown.', rules: RULES, now }).problems).toEqual([]);
    expect(quoteProblems({ amount: 12000, quotes: three, chosenId: 'b', rules: RULES, now }).problems).toEqual(['The request comes to $12,000 but the chosen quote is $17,950: make the lines match the quote.']);
    expect(quoteProblems({ amount: 18900, quotes: [q('x', 'Old', 18900, '2026-10-01')], chosenId: 'x', soleSupplierReason: 'Sole', rules: RULES, now }).problems).toEqual(['The chosen quote from Old has expired: ask for a new one.']);
  });
});

describe('budgets and invoices', () => {
  it('counts spent, committed and pending, and whether an amount fits', () => {
    const position = budgetPosition({
      budget: 120000,
      baseSpent: 60000,
      requests: [
        { documentId: 'a', status: 'Closed', amount: 10000, invoiced: 10400 },
        { documentId: 'b', status: 'Closed', amount: 2000 },
        { documentId: 'c', status: 'Ordered', amount: 8000 },
        { documentId: 'd', status: 'Approved', amount: 1500 },
        { documentId: 'e', status: 'Submitted', amount: 46200 },
        { documentId: 'f', status: 'Rejected', amount: 9999 },
      ],
      exclude: 'e',
      amount: 46200,
    });
    expect(position).toEqual({ budget: 120000, spent: 72400, committed: 9500, pending: 0, remaining: 38100, amount: 46200, after: -8100, overBy: 8100 });
    expect(budgetPosition({ budget: 1000, requests: [], amount: 400 }).overBy).toBe(0);
  });

  it('matches an invoice with a tolerance', () => {
    expect(invoiceMatch({ approved: 1100, invoiced: 1100 }).result).toBe('Matched');
    expect(invoiceMatch({ approved: 1100, invoiced: 1150 })).toEqual({ variance: 50, pct: 4.5, result: 'Within tolerance' });
    expect(invoiceMatch({ approved: 1100, invoiced: 1188 }).result).toBe('Within tolerance'); // 8% but only $88
    expect(invoiceMatch({ approved: 22000, invoiced: 23760 })).toEqual({ variance: 1760, pct: 8, result: 'Over tolerance' });
    expect(invoiceMatch({ approved: 1100, invoiced: 1000 }).result).toBe('Under');
  });

  it('names the financial year', () => {
    expect([financialYear('2026-11-18'), financialYear('2027-06-30'), financialYear('2027-07-01'), financialYear('')]).toEqual(['FY2026-27', 'FY2026-27', 'FY2027-28', '']);
  });

  it('is self-contained, so a ruleset can carry its source', () => {
    for (const fn of [purchaseApprovalSteps, quotesNeeded, quoteProblems, budgetPosition, invoiceMatch, financialYear]) {
      // eslint-disable-next-line no-new-func
      expect(typeof new Function(`return (${String(fn)})`)()).toBe('function');
    }
    // eslint-disable-next-line no-new-func
    const copy = new Function(`return (${String(quoteProblems)})`)();
    expect(copy({ amount: 18900, quotes: [], rules: [{ fromAmount: 10000, quotes: 3 }], now: 0 }).needed).toBe(3);
    // eslint-disable-next-line no-new-func
    const steps = new Function(`return (${String(purchaseApprovalSteps)})`)();
    expect(steps({ requester: p('kai'), owner: p('tom'), amount: 9000, tiers: TIERS, finance: [], ownerManager: p('greg') }).length).toBe(2);
  });
});

// The procurement rulesets, evaluated from the DSL the seed writes (as fieldtec-web would), against
// the seed's own records and the cases each rule exists for. The server's searches are answered from
// the seed with the shared mock Elasticsearch matcher; updates are recorded. demo/test/e2e.mjs runs
// the same rules on the real server.
import { describe, expect, it } from 'vitest';
import { matches, sortDocs } from '@solidjs-components/testing';
// @ts-expect-error: plain ES module without types
import { buildDemo } from '../lib/build.mjs';
// @ts-expect-error: plain ES module without types
import { KEYS, procId, ROLES } from '../lib/model.mjs';

type Doc = Record<string, any>;
type Ruleset = Record<string, any> & { lib: Record<string, any>; name: string };

const demo = buildDemo({ now: new Date(), platform: false }) as { documents: Doc[]; seedFacts: Doc };
const facts = demo.seedFacts;
const docs = demo.documents;
const records = (kind: string) => docs.filter((d) => d.systemHeader.systemType === 'document' && d.appTags?.[0] === 'proc' && d.appTags[1] === kind);
const evaluate = (dsl: string): Ruleset => new Function(`return ${dsl.replace('#include "JayRule Ruleset Overlay JS",', '')}`)().ruleset;
const rulesets: Record<string, Ruleset> = Object.fromEntries(docs.filter((d) => d.systemHeader.systemType === 'ruleset' && d.ruleSetGroup === 'proc').map((d) => [d.name, evaluate(d.ruleSetDSL)]));
const rs = (name: string) => rulesets[name];
const clone = <T>(v: T): T => structuredClone(v);
const account = (key: string) => facts.people[key].account as Doc;
const status = (name: string) => facts.statuses.requestStatus[name];
/** A story request by its key (catalog.mjs STORY). */
const request = (key: string) => clone(docs.find((d) => d.documentId === procId('request', key))!);
const keyOf = (documentId: string) => Object.keys(facts.people).find((k) => account(k).documentId === documentId)!;

function context(ruleset: Ruleset, document: Doc, key: string, extra: Doc[] = []) {
  const me = account(key);
  const keys = (ROLES[me.accountType] as string[]).map((k) => ({ keyId: KEYS[k], rights: ['Read', 'Update'] }));
  const calls: { search: Doc[]; update: [string, Doc][] } = { search: [], update: [] };
  const all = [...extra, ...docs.filter((d) => !extra.some((x) => x.documentId === d.documentId))];
  const ntf: Record<string, any> = {
    document,
    ruleset,
    userId: me.documentId,
    context: { eventName: 'PreSave', user: me, accountControl: { accessKeys: keys } },
    logger: { error: (m: string) => console.error(m), info: () => {} },
    scope: {
      findDocumentsByElastic(query: Doc, _user: string, cb: (err: unknown, result: unknown) => void) {
        calls.search.push(query);
        const hits = sortDocs(all.filter((d) => matches(d, query.query)), query.sort).slice(0, query.size ?? 10);
        cb(null, { data: { hits: { hits: hits.map((_source) => ({ _source: clone(_source) })) } } });
      },
      updateDocument(id: string, change: Doc, _user: string, _opts: unknown, cb: (err: unknown) => void) {
        calls.update.push([id, change]);
        cb(null);
      },
      showNotification() {},
      showField() {},
      mandateField() {},
      enableField() {},
    },
  };
  return { ntf, calls };
}
async function runAll(ruleset: Ruleset, ntf: Record<string, any>) {
  for (const name of Object.keys(ruleset).filter((k) => k.startsWith('rule'))) {
    const rule = ruleset[name];
    const condition = typeof rule.ruleCondition === 'function' ? rule.ruleCondition(ntf) : rule.ruleCondition;
    if (!condition) continue;
    if (rule.ruleAction.length > 1) await new Promise<void>((resolve) => rule.ruleAction(ntf, ntf.lib?.once ? ntf.lib.once(ntf, resolve) : resolve));
    else rule.ruleAction(ntf);
  }
}
async function save(name: string, document: Doc, key: string, extra: Doc[] = []) {
  const { ntf, calls } = context(rs(name), document, key, extra);
  await runAll(rs(name), ntf);
  return { error: ntf.errorMessage as string | undefined, doc: ntf.document, calls };
}
const decide = (d: Doc, stepId: string, decision: 'approved' | 'rejected', by: string, comment = '') => {
  const next = clone(d);
  const step = next.approvalChain.steps.find((s: Doc) => s.id === stepId);
  step.decision = decision;
  step.decidedBy = { documentId: account(by).documentId, name: account(by).systemHeader.summaryName };
  step.comment = comment;
  return next;
};
const moveTo = (d: Doc, name: string, extra: Doc = {}) => ({ ...clone(d), requestStatusRel: [status(name)], ...extra });

describe('the rulesets', () => {
  it('all five evaluate, each with the shared helpers, the logic and the validator', () => {
    expect(Object.keys(rulesets).sort()).toEqual(['Purchase Request - Client', 'Purchase Request - PostSave', 'Purchase Request - PreSaveServer', 'Quote - PostSave', 'Quote - PreSaveServer']);
    for (const ruleset of Object.values(rulesets)) {
      for (const fn of ['once', 'guard', 'transition', 'lineTotals', 'approvalProblems', 'purchaseApprovalSteps', 'quoteProblems', 'budgetPosition', 'invoiceMatch', 'validatePurchase']) {
        expect(typeof ruleset.lib[fn], `${ruleset.name}: ${fn}`).toBe('function');
      }
    }
  });

  it('accept every seeded request saved again as it is, and agree with what the seed derived', async () => {
    for (const r of records('request')) {
      const { error, doc } = await save('Purchase Request - PreSaveServer', clone(r), keyOf(r.requesterRel[0].documentId));
      expect(error, `${r.requestRef} ${r.title}`).toBeUndefined();
      expect(JSON.stringify([doc.subtotalNum, doc.requestStatusRel[0].name, doc.approvalState, doc.nextApproverIds, doc.overBudgetBool, doc.quotesValidNum]), r.requestRef).toBe(
        JSON.stringify([r.subtotalNum, r.requestStatusRel[0].name, r.approvalState, r.nextApproverIds, r.overBudgetBool, r.quotesValidNum]),
      );
      expect(doc.approvalChain.steps.map((s: Doc) => [s.id, s.decision]), r.requestRef).toEqual(r.approvalChain.steps.map((s: Doc) => [s.id, s.decision]));
    }
  });
});

describe('submitting', () => {
  it('plans approvers by amount, Finance when over budget, Procurement for a sole supplier', async () => {
    const stand = request('stand');
    const { error, doc } = await save('Purchase Request - PreSaveServer', moveTo(stand, 'Submitted'), 'sophie');
    expect(error).toBeUndefined();
    expect(doc.approvalChain.steps.map((s: Doc) => [s.id, s.approvers.map((a: Doc) => a.name)])).toEqual([['manager', ['Robert Hayes']]]);
    expect(doc.notesCommentsArr.at(-1).detail).toBe('Submitted for $7,800 ex GST. Waiting for Robert Hayes (Cost centre manager). Told Robert Hayes.');
    const laptops = request('laptops');
    expect(laptops.approvalChain.steps.map((s: Doc) => s.id)).toEqual(['manager', 'finance', 'senior']);
    expect(laptops.approvalChain.steps[1].reason).toBe('IT has $37,780 left this year: this request goes $8,420 over.');
    expect(request('windows').approvalChain.steps.map((s: Doc) => s.id)).toEqual(['manager', 'procurement', 'senior']);
  });

  it('refuses too few quotes, no chosen quote, not the cheapest without a reason, a blocked supplier', async () => {
    const stand = request('stand');
    const noQuote = moveTo(stand, 'Submitted', { chosenQuoteRel: [] });
    expect((await save('Purchase Request - PreSaveServer', noQuote, 'sophie')).error).toBe('Choose the quote you are going with.');
    const pricier = moveTo(stand, 'Submitted', { chosenQuoteRel: [{ documentId: records('quote').find((q) => q.supplierName === 'Brightside Signs and Print' && q.requestRel[0].documentId === stand.documentId)!.documentId }] });
    expect((await save('Purchase Request - PreSaveServer', pricier, 'sophie')).error).toBe('Say why not the cheapest quote (ExpoWorks Displays, $7,800).');
    const big = moveTo(stand, 'Submitted', { lineItemsArr: [{ ...stand.lineItemsArr[0], qty: 2 }] });
    expect((await save('Purchase Request - PreSaveServer', big, 'sophie')).error).toBe('3 written quotes are needed above $10,000 (2 so far), or a reason there is only one supplier.');
    const blocked = moveTo(stand, 'Submitted', { supplierRel: [{ documentId: 'x', name: 'Discount Imports Direct', blockedBool: true }] });
    expect((await save('Purchase Request - PreSaveServer', blocked, 'sophie')).error).toBe('Discount Imports Direct is blocked: choose another supplier.');
    expect((await save('Purchase Request - PreSaveServer', moveTo(stand, 'Submitted'), 'kai')).error).toBe('Only Sophie Turner or Procurement can submit this request.');
  });
});

describe('approving', () => {
  it('moves on step by step, then approves and tells Procurement', async () => {
    const gens = request('generators');
    const { error, doc } = await save('Purchase Request - PreSaveServer', decide(gens, 'senior', 'approved', 'greg'), 'greg', [gens]);
    expect(error).toBeUndefined();
    expect(doc.requestStatusRel[0].name).toBe('Approved');
    expect(doc.notesCommentsArr.at(-1).detail).toBe('**Approved** for $18,900 ex GST: ready to order. Told Ella Morris, Claire Donovan, Marco Ruiz.');
    const laptops = request('laptops');
    const override = await save('Purchase Request - PreSaveServer', decide(laptops, 'finance', 'approved', 'lachlan'), 'lachlan', [laptops]);
    expect(override.doc.requestStatusRel[0].name).toBe('Submitted');
    expect(override.doc.nextApproverRel.map((p: Doc) => p.name)).toEqual(['Anjali Desai']);
  });

  it('refuses a decision out of turn or by someone else, and can’t be approved by hand', async () => {
    const laptops = request('laptops');
    expect((await save('Purchase Request - PreSaveServer', decide(laptops, 'senior', 'approved', 'anjali'), 'anjali', [laptops])).error).toBe("It isn't the Senior manager step's turn yet.");
    expect((await save('Purchase Request - PreSaveServer', decide(laptops, 'finance', 'approved', 'noah'), 'noah', [laptops])).error).toBe('Only Lachlan Ward can decide the Finance override step.');
    expect((await save('Purchase Request - PreSaveServer', moveTo(laptops, 'Approved'), 'daniel', [laptops])).error).toBe("A request can't go from Submitted to Approved: it is approved through its approvals.");
  });

  it('starts again when a submitted request changes', async () => {
    const gens = request('generators');
    const changed = clone(gens);
    changed.lineItemsArr[0].qty = 1;
    changed.chosenQuoteRel = [];
    const { error, doc } = await save('Purchase Request - PreSaveServer', changed, 'ella', [gens]);
    expect(error).toBeUndefined();
    // One generator ($9,450) is still above $5,000: both steps, undecided.
    expect(doc.approvalChain.steps.map((s: Doc) => [s.id, s.decision])).toEqual([['manager', ''], ['senior', '']]);
    expect(doc.notesCommentsArr.some((n: Doc) => /the approvals start again/.test(n.detail))).toBe(true);
  });
});

describe('ordering, receiving and closing', () => {
  it('lets Procurement order from an approved supplier, with a PO number and a delivery date', async () => {
    const ppe = request('ppe');
    expect((await save('Purchase Request - PreSaveServer', moveTo(ppe, 'Ordered'), 'amir', [ppe])).error).toBe('Procurement raises the order.');
    expect((await save('Purchase Request - PreSaveServer', moveTo(ppe, 'Ordered'), 'marco', [ppe])).error).toBe('Say when the order is expected.');
    const { error, doc } = await save('Purchase Request - PreSaveServer', moveTo(ppe, 'Ordered', { expectedDeliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString() }), 'marco', [ppe]);
    expect(error).toBeUndefined();
    expect(doc.poNumber).toBe(ppe.requestRef.replace('PR', 'PO'));
    expect(doc.notesCommentsArr.at(-1).detail).toMatch(/^\*\*Ordered\*\* from Coastline PPE: PO-\d+, expected /);
  });

  it('closes with the invoice: over tolerance needs a reason, and only Finance closes', async () => {
    const survey = request('survey');
    expect((await save('Purchase Request - PreSaveServer', moveTo(survey, 'Closed'), 'jess', [survey])).error).toBe('Finance closes a request once the invoice is in.');
    expect((await save('Purchase Request - PreSaveServer', moveTo(survey, 'Closed'), 'mia', [survey])).error).toBe('The invoice is $1,056 (10%) over the approved $10,560: say why before closing.');
    const { error, doc } = await save('Purchase Request - PreSaveServer', moveTo(survey, 'Closed', { varianceReason: 'A fifth week of hire, agreed by Jess.' }), 'mia', [survey]);
    expect(error).toBeUndefined();
    expect([doc.matchResult, doc.invoiceExGstNum, doc.invoiceVariancePct]).toEqual(['Over tolerance', 10560, 10]);
  });

  it('recounts the cost centre after a save', async () => {
    const ppe = request('ppe');
    const { ntf, calls } = context(rs('Purchase Request - PostSave'), ppe, 'amir');
    await runAll(rs('Purchase Request - PostSave'), ntf);
    const [id, change] = calls.update.at(-1)!;
    expect(id).toBe(ppe.costCentreRel[0].documentId);
    const centre = docs.find((d) => d.documentId === id)!;
    expect([change.spentNum, change.committedNum, change.remainingNum]).toEqual([centre.spentNum, centre.committedNum, centre.remainingNum]);
  });
});

describe('quotes', () => {
  it('need a supplier that isn’t blocked and an amount', async () => {
    const q = clone(records('quote')[0]);
    expect((await save('Quote - PreSaveServer', clone(q), 'marco')).error).toBeUndefined();
    expect((await save('Quote - PreSaveServer', { ...clone(q), amountNum: 0 }, 'marco')).error).toBe('Enter the quoted amount, ex GST.');
    expect((await save('Quote - PreSaveServer', { ...clone(q), supplierRel: [{ documentId: 'x', name: 'Discount Imports Direct', blockedBool: true }] }, 'marco')).error).toBe("Discount Imports Direct is blocked: its quotes can't be used.");
  });
});

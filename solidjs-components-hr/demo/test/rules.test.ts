// The HR rulesets, evaluated from the DSL the seed writes (as fieldtec-web would), against the seed's
// own records and the cases each rule exists for. The server's searches are answered from the seed
// with the shared mock Elasticsearch matcher; updates are recorded. demo/test/e2e.mjs runs the same
// rules on the real server.
import { describe, expect, it } from 'vitest';
import { matches, sortDocs } from '@solidjs-components/testing';
// @ts-expect-error: plain ES module without types
import { buildDemo } from '../lib/build.mjs';
// @ts-expect-error: plain ES module without types
import { KEYS, ROLES } from '../lib/model.mjs';

type Doc = Record<string, any>;
type Ruleset = Record<string, any> & { lib: Record<string, any>; name: string };

const NOW = new Date();
const demo = buildDemo({ now: NOW, platform: false }) as { documents: Doc[]; seedFacts: Doc };
const facts = demo.seedFacts;
const docs = demo.documents;
const records = (kind: string) => docs.filter((d) => d.systemHeader.systemType === 'document' && d.appTags?.[0] === 'hr' && d.appTags[1] === kind);
const evaluate = (dsl: string): Ruleset => new Function(`return ${dsl.replace('#include "JayRule Ruleset Overlay JS",', '')}`)().ruleset;
const rulesets: Record<string, Ruleset> = Object.fromEntries(docs.filter((d) => d.systemHeader.systemType === 'ruleset' && d.ruleSetGroup === 'hr').map((d) => [d.name, evaluate(d.ruleSetDSL)]));
const rs = (name: string) => rulesets[`HR ${name}`];
const clone = <T>(value: T): T => structuredClone(value);
const account = (key: string) => facts.people[key].account as Doc;
const leaveOf = (key: string, status?: string) => clone(records('leave').find((d) => d.employeeRel[0].documentId === account(key).documentId && (!status || d.leaveStatusRel[0].name === status))!);
const value = (kind: string, name: string) => facts.values[kind]?.[name] ?? facts.statuses[kind][name];
const lib = rs('Leave - PreSaveServer').lib;
const dayStartOf = (key: string) => lib.dayStart(key, lib.zone);
const nextWorkDay = (from: string, skip = 0) => {
  let k = from;
  let n = -1;
  for (;;) {
    if (lib.workingDays({ first: k, last: k, holidays: lib.holidays }).days) n++;
    if (n >= skip) return k;
    k = new Date(Date.parse(`${k}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
};

/** A fake rule context for a person (by key): searches answered from the seed, updates recorded. */
function context(ruleset: Ruleset, document: Doc, key: string, extra: Doc[] = []) {
  const me = account(key);
  const keys = (ROLES[me.accountType] as string[]).map((k) => ({ keyId: KEYS[k], rights: ['Read', 'Update'] }));
  const calls: { search: Doc[]; update: [string, Doc][] } = { search: [], update: [] };
  const all = [...extra, ...docs.filter((d) => !extra.some((x) => x.documentId === d.documentId))];
  const ntf: Record<string, any> = {
    document,
    ruleset,
    userId: me.documentId,
    isNew: !document.lastStatus,
    context: { eventName: 'PreSave', user: me, accountControl: { accessKeys: keys } },
    logger: { error: (m: string) => console.error(m), info: () => {} },
    scope: {
      findDocumentsByElastic(query: Doc, _user: string, cb: (err: unknown, result: unknown) => void) {
        calls.search.push(query);
        const hits = sortDocs(all.filter((d) => d.systemHeader?.currentVersion !== false && matches(d, query.query)), query.sort).slice(0, query.size ?? 10);
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
/** Runs every rule of a ruleset in order, as JayRule does (keys starting with "rule"; async ones with a callback). */
async function runAll(ruleset: Ruleset, ntf: Record<string, any>) {
  for (const name of Object.keys(ruleset).filter((k) => k.startsWith('rule'))) {
    const rule = ruleset[name];
    const condition = typeof rule.ruleCondition === 'function' ? rule.ruleCondition(ntf) : rule.ruleCondition;
    if (!condition) continue;
    if (rule.ruleAction.length > 1) await new Promise<void>((resolve) => rule.ruleAction(ntf, ntf.lib?.once ? ntf.lib.once(ntf, resolve) : resolve));
    else rule.ruleAction(ntf);
  }
}
/** Saves a document through a server ruleset as someone; the saved version is what the seed holds. */
async function save(name: string, document: Doc, key: string, extra: Doc[] = []) {
  const { ntf, calls } = context(rs(name), document, key, extra);
  await runAll(rs(name), ntf);
  return { error: ntf.errorMessage as string | undefined, doc: ntf.document, calls, ntf };
}
const newLeave = (key: string, type: string, first: string, last: string, extra: Doc = {}) => ({
  documentId: `new-${key}-${first}`,
  systemHeader: { templateId: 'leave', systemType: 'document' },
  appTags: ['hr', 'leave'],
  employeeRel: [{ ...account(key), name: account(key).systemHeader.summaryName }],
  leaveTypeRel: [value('leaveType', type)],
  leaveStatusRel: [value('leaveStatus', 'Pending')],
  startDate: dayStartOf(first),
  endDate: dayStartOf(last),
  ...extra,
});
const decide = (d: Doc, stepId: string, decision: 'approved' | 'rejected', by: string, comment = '') => {
  const next = clone(d);
  const step = next.approvalChain.steps.find((s: Doc) => s.id === stepId);
  step.decision = decision;
  step.decidedBy = { documentId: account(by).documentId, name: account(by).systemHeader.summaryName };
  step.comment = comment;
  return next;
};

describe('the rulesets', () => {
  it('all ten evaluate, each with the shared helpers, the logic and the validators', () => {
    expect(Object.keys(rulesets).sort()).toEqual(
      ['Certificate - Client', 'Certificate - PreSaveServer', 'Expiry Check - PostSave', 'Expiry Check - PreSaveServer', 'Leave - Client', 'Leave - PostSave', 'Leave - PreSaveServer', 'Onboarding - Client', 'Onboarding - PostSave', 'Onboarding - PreSaveServer'].map((n) => `HR ${n}`),
    );
    for (const ruleset of Object.values(rulesets)) {
      for (const fn of ['once', 'guard', 'transition', 'workingDays', 'dayStart', 'approvalProblems', 'leaveBalance', 'staffingBreaches', 'certState', 'checklistOutcome', 'validateLeave', 'validateOnboarding']) {
        expect(typeof ruleset.lib[fn], `${ruleset.name}: ${fn}`).toBe('function');
      }
    }
  });

  it('accept every seeded leave request saved again as it is, and agree with what the seed derived', async () => {
    for (const leave of records('leave')) {
      const key = Object.keys(facts.people).find((k) => account(k).documentId === leave.employeeRel[0].documentId)!;
      const { error, doc } = await save('Leave - PreSaveServer', clone(leave), key);
      expect(error, `${leave.leaveRef} ${leave.periodText}`).toBeUndefined();
      expect(JSON.stringify([doc.daysNum, doc.periodText, doc.leaveStatusRel[0].name, doc.approvalState, doc.nextApproverIds]), leave.leaveRef).toEqual(JSON.stringify([leave.daysNum, leave.periodText, leave.leaveStatusRel[0].name, leave.approvalState, leave.nextApproverIds]));
      expect(doc.approvalChain.steps.map((s: Doc) => [s.id, s.decision]), leave.leaveRef).toEqual(leave.approvalChain.steps.map((s: Doc) => [s.id, s.decision]));
    }
  });
});

describe('leave requests', () => {
  const monday = facts.monday as string;
  const later = (weeks: number, day = 0) => new Date(Date.parse(`${monday}T00:00:00Z`) + (weeks * 7 + day) * 86_400_000).toISOString().slice(0, 10);

  it('go to the line manager, with the days counted and the period described', async () => {
    const first = nextWorkDay(later(8));
    const last = nextWorkDay(first, 2);
    const { error, doc } = await save('Leave - PreSaveServer', newLeave('emma', 'Annual leave', first, last), 'emma');
    expect(error).toBeUndefined();
    expect(doc.daysNum).toBe(3);
    expect(doc.approvalChain.steps.map((s: Doc) => [s.id, s.approvers.map((a: Doc) => a.name)])).toEqual([['manager', ['Raj Malhotra']]]);
    expect(doc.nextApproverIds).toEqual([account('raj').documentId]);
    expect(doc.notesCommentsArr.at(-1).detail).toMatch(/^Requested 3 days of annual leave, .+ Waiting for Raj Malhotra \(Line manager\)\. Told Raj Malhotra\.$/);
    expect(typeof doc.balanceAtStartNum).toBe('number');
  });

  it('need a second approver when the team would be below its minimum', async () => {
    // James on Ahmed's days next week: Lucy, Mei and Ahmed are already away.
    const ahmed = leaveOf('ahmed', 'Pending');
    const { error, doc } = await save('Leave - PreSaveServer', newLeave('james', 'Annual leave', ahmed.firstDay, ahmed.firstDay), 'james');
    expect(error).toBeUndefined();
    expect(doc.staffingBreachBool).toBe(true);
    expect(doc.approvalChain.steps.map((s: Doc) => [s.id, s.approvers.map((a: Doc) => a.name)])).toEqual([['manager', ['Sarah Mitchell']], ['second', ['David Chen']]]);
    expect(doc.staffingNote).toMatch(/^Parramatta Nursing would have 2 of 6 on .+, below its minimum of 4\.$/);
  });

  it('can’t take more than the balance, overlap other leave, or fall only on weekends', async () => {
    const first = nextWorkDay(later(9));
    const long = await save('Leave - PreSaveServer', newLeave('ryan', 'Annual leave', first, nextWorkDay(first, 39)), 'ryan');
    expect(long.error).toMatch(/^That is 40 days of annual leave, but you will have [\d.]+ days on .+\.$/);
    const lucy = clone(records('leave').find((d) => d.employeeRel[0].name === 'Lucy Hart' && d.leaveStatusRel[0].name === 'Approved' && d.firstDay > facts.today)!);
    const overlap = await save('Leave - PreSaveServer', newLeave('lucy', 'Annual leave', lucy.firstDay, lucy.firstDay), 'lucy');
    expect(overlap.error).toMatch(/^You already have leave on those days \(LV-\d+, /);
    const saturday = later(10, 5);
    const weekend = await save('Leave - PreSaveServer', newLeave('emma', 'Annual leave', saturday, later(10, 6)), 'emma');
    expect(weekend.error).toBe('These days are all weekends or public holidays: there is no leave to take.');
  });

  it('ask for what each type needs: evidence, a reason, at most so many days', async () => {
    const first = nextWorkDay(later(11));
    const sick = await save('Leave - PreSaveServer', newLeave('ben', "Personal/carer's leave", first, nextWorkDay(first, 2)), 'ben');
    expect(sick.error).toBe("Attach a medical certificate or statutory declaration: it is needed for more than 2 days of personal/carer's leave.");
    const withEvidence = await save('Leave - PreSaveServer', newLeave('ben', "Personal/carer's leave", first, nextWorkDay(first, 2), { evidenceArr: [{ fileNo: 'f1', fileName: 'cert.pdf' }] }), 'ben');
    expect(withEvidence.error).toBeUndefined();
    const sad = await save('Leave - PreSaveServer', newLeave('ben', 'Compassionate leave', first, nextWorkDay(first, 2), { reason: 'Funeral' }), 'ben');
    expect(sad.error).toBe('Compassionate leave is up to 2 days at a time.');
    const unpaid = await save('Leave - PreSaveServer', newLeave('ben', 'Leave without pay', first, first), 'ben');
    expect(unpaid.error).toBe('Say what the leave without pay is for.');
    const unpaidOk = await save('Leave - PreSaveServer', newLeave('ben', 'Leave without pay', first, first, { reason: 'Moving interstate' }), 'ben');
    expect(unpaidOk.doc.approvalChain.steps.map((s: Doc) => s.id)).toEqual(['manager', 'hr']);
  });

  it('are only asked for by the person, their manager or People & Culture', async () => {
    const first = nextWorkDay(later(12));
    expect((await save('Leave - PreSaveServer', newLeave('emma', 'Annual leave', first, first), 'ben')).error).toBe('You can only request leave for yourself.');
    expect((await save('Leave - PreSaveServer', newLeave('emma', 'Annual leave', first, first), 'tom')).error).toBeUndefined();
  });
});

describe('approvals', () => {
  it('approve when the approver decides, and say so', async () => {
    const mei = leaveOf('mei', 'Pending');
    const { error, doc, ntf } = await save('Leave - PreSaveServer', decide(mei, 'manager', 'approved', 'sarah', 'Covered.'), 'sarah', [mei]);
    expect(error).toBeUndefined();
    expect(doc.leaveStatusRel[0].name).toBe('Approved');
    expect(doc.approvalState).toBe('approved');
    expect(doc.nextApproverIds).toEqual([]);
    expect(doc.approvalChain.steps[0].decidedBy.documentId).toBe(account('sarah').documentId);
    expect(doc.notesCommentsArr.slice(-2).map((n: Doc) => n.detail)).toEqual([
      '**Approved** by Sarah Mitchell (Line manager): Covered.',
      expect.stringMatching(/^\*\*Approved\*\*: 3 days of annual leave, .+\. Mei Lin has been told\.$/),
    ]);
    expect(ntf.document.lastStatus).toBe('Approved');
  });

  it('refuse a decision by someone else, out of turn, or a rejection without a reason', async () => {
    const mei = leaveOf('mei', 'Pending');
    expect((await save('Leave - PreSaveServer', decide(mei, 'manager', 'approved', 'james'), 'james', [mei])).error).toBe('Only Sarah Mitchell can decide the Line manager step.');
    expect((await save('Leave - PreSaveServer', decide(mei, 'manager', 'rejected', 'sarah'), 'sarah', [mei])).error).toBe('Say why you are rejecting it.');
    const ahmed = leaveOf('ahmed', 'Pending');
    expect((await save('Leave - PreSaveServer', decide(ahmed, 'second', 'approved', 'david'), 'david', [ahmed])).error).toBeUndefined();
    const fresh = leaveOf('james', 'Pending');
    const early = clone(fresh);
    early.approvalChain.steps.push({ id: 'second', label: 'Second approver', approvers: [{ documentId: account('james').documentId, name: 'James Okoro' }], decision: 'approved' });
    // A step the rules didn't plan, approved by the person on leave: refused.
    expect((await save('Leave - PreSaveServer', early, 'james', [fresh])).error).toBe("It isn't the Second approver step's turn yet.");
  });

  it('can’t be moved to Approved by hand', async () => {
    const mei = leaveOf('mei', 'Pending');
    mei.leaveStatusRel = [value('leaveStatus', 'Approved')];
    expect((await save('Leave - PreSaveServer', mei, 'sarah', [mei])).error).toBe("A leave request can't go from Pending to Approved: it is approved through its approvals.");
  });

  it('let a delegate decide, and the second approver finish the chain', async () => {
    const sofia = leaveOf('sofia', 'Pending');
    expect(sofia.approvalChain.steps[0].delegate.name).toBe('Sarah Mitchell');
    const delegated = await save('Leave - PreSaveServer', decide(sofia, 'manager', 'approved', 'sarah'), 'sarah', [sofia]);
    expect(delegated.error).toBeUndefined();
    expect(delegated.doc.leaveStatusRel[0].name).toBe('Approved');
    const ahmed = leaveOf('ahmed', 'Pending');
    expect(ahmed.approvalChain.steps.map((s: Doc) => s.decision)).toEqual(['approved', '']);
    const second = await save('Leave - PreSaveServer', decide(ahmed, 'second', 'approved', 'david'), 'david', [ahmed]);
    expect(second.doc.leaveStatusRel[0].name).toBe('Approved');
  });

  it('reject with the reason, and start again when the dates change', async () => {
    const mei = leaveOf('mei', 'Pending');
    const rejected = await save('Leave - PreSaveServer', decide(mei, 'manager', 'rejected', 'sarah', 'Too many away that week.'), 'sarah', [mei]);
    expect(rejected.doc.leaveStatusRel[0].name).toBe('Rejected');
    const ahmed = leaveOf('ahmed', 'Pending');
    const moved = clone(ahmed);
    moved.startDate = moved.endDate;
    const restarted = await save('Leave - PreSaveServer', moved, 'ahmed', [ahmed]);
    expect(restarted.error).toBeUndefined();
    expect(restarted.doc.approvalChain.steps.every((s: Doc) => !s.decision)).toBe(true);
    expect(restarted.doc.notesCommentsArr.some((n: Doc) => /the approvals start again/.test(n.detail))).toBe(true);
  });
});

describe('cancelling', () => {
  it('lets the person cancel approved leave that hasn’t started, with a reason; approved leave can’t be changed', async () => {
    const lucy = clone(records('leave').find((d) => d.employeeRel[0].name === 'Lucy Hart' && d.leaveStatusRel[0].name === 'Approved' && d.firstDay > facts.today)!);
    const cancel = { ...clone(lucy), leaveStatusRel: [value('leaveStatus', 'Cancelled')] };
    expect((await save('Leave - PreSaveServer', clone(cancel), 'lucy', [lucy])).error).toBe('Say why the approved leave is cancelled.');
    const ok = await save('Leave - PreSaveServer', { ...clone(cancel), cancelReason: 'Wedding postponed.' }, 'lucy', [lucy]);
    expect(ok.error).toBeUndefined();
    expect(ok.doc.notesCommentsArr.at(-1).detail).toBe('**Cancelled** by Lucy Hart: Wedding postponed.');
    const moved = { ...clone(lucy), endDate: lucy.startDate };
    expect((await save('Leave - PreSaveServer', moved, 'lucy', [lucy])).error).toBe("Approved leave can't be changed: cancel it and make a new request.");
    const oliver = leaveOf('oliver', 'Approved');
    const started = { ...clone(oliver), leaveStatusRel: [value('leaveStatus', 'Cancelled')], cancelReason: 'Better.' };
    expect((await save('Leave - PreSaveServer', started, 'oliver', [oliver])).error).toBe('This leave has started: ask your manager or People & Culture to cancel it.');
    expect((await save('Leave - PreSaveServer', clone(started), 'hannah', [oliver])).error).toBeUndefined();
  });
});

describe('balances', () => {
  it('are recounted on the person’s account after a save', async () => {
    const mei = leaveOf('mei', 'Pending');
    const { ntf, calls } = context(rs('Leave - PostSave'), mei, 'mei');
    await runAll(rs('Leave - PostSave'), ntf);
    const [id, change] = calls.update.at(-1)!;
    expect(id).toBe(account('mei').documentId);
    expect(change.annualAvailableNum).toBe(account('mei').annualAvailableNum);
    expect(Object.keys(change.leaveBalances)).toEqual(['annual', 'personal', 'longService']);
  });
});

describe('certificates', () => {
  it('tell the holder and their manager once when one is expiring', async () => {
    const valid = clone(records('certificate').find((c) => c.certState === 'Valid' && c.certTypeRel[0].validityMonthsNum && !c.supersededBool)!);
    const soon = { ...valid, expiryDate: new Date(Date.now() + 10 * 86_400_000).toISOString(), expiryNotifiedBool: false, notifiedRel: [], notesCommentsArr: [] };
    const person = Object.keys(facts.people).find((k) => account(k).documentId === valid.personRel[0].documentId)!;
    const { error, doc } = await save('Certificate - PreSaveServer', soon, 'nadia');
    expect(error).toBeUndefined();
    expect(doc.certState).toBe('Expiring');
    expect(doc.notifiedRel.map((p: Doc) => p.name)).toEqual([account(person).systemHeader.summaryName, account(person).managerRel[0].name]);
    expect(doc.notesCommentsArr.at(-1).detail).toMatch(/expires .+\*\* \(in (9|10) days\)\. Told /);
    const again = await save('Certificate - PreSaveServer', clone(doc), 'nadia');
    expect(again.doc.notesCommentsArr).toHaveLength(1);
    const own = await save('Certificate - PreSaveServer', clone(valid), 'ben');
    expect(own.error).toBe('You can only add your own certificates.');
  });

  it('are swept by the expiry check: new expiries flagged and told once', async () => {
    const cert = clone(records('certificate').find((c) => c.certState === 'Valid' && c.expiryDate && !c.supersededBool)!);
    const lapsed = { ...cert, expiryDate: new Date(Date.now() - 86_400_000).toISOString() };
    const run = { documentId: 'check-1', expiryCheckRef: 'EXP-2', warnDaysNum: 30, appTags: ['hr', 'expiryCheck'], systemHeader: { summaryName: 'EXP-2' } };
    const { ntf, calls } = context(rs('Expiry Check - PostSave'), run, 'nadia', [lapsed]);
    await runAll(rs('Expiry Check - PostSave'), ntf);
    const flagged = calls.update.find(([id]) => id === cert.documentId)![1];
    expect(flagged.certState).toBe('Expired');
    expect(flagged.expiryNotifiedBool).toBe(true);
    const summary = calls.update.find(([id]) => id === 'check-1')![1];
    expect(summary.notifiedNum).toBe(1);
    expect(summary.summary).toMatch(/^Flagged 1 certificate and told [12] (person|people) /);
    const pre = await save('Expiry Check - PreSaveServer', clone(run), 'james');
    expect(pre.error).toBe('People & Culture runs the certificate expiry check.');
  });
});

describe('onboarding', () => {
  it('can’t complete with tasks left or certificates missing', async () => {
    const chloe = clone(records('onboarding').find((o) => o.personRel[0].name === 'Chloe Brennan')!);
    const done = { ...chloe, onboardingStatusRel: [value('onboardingStatus', 'Completed')] };
    expect((await save('Onboarding - PreSaveServer', clone(done), 'sarah')).error).toMatch(/^Finish the required tasks first: Medication competency assessed; One-month check-in with manager\.$/);
    const tasksDone = { ...clone(done), tasks: chloe.tasks.map((t: Doc) => ({ ...t, result: 'pass' })) };
    expect((await save('Onboarding - PreSaveServer', clone(tasksDone), 'sarah')).error).toBe('They still need Medication administration for their position.');
    const liam = clone(records('onboarding').find((o) => o.personRel[0].name === 'Liam Doyle')!);
    const { error, doc } = await save('Onboarding - PreSaveServer', liam, 'grace');
    expect(error).toBeUndefined();
    expect(doc.progressNum).toBe(100);
    expect(doc.missingCerts).toEqual([]);
    expect((await save('Onboarding - PreSaveServer', { ...clone(chloe), onboardingStatusRel: [value('onboardingStatus', 'Cancelled')] }, 'chloe')).error).toBe('People & Culture or the manager moves an onboarding on.');
  });
});

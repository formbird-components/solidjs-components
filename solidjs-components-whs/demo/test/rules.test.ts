// The safety rulesets, evaluated from the DSL the seed writes (as fieldtec-web would), against the
// seed's own records and the cases each rule exists for. Server calls (search, update, create) are
// faked; demo/test/e2e.mjs runs the same rules on the real server.
import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain ES module without types
import { buildDemo } from '../lib/build.mjs';
// @ts-expect-error: plain ES module without types
import { KEYS } from '../lib/model.mjs';

type Doc = Record<string, any>;
type Ruleset = Record<string, any> & { lib: Record<string, any>; name: string };

const NOW = new Date();
const demo = buildDemo({ now: NOW, platform: false }) as { documents: Doc[] };
const records = (kind: string) => demo.documents.filter((d) => d.systemHeader.systemType === 'document' && d.appTags?.[0] === 'whs' && d.appTags[1] === kind);
const evaluate = (dsl: string): Ruleset => new Function(`return ${dsl.replace('#include "JayRule Ruleset Overlay JS",', '')}`)().ruleset;
const rulesets: Record<string, Ruleset> = Object.fromEntries(
  demo.documents.filter((d) => d.systemHeader.systemType === 'ruleset' && d.ruleSetGroup === 'whs').map((d) => [d.name, evaluate(d.ruleSetDSL)]),
);
const rs = (name: string) => rulesets[`Safety ${name}`];
const lib = rs('Incident - PreSaveServer').lib;
const clone = <T>(value: T): T => structuredClone(value);
const lookup = (kind: string, name: string) => {
  const d = demo.documents.find((x) => x.appTags?.[1] === kind && x.nameId === name);
  if (!d) throw new Error(`No ${kind} ${name}`);
  return { documentId: d.documentId, name, ...(d.color ? { color: d.color } : {}), ...(d.statusCategory ? { statusCategory: d.statusCategory, indexNum: d.indexNum } : {}), ...(d.seriousBool !== undefined ? { seriousBool: d.seriousBool } : {}), ...(d.rank ? { rank: d.rank } : {}) };
};

const ADMIN = { isWhs: true, isManager: true, isExecutive: true, isSupervisor: true, userId: 'admin' };
const WORKER = { isWhs: false, isManager: false, isExecutive: false, isSupervisor: false, userId: 'worker' };
const SUPERVISOR = { ...WORKER, isSupervisor: true, userId: 'supervisor' };
const ADVISOR = { ...WORKER, isWhs: true, userId: 'advisor' };
const MANAGER = { ...WORKER, isManager: true, isSupervisor: true, userId: 'manager' };
const EXECUTIVE = { ...WORKER, isManager: true, isExecutive: true, userId: 'executive' };

const keysOf = (who: Record<string, unknown>) =>
  (
    [
      ['isWhs', KEYS.whs],
      ['isManager', KEYS.manager],
      ['isExecutive', KEYS.executive],
      ['isSupervisor', KEYS.supervisor],
    ] as [string, string][]
  )
    .filter(([flag]) => who[flag])
    .map(([, keyId]) => ({ keyId, rights: ['Read', 'Update'] }));

/** A fake rule context: the server's scope answers searches from `found`, and records what rules ask of it. */
function context(ruleset: Ruleset, document: Doc, o: { who?: Record<string, unknown>; found?: Doc[] | ((query: Doc) => Doc[]); throwOn?: string } = {}) {
  const calls: { search: Doc[]; update: [string, Doc][]; create: [Doc, string][] } = { search: [], update: [], create: [] };
  const ntf: Record<string, any> = {
    document,
    ruleset,
    lib: ruleset.lib,
    now: Date.now(),
    userId: (o.who as { userId?: string })?.userId ?? 'admin',
    who: o.who ?? ADMIN,
    // The access keys that make whoFromKeys (the server's initialise rule) agree with `who`.
    context: { user: { systemHeader: { summaryName: 'Test User' } }, accountControl: { accessKeys: keysOf((o.who ?? ADMIN) as Record<string, unknown>) } },
    logger: { error: () => {}, info: () => {} },
    scope: {
      findDocumentsByElastic(query: Doc, _user: string, cb: (err: unknown, result: unknown) => void) {
        calls.search.push(query);
        // An answer our callback chokes on: the throw happens inside the rule's own code.
        if (o.throwOn === 'search') return cb(null, { get data() { throw new Error('boom'); } });
        const found = typeof o.found === 'function' ? o.found(query) : o.found ?? [];
        cb(null, { data: { hits: { hits: found.map((_source) => ({ _source })) } } });
      },
      updateDocument(id: string, change: Doc, _user: string, _opts: unknown, cb: (err: unknown) => void) {
        calls.update.push([id, change]);
        cb(null);
      },
      createDocumentFromTemplate(values: Doc, templateId: string, _user: string, cb: (err: unknown, doc: unknown) => void) {
        calls.create.push([values, templateId]);
        cb(null, { documentId: `new-${calls.create.length}` });
      },
    },
  };
  return { ntf, calls };
}
/** Runs one rule as JayRule would (condition, then action; async ones with the injected once()). */
async function run(ruleset: Ruleset, name: string, ntf: Record<string, any>) {
  const rule = ruleset[name];
  const condition = typeof rule.ruleCondition === 'function' ? rule.ruleCondition(ntf) : rule.ruleCondition;
  if (!condition) return false;
  if (rule.ruleAction.length > 1) await new Promise<void>((resolve) => rule.ruleAction(ntf, resolve));
  else rule.ruleAction(ntf);
  return true;
}

/** Runs every rule of a ruleset in order (JayRule runs the keys starting with "rule", in order). */
async function runAll(ruleset: Ruleset, ntf: Record<string, any>) {
  for (const key of Object.keys(ruleset).filter((k) => k.startsWith('rule'))) await run(ruleset, key, ntf);
}

describe('the rulesets', () => {
  it('all eleven evaluate, each with the shared helpers, the logic and the validators', () => {
    expect(Object.keys(rulesets).sort()).toEqual(
      [
        'Action - Client', 'Action - PostSave', 'Action - PreSaveServer', 'Hazard - Client', 'Hazard - PreSaveServer', 'Incident - Client', 'Incident - PostSave',
        'Incident - PreSaveServer', 'Inspection - Client', 'Inspection - PostSave', 'Inspection - PreSaveServer',
      ].map((n) => `Safety ${n}`),
    );
    for (const ruleset of Object.values(rulesets)) {
      for (const fn of ['once', 'guard', 'transition', 'riskRating', 'notifiable', 'causeProblems', 'checklistOutcome', 'validateIncident', 'validateAction', 'when']) {
        expect(typeof ruleset.lib[fn], `${ruleset.name}: ${fn}`).toBe('function');
      }
    }
  });

  it('check a move against the status before the save, then record it', async () => {
    const server = rs('Incident - PreSaveServer');
    const reported = clone(records('incident').find((d) => d.incidentStatusRel[0].name === 'Reported')!);
    const moving = { ...reported, incidentStatusRel: [lookup('incidentStatus', 'Under Review')], riskAssessment: { likelihood: 2, consequence: 2 } };
    const worker = context(server, clone(moving), { who: WORKER });
    await runAll(server, worker.ntf);
    expect(worker.ntf.errorMessage).toBe('A supervisor, a manager or a WHS advisor reviews a report.');
    const supervisor = context(server, clone(moving), { who: SUPERVISOR });
    await runAll(server, supervisor.ntf);
    expect(supervisor.ntf.errorMessage).toBeUndefined();
    expect(supervisor.ntf.document).toMatchObject({ lastStatus: 'Under Review', transition: { from: 'Reported', to: 'Under Review' } });
    const created = context(server, { ...clone(moving), lastStatus: undefined }, { who: WORKER });
    await runAll(server, created.ntf);
    expect(created.ntf.errorMessage).toBe('A new incident starts as Reported.');
  });

  it('route every async rule callback through lib.once', () => {
    const docs = demo.documents.filter((d) => d.ruleSetGroup === 'whs');
    for (const d of docs) {
      const asyncRules = (d.ruleSetDSL.match(/ruleAction : function \(ntf, callback\) \{\n/g) ?? []).length;
      const wrapped = (d.ruleSetDSL.match(/callback = ntf\.ruleset\.lib\.once\(ntf, callback\);/g) ?? []).length;
      expect(wrapped, d.name).toBe(asyncRules);
    }
  });

  it('turn an exception in a server callback into a failed save, once', async () => {
    const ruleset = rs('Hazard - PreSaveServer');
    const hazard = clone(records('hazard').find((h) => h.hazardStatusRel[0].name === 'Controls Pending')!);
    hazard.hazardStatusRel = [lookup('hazardStatus', 'Controlled')];
    hazard.residualRisk = { likelihood: 1, consequence: 2 };
    const { ntf } = context(ruleset, hazard, { throwOn: 'search' });
    ntf.move = { from: 'Controls Pending', to: 'Controlled' };
    let calls = 0;
    await new Promise<void>((resolve) => {
      ruleset.ruleControls.ruleAction(ntf, () => {
        calls++;
        resolve();
      });
    });
    expect(ntf.errorMessage).toBe('The Safety Hazard - PreSaveServer ruleset failed: boom');
    expect(calls).toBe(1);
  });
});

describe('the seed', () => {
  it('passes every validator, as saved', () => {
    for (const d of records('incident')) expect(lib.validateIncident(d, ADMIN), d.incidentRef).toBe('');
    for (const d of records('hazard')) expect(lib.validateHazard(d, ADMIN), d.hazardRef).toBe('');
    for (const d of records('action')) expect(lib.validateAction(d, ADMIN), d.actionRef).toBe('');
    for (const d of records('inspection')) expect(lib.validateInspection(d, ADMIN), d.inspectionRef).toBe('');
  });

  it('holds what the server rules derive from each record', async () => {
    const check = async (rulesetName: string, kind: string, fields: string[]) => {
      const ruleset = rs(rulesetName);
      for (const original of records(kind)) {
        const { ntf } = context(ruleset, clone(original));
        await run(ruleset, 'ruleDerive', ntf);
        await run(ruleset, 'ruleTransition', ntf);
        const plain = (v: unknown) => (v === undefined || v === '' ? null : v);
        for (const field of fields) expect(plain(ntf.document[field]), `${original.systemHeader.summaryName}: ${field}`).toEqual(plain(original[field]));
        expect(ntf.document.transition, original.systemHeader.summaryName).toBeNull();
      }
    };
    await check('Incident - PreSaveServer', 'incident', [
      'riskAssessment', 'riskRating', 'riskScoreNum', 'riskRatingRel', 'injuryClass', 'injuryClassLabel', 'recordableBool', 'lostTimeBool', 'notifiableBool',
      'notifiableReasons', 'bodyParts', 'investigationLevel', 'investigationLevelText', 'reportDelayHours', 'lateReportBool', 'responseDueDate', 'investigationDueDate',
    ]);
    await check('Hazard - PreSaveServer', 'hazard', ['inherentRating', 'inherentScoreNum', 'inherentRatingRel', 'residualRating', 'residualRatingRel', 'currentRating', 'currentRatingRel', 'currentRisk']);
    await check('Action - PreSaveServer', 'action', ['riskRatingRel', 'controlRankNum']);
    await check('Inspection - PreSaveServer', 'inspection', ['totalNum', 'answeredNum', 'passedNum', 'failedNum', 'naNum']);
  });

  it('tells the story the README describes', () => {
    const incidents = records('incident');
    const status = (d: Doc) => d.incidentStatusRel[0].name;
    expect(incidents.filter((d) => status(d) === 'Reported')).toHaveLength(1);
    const ammonia = incidents.find((d) => d.title.startsWith('Ammonia leak'))!;
    expect([status(ammonia), ammonia.notifiableBool, ammonia.regulatorNotifiedDate]).toEqual(['Under Review', true, undefined]);
    const scaffold = incidents.find((d) => d.title.startsWith('Fell from scaffold'))!;
    expect([status(scaffold), scaffold.injuryClass, scaffold.notifiableBool]).toEqual(['Investigating', 'LTI', true]);
    const latestLti = incidents.filter((d) => d.lostTimeBool).sort((a, b) => b.occurredDate.localeCompare(a.occurredDate))[0];
    expect(latestLti.documentId).toBe(scaffold.documentId);
    const overdueInspections = records('inspection').filter((d) => d.inspectionStatusRel[0].name === 'Scheduled' && Date.parse(d.scheduledDate) < Date.now());
    expect(overdueInspections.map((d) => d.siteRel[0].code)).toEqual(['WPK']);
  });
});

describe('incidents', () => {
  const base = () => clone(records('incident').find((d) => d.title.startsWith('Chemical splash') || d.title.startsWith('Caustic splash'))!);
  const injury = () => clone(records('incident').find((d) => d.incidentStatusRel[0].name === 'Closed' && d.riskRating === 'High' && d.incidentTypeRel[0].name === 'Injury') ?? records('incident').find((d) => d.riskRating === 'High')!);
  const withStatus = (d: Doc, from: string, to: string): Doc => ({ ...d, lastStatus: from, incidentStatusRel: [lookup('incidentStatus', to)] });

  it('start as Reported (a WHS advisor may log one straight into review)', () => {
    const d = { ...base(), lastStatus: '' };
    expect(lib.validateIncident(withStatus(d, '', 'Investigating'), ADMIN)).toBe('A new incident starts as Reported.');
    expect(lib.validateIncident(withStatus(d, '', 'Under Review'), WORKER)).toBe('A new incident starts as Reported.');
    expect(lib.validateIncident(withStatus(d, '', 'Under Review'), ADVISOR)).toBe('');
  });

  it('are triaged by a supervisor, manager or WHS advisor; investigated by WHS', () => {
    const d = base();
    expect(lib.validateIncident(withStatus(d, 'Reported', 'Under Review'), WORKER)).toMatch(/reviews a report/);
    expect(lib.validateIncident(withStatus(d, 'Reported', 'Under Review'), SUPERVISOR)).toBe('');
    expect(lib.validateIncident(withStatus({ ...d, investigatorRel: [{ documentId: 'x', name: 'X' }] }, 'Under Review', 'Investigating'), SUPERVISOR)).toMatch(/Only a WHS advisor/);
    expect(lib.validateIncident(withStatus(d, 'Reported', 'Closed'), ADMIN)).toMatch(/can't go from Reported to Closed/);
  });

  it('are signed off according to their rating', () => {
    const high = withStatus(injury(), 'Actions Pending', 'Closed');
    expect(high.riskRating).toBe('High');
    expect(lib.validateIncident(high, ADVISOR)).toBe('A High incident is signed off by a site manager or an executive.');
    expect(lib.validateIncident(high, MANAGER)).toBe('');
    const notifiableOne = withStatus(clone(records('incident').find((d) => d.notifiableBool && d.incidentStatusRel[0].name === 'Closed')!), 'Actions Pending', 'Closed');
    expect(lib.validateIncident(notifiableOne, MANAGER)).toBe('A notifiable incident is signed off by an executive.');
    expect(lib.validateIncident(notifiableOne, EXECUTIVE)).toBe('');
  });

  it("can't move past review while the regulator hasn't been told", () => {
    const ammonia = clone(records('incident').find((d) => d.title.startsWith('Ammonia leak'))!);
    const moving = withStatus({ ...ammonia, investigatorRel: [{ documentId: 'h', name: 'Hannah Cole' }] }, 'Under Review', 'Investigating');
    expect(lib.validateIncident(moving, ADVISOR)).toBe(
      'This incident is notifiable (Dangerous incident: uncontrolled escape of gas or steam). Record when the regulator was told and their reference.',
    );
    expect(lib.validateIncident({ ...moving, regulatorNotifiedDate: new Date().toISOString(), regulatorRef: 'SWN-1' }, ADVISOR)).toBe('Confirm the site was left undisturbed until an inspector released it.');
    expect(lib.validateIncident({ ...moving, regulatorNotifiedDate: new Date().toISOString(), regulatorRef: 'SWN-1', sitePreservedBool: true }, ADVISOR)).toBe('');
  });

  it('need a finished five whys before actions, for a full investigation', () => {
    const scaffold = clone(records('incident').find((d) => d.title.startsWith('Fell from scaffold'))!);
    const moving = { ...withStatus(scaffold, 'Investigating', 'Actions Pending'), investigationSummary: 'Found it.' };
    expect(lib.validateIncident(moving, ADVISOR)).toMatch(/^The investigation isn't finished: /);
  });

  it('check the facts of an injury', () => {
    const d = clone(records('incident').find((x) => x.title.startsWith('Fell from scaffold'))!);
    expect(lib.validateIncident({ ...d, injuryPins: [] }, ADMIN)).toBe('Mark where on the body the injury is.');
    expect(lib.validateIncident({ ...d, injuredPersonRel: [], injuredName: '' }, ADMIN)).toBe('Who was hurt? Choose the person, or type their name.');
    expect(lib.validateIncident({ ...d, occurredDate: new Date(Date.now() + 3_600_000).toISOString() }, ADMIN)).toBe("It can't have happened in the future.");
    expect(lib.validateIncident({ ...d, reportedDate: new Date(Date.parse(d.occurredDate) - 7_200_000).toISOString() }, ADMIN)).toBe("It can't have been reported before it happened.");
  });

  it("won't close while actions are open, or (for High) not yet verified", async () => {
    const ruleset = rs('Incident - PreSaveServer');
    const d = withStatus(injury(), 'Actions Pending', 'Closed');
    const actions = [
      { actionRef: 'ACT-1', actionStatusRel: [{ name: 'Verified' }] },
      { actionRef: 'ACT-2', actionStatusRel: [{ name: 'Completed' }] },
      { actionRef: 'ACT-3', actionStatusRel: [{ name: 'Cancelled' }] },
    ];
    const { ntf, calls } = context(ruleset, d, { found: actions, who: MANAGER });
    await run(ruleset, 'ruleDerive', ntf);
    expect(ntf.move).toMatchObject({ from: 'Actions Pending', to: 'Closed' });
    await run(ruleset, 'ruleActionsDone', ntf);
    expect(JSON.stringify(calls.search[0])).toContain(d.documentId);
    expect(ntf.errorMessage).toBe('1 corrective action is still open or not yet verified (ACT-2). Finish or cancel it before closing.');
  });

  it('tell more people as the rating rises, and say so in the activity', async () => {
    const ruleset = rs('Incident - PreSaveServer');
    const d = clone(records('incident').find((x) => x.incidentStatusRel[0].name === 'Reported')!);
    expect(d.riskRating).toBe('');
    d.riskAssessment = { likelihood: 3, consequence: 4 };
    const { ntf } = context(ruleset, d, { who: SUPERVISOR });
    await run(ruleset, 'ruleDerive', ntf);
    await run(ruleset, 'ruleEscalate', ntf);
    expect(d.escalationLevel).toBe('High');
    expect(d.notifiedRel.map((p: Doc) => p.name)).toEqual(['Liam Murphy', 'Hannah Cole', 'Daniel Okafor']);
    expect(d.notesCommentsArr.at(-1).detail).toMatch(/^\*\*High risk\.\*\* Told Liam Murphy \(Supervisor\), Hannah Cole \(WHS Advisor\), Daniel Okafor \(Site Manager\)\. Triage by /);
    // Up to Extreme: only the executive is new.
    d.riskAssessment = { likelihood: 5, consequence: 5 };
    const second = context(ruleset, d, { who: SUPERVISOR });
    await run(ruleset, 'ruleDerive', second.ntf);
    await run(ruleset, 'ruleEscalate', second.ntf);
    expect(d.notifiedRel.map((p: Doc) => p.name)).toEqual(['Liam Murphy', 'Hannah Cole', 'Daniel Okafor', 'Marcus Webb']);
    expect(d.notesCommentsArr.at(-1).detail).toMatch(/Told Marcus Webb \(Executive\)/);
    // Saved again unchanged: no new note.
    const notes = d.notesCommentsArr.length;
    const third = context(ruleset, d, { who: SUPERVISOR });
    await run(ruleset, 'ruleDerive', third.ntf);
    await run(ruleset, 'ruleEscalate', third.ntf);
    expect(d.notesCommentsArr).toHaveLength(notes);
  });
});

describe('hazards', () => {
  const pending = () => clone(records('hazard').find((h) => h.hazardStatusRel[0].name === 'Controls Pending' && h.inherentRating === 'High')!);
  const toControlled = (h: Doc) => ({ ...h, lastStatus: h.hazardStatusRel[0].name, hazardStatusRel: [lookup('hazardStatus', 'Controlled')] });

  it('are assessed by supervisors and signed off by WHS or a manager', () => {
    const h = clone(records('hazard').find((x) => x.hazardStatusRel[0].name === 'Reported')!);
    const assessing = { ...h, hazardStatusRel: [lookup('hazardStatus', 'Assessed')], inherentRisk: { likelihood: 3, consequence: 3 }, ownerRel: [{ documentId: 'o', name: 'O' }] };
    expect(lib.validateHazard(assessing, WORKER)).toMatch(/assesses hazards/);
    expect(lib.validateHazard(assessing, SUPERVISOR)).toBe('');
    expect(lib.validateHazard(toControlled(pending()), SUPERVISOR)).toMatch(/signs off controls/);
  });

  it("can't rate the residual risk above the inherent one, or call an Extreme residual controlled", () => {
    const h = pending();
    expect(lib.validateHazard({ ...h, residualRisk: { likelihood: 5, consequence: 5 } }, ADMIN)).toMatch(/can't be higher/);
    const extreme = { ...h, inherentRisk: { likelihood: 5, consequence: 5 }, residualRisk: { likelihood: 4, consequence: 5 } };
    expect(lib.validateHazard(toControlled(extreme), ADMIN)).toMatch(/Extreme residual risk/);
  });

  it('need their controls in place, and strong enough, to be controlled', async () => {
    const ruleset = rs('Hazard - PreSaveServer');
    const control = (status: string, level: string, ref: string) => ({ actionRef: ref, actionStatusRel: [{ name: status }], controlLevelRel: [{ name: level }] });
    const attempt = async (h: Doc, found: Doc[]) => {
      const { ntf } = context(ruleset, toControlled(h), { found, who: ADVISOR });
      await run(ruleset, 'ruleDerive', ntf);
      await run(ruleset, 'ruleControls', ntf);
      return ntf;
    };
    const h = { ...pending(), residualRisk: { likelihood: 2, consequence: 2 } };
    expect((await attempt(h, [control('Open', 'Engineering', 'ACT-5'), control('Verified', 'PPE', 'ACT-6')])).errorMessage).toBe('Some controls are not in place yet (ACT-5). Finish or cancel them first.');
    expect((await attempt(h, [control('Cancelled', 'Engineering', 'ACT-5'), control('Verified', 'PPE', 'ACT-6')])).errorMessage).toMatch(/needs a control at Engineering or above/);
    expect((await attempt({ ...h, justification: 'Temporary work, a week long.' }, [control('Verified', 'PPE', 'ACT-6')])).errorMessage).toBeUndefined();
    const done = await attempt(h, [control('Completed', 'Isolate', 'ACT-7')]);
    expect(done.errorMessage).toBeUndefined();
    expect(done.document.reviewDate).toBe(lib.nextReviewDate(done.now, 'Low'));
  });
});

describe('corrective actions', () => {
  const open = () => clone(records('action').find((a) => a.actionStatusRel[0].name === 'Open' && a.sourceRel[0].riskRating === 'High')!);

  it('are due as soon as the source rating asks, unless a manager approves longer', () => {
    const a = open();
    const late = { ...a, dueDate: new Date(Date.parse(a.raisedDate) + 30 * 86_400_000).toISOString() };
    expect(lib.validateAction(late, WORKER)).toMatch(/^A High risk action is due within 7 days of being raised, by .+\. Give a reason for a later date\.$/);
    expect(lib.validateAction({ ...late, extensionReason: 'Parts on back order' }, WORKER)).toBe('A later due date needs a manager or a WHS advisor: ask one to approve it.');
    expect(lib.validateAction({ ...late, extensionReason: 'Parts on back order' }, MANAGER)).toBe('');
    expect(lib.validateAction({ ...late, extensionReason: 'Parts on back order', approvedDueDate: late.dueDate }, WORKER)).toBe('');
  });

  it('need notes, and evidence for High risks, to be completed', () => {
    const a = { ...open(), lastStatus: 'Open', actionStatusRel: [lookup('actionStatus', 'Completed')] };
    expect(lib.validateAction(a, WORKER)).toBe('Say what was done.');
    expect(lib.validateAction({ ...a, completionNotes: 'Fitted.' }, WORKER)).toBe('Attach evidence (a photo or a document) for a High risk action.');
    expect(lib.validateAction({ ...a, completionNotes: 'Fitted.', evidenceArr: [{ fileNo: 'f1', fileName: 'mirror.jpg' }] }, WORKER)).toBe('');
  });

  it('are verified by someone other than their owner', () => {
    const a: Doc = { ...open(), completionNotes: 'Done', evidenceArr: [{ fileNo: 'f1', fileName: 'done.jpg' }], lastStatus: 'Completed', actionStatusRel: [lookup('actionStatus', 'Verified')] };
    const owner = a.ownerRel[0].documentId;
    expect(lib.validateAction(a, { ...WORKER, userId: 'w' })).toMatch(/verifies/);
    expect(lib.validateAction(a, { ...MANAGER, userId: owner })).toBe('You own this action, so someone else verifies it.');
    expect(lib.validateAction(a, { ...ADVISOR, userId: 'someone-else' })).toBe('');
  });

  it('keep their source counted, and say when the last one is done', async () => {
    const ruleset = rs('Action - PostSave');
    const a: Doc = { ...open(), actionStatusRel: [lookup('actionStatus', 'Verified')], transition: { from: 'Completed', to: 'Verified' } };
    const sibling = { documentId: 'other', actionStatusRel: [{ name: 'Cancelled' }], controlLevelRel: [{ name: 'PPE' }] };
    const stale = { ...a, actionStatusRel: [{ name: 'Open' }] };
    const source = { documentId: a.sourceRel[0].documentId, incidentStatusRel: [{ name: 'Actions Pending' }], actionsOpenNum: 1, notesCommentsArr: [] };
    const { ntf, calls } = context(ruleset, a, { found: (query) => (JSON.stringify(query).includes('"documentId":') && !JSON.stringify(query).includes('sourceRel') ? [source] : [stale, sibling]) });
    await run(ruleset, 'ruleRecount', ntf);
    expect(calls.update).toHaveLength(1);
    const [id, change] = calls.update[0];
    expect(id).toBe(source.documentId);
    expect(change).toMatchObject({ actionsTotalNum: 1, actionsOpenNum: 0, actionsDoneNum: 1, actionsOverdueNum: 0 });
    expect(change.notesCommentsArr.at(-1).detail).toBe('**All 1 corrective actions are done.** Ready for sign-off.');
  });
});

describe('inspections', () => {
  const inProgress = () => clone(records('inspection').find((i) => i.inspectionStatusRel[0].name === 'In Progress')!);

  it("can't be completed with checks unanswered or failures unexplained", () => {
    const i: Doc = { ...inProgress(), lastStatus: 'In Progress', inspectionStatusRel: [lookup('inspectionStatus', 'Completed')] };
    expect(lib.validateInspection(i, WORKER)).toMatch(/^Answer every required check: /);
    const answered = i.checkItems.map((c: Doc) => ({ ...c, result: 'pass' }));
    answered[0] = { ...answered[0], result: 'fail', comment: '' };
    expect(lib.validateInspection({ ...i, checkItems: answered }, WORKER)).toBe(`Say what is wrong for each failed check: ${answered[0].question}.`);
    answered[0].comment = 'Bent upright';
    expect(lib.validateInspection({ ...i, checkItems: answered }, WORKER)).toBe('');
  });

  it('raise a hazard per failed check, once, and book the next inspection', async () => {
    const ruleset = rs('Inspection - PostSave');
    const i = inProgress();
    i.checkItems = i.checkItems.map((c: Doc, n: number) => ({ ...c, result: n < 2 ? 'fail' : 'pass', comment: n < 2 ? `Problem ${n}` : '' }));
    i.transition = { from: 'In Progress', to: 'Completed' };
    i.completedDate = new Date().toISOString();
    const existing = [{ sourceItemKey: i.checkItems[0].key }];
    const { ntf, calls } = context(ruleset, i, { found: (query) => (JSON.stringify(query).includes('"hazard"') ? existing : []) });
    await run(ruleset, 'ruleRaiseHazards', ntf);
    await run(ruleset, 'ruleNextInspection', ntf);
    expect(calls.create).toHaveLength(2);
    const [hazard] = calls.create[0];
    expect(hazard).toMatchObject({ title: i.checkItems[1].question, sourceItemKey: i.checkItems[1].key, hazardStatusRel: [{ name: 'Reported' }] });
    expect(hazard.description).toMatch(/^Problem 1\n\nRaised by INS-\d+ \(/);
    expect(hazard.hazardCategoryRel[0].name).toBeTruthy();
    const [next] = calls.create[1];
    expect(next.inspectionStatusRel[0].name).toBe('Scheduled');
    expect(Date.parse(next.scheduledDate) - Date.parse(i.completedDate)).toBe(4 * 7 * 86_400_000);
  });
});

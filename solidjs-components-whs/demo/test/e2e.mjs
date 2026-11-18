// End-to-end test of the safety rulesets on the running demo: signs in as different people, saves
// documents through fieldtec-web's API (so the PreSaveServer and PostSave rules run), and checks the
// results in MongoDB.
//
//   pnpm db:setup --reset && pnpm demo:server     # in another terminal
//   pnpm demo:e2e
//
// It WRITES to the demo database (incidents, hazards, actions, inspections) and expects a fresh
// seed, so run `pnpm db:setup --reset` before it and again afterwards.
import { connectDemo } from '@solidjs-components/platform/e2e';

const { T, DEMO_PASSWORD } = await import('../lib/model.mjs');
const { nextReviewDate } = await import('../../packages/whs-kit/src/logic/hazard.ts');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const demo = await connectDemo({ base: 'http://localhost:3002', db: 'solidjs-whs-demo', app: 'whs', password: DEMO_PASSWORD, serverLog: new URL('../server.log', import.meta.url) });
const { docs, get, named, pick, as, errorOf, waitFor, check, section } = demo;
const status = async (kind, name) => pick(await named(kind, name), { color: 'color', statusCategory: 'statusCategory', indexNum: 'indexNum' });
const lookup = async (kind, name, fields = {}) => pick(await named(kind, name), { indexNum: 'indexNum', ...fields });
const site = async (code) => {
  const d = await docs.findOne({ appTags: 'site', code, 'systemHeader.currentVersion': true, 'systemHeader.systemType': 'document' });
  return { doc: d, value: pick(d, { code: 'code', siteManagerRel: 'siteManagerRel', supervisorRel: 'supervisorRel', whsAdvisorRel: 'whsAdvisorRel', checkSheetRel: 'checkSheetRel', inspectionWeeksNum: 'inspectionWeeksNum', indexNum: 'indexNum' }) };
};
const has = (res, text) => !res.ok && res.text.includes(text);
const iso = (time) => new Date(time).toISOString();
const PIN = [{ id: 'pin-1', x: 0.62, y: 0.55, view: 'front', region: 'Left hand', kind: 'Cut', note: '' }];
const EVIDENCE = [{ fileNo: 'e2e-evidence', fileName: 'mirror-installed.jpg', fileType: 'jpg', caption: 'Mirror fitted' }];
const tree = (problem, complete) => ({
  problem,
  nodes: [{ id: 'a', text: 'The guard was removed for cleaning', children: [{ id: 'b', text: 'Cleaning needs access to the blade', children: complete ? [{ id: 'c', text: 'The machine was bought without a cleaning port', root: true, category: 'Plant and equipment' }] : [] }] }],
});

try {
  const aisha = await as('aisha'); // Worker, Wetherill Park
  const liam = await as('liam'); // Supervisor, Wetherill Park
  const hannah = await as('hannah'); // WHS Advisor
  const daniel = await as('daniel'); // Site Manager, Wetherill Park
  const marcus = await as('marcus'); // Executive
  const wpk = await site('WPK');
  const s = {
    reported: await status('incidentStatus', 'Reported'),
    review: await status('incidentStatus', 'Under Review'),
    investigating: await status('incidentStatus', 'Investigating'),
    pending: await status('incidentStatus', 'Actions Pending'),
    closed: await status('incidentStatus', 'Closed'),
  };
  const injuryType = await lookup('incidentType', 'Injury');
  const employee = await lookup('personType', 'Employee');
  const firstAid = await lookup('treatment', 'First aid');
  const medical = await lookup('treatment', 'Medical treatment');
  const laceration = await lookup('injuryNature', 'Laceration', { seriousBool: 'seriousBool' });
  const amputation = await lookup('injuryNature', 'Amputation', { seriousBool: 'seriousBool' });
  const now = Date.now();
  const report = (extra = {}) => ({
    title: 'Hand cut on the bandsaw in the maintenance bay',
    incidentTypeRel: [injuryType],
    incidentStatusRel: [s.reported],
    occurredDate: iso(now - 2 * HOUR),
    siteRel: [wpk.value],
    exactLocation: 'Maintenance bay',
    description: 'Cleaning the bandsaw with the guard off; the blade cut the left hand.',
    reportedByRel: [aisha.person],
    personTypeRel: [employee],
    injuredPersonRel: [aisha.person],
    injuryPins: PIN,
    injuryNatureRel: [laceration],
    treatmentRel: [firstAid],
    ...extra,
  });

  section('Reporting an incident');
  let res = await aisha.insert(T.incident, 'incident', report({ incidentStatusRel: [s.review] }));
  check('a new incident starts as Reported', has(res, 'A new incident starts as Reported.'), errorOf(res));
  res = await aisha.insert(T.incident, 'incident', report({ injuryPins: [] }));
  check('an injury needs its place on the body', has(res, 'Mark where on the body the injury is.'), errorOf(res));
  res = await aisha.insert(T.incident, 'incident', report({ occurredDate: iso(now + 3 * HOUR) }));
  check("it can't have happened in the future", has(res, "It can't have happened in the future."), errorOf(res));
  res = await aisha.insert(T.incident, 'incident', report());
  const incidentId = res.json?.documentId;
  let incident = incidentId && (await get(incidentId));
  check('a worker reports an injury: numbered, reported now, not yet rated', res.ok && /^INC-\d+$/.test(incident.incidentRef) && incident.reportedDate && incident.riskRating === '' && incident.injuryClass === 'FAI' && incident.lastStatus === 'Reported', `${res.status} ${res.text}`);
  check('the body map gives the body parts', JSON.stringify(incident?.bodyParts) === '["Left hand"]', JSON.stringify(incident?.bodyParts));

  section('Triage');
  res = await aisha.update(incidentId, { incidentStatusRel: [s.review] });
  check('a worker can\'t review their own report', has(res, 'A supervisor, a manager or a WHS advisor reviews a report.'), errorOf(res));
  res = await liam.update(incidentId, { incidentStatusRel: [s.review] });
  check('reviewing needs a risk rating', has(res, 'Rate the risk (likelihood and consequence) to review the incident.'), errorOf(res));
  res = await liam.update(incidentId, { incidentStatusRel: [s.review], riskAssessment: { likelihood: 3, consequence: 4 }, treatmentRel: [medical] });
  incident = await get(incidentId);
  check('the supervisor rates it High: rating, colour and score kept', res.ok && incident.riskRating === 'High' && incident.riskScoreNum === 12 && incident.riskRatingRel[0]?.color && incident.injuryClass === 'MTI' && incident.recordableBool === true, `${res.status} ${errorOf(res)} ${incident?.riskRating}`);
  const told = (incident?.notifiedRel ?? []).map((p) => p.name);
  check('High: the supervisor, WHS advisor and site manager are told', JSON.stringify(told) === JSON.stringify(['Liam Murphy', 'Hannah Cole', 'Daniel Okafor']), JSON.stringify(told));
  const note = incident?.notesCommentsArr?.at(-1)?.detail ?? '';
  check('…and the activity says so, with the triage deadline', note.startsWith('**High risk.** Told Liam Murphy (Supervisor), Hannah Cole (WHS Advisor), Daniel Okafor (Site Manager). Triage by'), note);
  check('the response is due 4 hours after the report', Math.abs(Date.parse(incident.responseDueDate) - Date.parse(incident.reportedDate) - 4 * HOUR) < 1000, `${incident.reportedDate} ${incident.responseDueDate}`);
  res = await liam.update(incidentId, { injuryNatureRel: [laceration, amputation] });
  incident = await get(incidentId);
  check('an amputation makes it notifiable, and the executive is told', res.ok && incident.notifiableBool === true && incident.notifiableReasons?.[0] === 'Serious injury: amputation' && incident.notifiedRel.some((p) => p.name === 'Marcus Webb') && incident.notesCommentsArr.at(-1).detail.includes('**Notifiable**'), `${res.status} ${errorOf(res)} ${JSON.stringify(incident?.notifiableReasons)}`);

  section('Investigation');
  res = await liam.update(incidentId, { incidentStatusRel: [s.investigating], investigatorRel: [hannah.person] });
  check('only a WHS advisor starts an investigation', has(res, 'Only a WHS advisor can move an incident to Investigating.'), errorOf(res));
  res = await hannah.update(incidentId, { incidentStatusRel: [s.investigating], investigatorRel: [hannah.person] });
  check('a notifiable incident needs the regulator told first', has(res, 'This incident is notifiable (Serious injury: amputation). Record when the regulator was told and their reference.'), errorOf(res));
  res = await hannah.update(incidentId, { incidentStatusRel: [s.investigating], investigatorRel: [hannah.person], regulatorNotifiedDate: iso(now - HOUR), regulatorRef: 'SWN-424242', sitePreservedBool: true });
  incident = await get(incidentId);
  check('with the regulator told, the investigation starts (full, due in 14 days)', res.ok && incident.investigationLevel === 'full' && Math.abs(Date.parse(incident.investigationDueDate) - Date.parse(incident.occurredDate) - 14 * DAY) < 1000, `${res.status} ${errorOf(res)} ${incident?.investigationLevel}`);
  res = await hannah.update(incidentId, { incidentStatusRel: [s.pending], rootCauseTree: tree('Hand cut on the bandsaw', false), investigationSummary: 'Guard off for cleaning.' });
  check('actions wait for a finished five whys', has(res, "The investigation isn't finished: Mark at least one answer as a root cause."), errorOf(res));
  res = await hannah.update(incidentId, { incidentStatusRel: [s.pending], rootCauseTree: tree('Hand cut on the bandsaw', true), investigationSummary: 'Guard off for cleaning; no cleaning port.' });
  check('a finished five whys moves it to Actions Pending', res.ok, errorOf(res));

  section('Corrective actions');
  incident = await get(incidentId);
  const engineering = await lookup('controlLevel', 'Engineering', { rank: 'rank' });
  const ppe = await lookup('controlLevel', 'PPE', { rank: 'rank' });
  const open = await status('actionStatus', 'Open');
  const source = [{ documentId: incidentId, name: incident.systemHeader.summaryName, ref: incident.incidentRef, kind: 'incident', riskRating: 'High' }];
  const raised = iso(Date.now());
  const action = (extra = {}) => ({ title: 'Fit a cleaning port and an interlocked guard', sourceRel: source, controlLevelRel: [engineering], ownerRel: [daniel.person], raisedDate: raised, actionStatusRel: [open], dueDate: iso(Date.now() + 5 * DAY), ...extra });
  res = await hannah.insert(T.action, 'action', action({ dueDate: iso(Date.now() + 30 * DAY) }));
  check('a High action is due within 7 days unless there is a reason', has(res, 'A High risk action is due within 7 days of being raised'), errorOf(res));
  res = await hannah.insert(T.action, 'action', action());
  const actionId = res.json?.documentId;
  let act = actionId && (await get(actionId));
  check('the action is raised: numbered, prioritised by its source', res.ok && /^ACT-\d+$/.test(act.actionRef) && act.riskRatingRel?.[0]?.name === 'High' && act.controlRankNum === 4, `${res.status} ${res.text}`);
  check('its incident counts it', !!(await waitFor(async () => (await get(incidentId)).actionsOpenNum === 1)), JSON.stringify(await get(incidentId).then((d) => [d.actionsTotalNum, d.actionsOpenNum])));
  res = await marcus.update(incidentId, { incidentStatusRel: [s.closed] });
  check("the incident can't close while the action is open", has(res, 'corrective action is still open or not yet verified (' + act.actionRef + ')'), errorOf(res));
  const completed = await status('actionStatus', 'Completed');
  res = await daniel.update(actionId, { actionStatusRel: [completed] });
  check('completing needs notes', has(res, 'Say what was done.'), errorOf(res));
  res = await daniel.update(actionId, { actionStatusRel: [completed], completionNotes: 'Port fitted; interlock tested.' });
  check('…and evidence, for a High risk', has(res, 'Attach evidence (a photo or a document) for a High risk action.'), errorOf(res));
  res = await daniel.update(actionId, { actionStatusRel: [completed], completionNotes: 'Port fitted; interlock tested.', evidenceArr: EVIDENCE });
  act = await get(actionId);
  check('with evidence it is completed, and dated', res.ok && act.completedDate && act.lastStatus === 'Completed', errorOf(res));
  res = await marcus.update(incidentId, { incidentStatusRel: [s.closed] });
  check('a High incident waits for its actions to be verified', has(res, 'still open or not yet verified'), errorOf(res));
  const verified = await status('actionStatus', 'Verified');
  res = await daniel.update(actionId, { actionStatusRel: [verified] });
  check("the owner can't verify their own action", has(res, 'You own this action, so someone else verifies it.'), errorOf(res));
  res = await hannah.update(actionId, { actionStatusRel: [verified], verificationNotes: 'Checked on site.' });
  act = await get(actionId);
  check('the WHS advisor verifies it', res.ok && act.verifiedByRel?.[0]?.name === 'Hannah Cole' && act.verifiedDate, errorOf(res));
  const ready = await waitFor(async () => {
    const d = await get(incidentId);
    return d.actionsOpenNum === 0 && d.notesCommentsArr.at(-1)?.detail.startsWith('**All 1 corrective actions are done.**') && d;
  });
  check('the incident hears that all its actions are done', !!ready, JSON.stringify((await get(incidentId)).notesCommentsArr.at(-1)));

  section('Sign-off');
  res = await hannah.update(incidentId, { incidentStatusRel: [s.closed] });
  check('a notifiable incident is not closed by the WHS advisor…', has(res, 'A notifiable incident is signed off by an executive.'), errorOf(res));
  res = await daniel.update(incidentId, { incidentStatusRel: [s.closed] });
  check('…nor the site manager…', has(res, 'A notifiable incident is signed off by an executive.'), errorOf(res));
  res = await marcus.update(incidentId, { incidentStatusRel: [s.closed], closureNotes: 'Guard redesigned; operators retrained.' });
  incident = await get(incidentId);
  check('…but by an executive, who is recorded', res.ok && incident.closedByRel?.[0]?.name === 'Marcus Webb' && incident.closedDate, errorOf(res));
  const siteAfter = await get(wpk.doc.documentId);
  check("the site's latest incident is this one", demo.sameSecond(siteAfter.lastIncidentDate, incident.occurredDate), `${siteAfter.lastIncidentDate} ${incident.occurredDate}`);

  section('Hazards');
  const h = {
    reported: await status('hazardStatus', 'Reported'),
    assessed: await status('hazardStatus', 'Assessed'),
    pending: await status('hazardStatus', 'Controls Pending'),
    controlled: await status('hazardStatus', 'Controlled'),
  };
  const manualHandling = await lookup('hazardCategory', 'Manual handling');
  res = await aisha.insert(T.hazard, 'hazard', { title: 'Heavy drums lifted by hand at the wash bay', hazardCategoryRel: [manualHandling], siteRel: [wpk.value], description: 'Drums of 40 kg are lifted onto the wash rack by hand.', reportedByRel: [aisha.person], hazardStatusRel: [h.reported] });
  const hazardId = res.json?.documentId;
  let hazard = hazardId && (await get(hazardId));
  check('a worker reports a hazard', res.ok && /^HAZ-\d+$/.test(hazard.hazardRef) && hazard.currentRating === '', `${res.status} ${res.text}`);
  const assessment = { hazardStatusRel: [h.assessed], inherentRisk: { likelihood: 4, consequence: 3 }, ownerRel: [daniel.person] };
  res = await aisha.update(hazardId, assessment);
  check("a worker can't assess it", has(res, 'A supervisor, a manager or a WHS advisor assesses hazards.'), errorOf(res));
  res = await liam.update(hazardId, assessment);
  hazard = await get(hazardId);
  check('the supervisor assesses it High', res.ok && hazard.inherentRating === 'High' && hazard.currentRating === 'High' && hazard.currentRatingRel?.[0]?.name === 'High', errorOf(res));
  res = await liam.update(hazardId, { hazardStatusRel: [h.pending] });
  check('Controls Pending needs planned controls', has(res, 'Add the controls you plan before moving the hazard to Controls Pending.'), errorOf(res));
  const hazardSource = [{ documentId: hazardId, name: hazard.systemHeader.summaryName, ref: hazard.hazardRef, kind: 'hazard', riskRating: 'High' }];
  res = await hannah.insert(T.action, 'action', { title: 'Gloves and back belts for drum handling', sourceRel: hazardSource, controlLevelRel: [ppe], ownerRel: [liam.person], raisedDate: iso(Date.now()), actionStatusRel: [open], dueDate: iso(Date.now() + 3 * DAY) });
  const ppeId = res.json?.documentId;
  check('a control is added', res.ok, errorOf(res));
  await waitFor(async () => (await get(hazardId)).actionsOpenNum === 1);
  res = await liam.update(hazardId, { hazardStatusRel: [h.pending] });
  check('with a planned control it moves to Controls Pending', res.ok, errorOf(res));
  res = await hannah.update(hazardId, { hazardStatusRel: [h.controlled], residualRisk: { likelihood: 5, consequence: 3 } });
  check("the residual risk can't be higher", has(res, "The residual risk can't be higher than the risk before controls."), errorOf(res));
  res = await hannah.update(hazardId, { hazardStatusRel: [h.controlled], residualRisk: { likelihood: 2, consequence: 3 } });
  check("it isn't controlled while a control is open", has(res, 'Some controls are not in place yet'), errorOf(res));
  res = await liam.update(ppeId, { actionStatusRel: [completed], completionNotes: 'Issued to the wash bay team.', evidenceArr: EVIDENCE });
  check('the control is done', res.ok, errorOf(res));
  res = await hannah.update(hazardId, { hazardStatusRel: [h.controlled], residualRisk: { likelihood: 2, consequence: 3 } });
  check('PPE alone is not enough for a High hazard', has(res, 'A High hazard needs a control at Engineering or above'), errorOf(res));
  res = await hannah.update(hazardId, { hazardStatusRel: [h.controlled], residualRisk: { likelihood: 2, consequence: 3 }, justification: 'Drum trolley on order; PPE until it arrives (two weeks).' });
  hazard = await get(hazardId);
  const expectedReview = nextReviewDate(Date.parse(hazard.lastReviewDate ?? ''), 'Medium');
  check('…unless justified: controlled, with its next review set by the residual rating', res.ok && hazard.residualRating === 'Medium' && hazard.currentRating === 'Medium' && demo.sameSecond(hazard.reviewDate, expectedReview), `${errorOf(res)} ${hazard?.reviewDate} ${expectedReview}`);

  section('Due dates and cancelling');
  const cancelled = await status('actionStatus', 'Cancelled');
  res = await hannah.insert(T.action, 'action', action({ title: 'Lock-out signage at the bandsaw', controlLevelRel: [ppe], ownerRel: [aisha.person] }));
  const signId = res.json?.documentId;
  const later = iso(Date.now() + 20 * DAY);
  res = await aisha.update(signId, { dueDate: later, extensionReason: 'Sign maker is closed until next month' });
  check('the owner can ask for longer, but not grant it', has(res, 'A later due date needs a manager or a WHS advisor: ask one to approve it.'), errorOf(res));
  res = await daniel.update(signId, { dueDate: later, extensionReason: 'Sign maker is closed until next month' });
  let sign = await get(signId);
  check('a manager approves the later date', res.ok && demo.sameSecond(sign.approvedDueDate, later) && sign.extensionApprovedByRel?.[0]?.name === 'Daniel Okafor', `${errorOf(res)} ${sign?.approvedDueDate}`);
  res = await aisha.update(signId, { details: 'Ordered from the usual supplier.' });
  check('…and the owner can keep working on it', res.ok, errorOf(res));
  res = await aisha.update(signId, { actionStatusRel: [cancelled], cancelReason: 'Not needed' });
  check("the owner can't cancel it", has(res, 'A WHS advisor or a manager cancels actions.'), errorOf(res));
  res = await hannah.update(signId, { actionStatusRel: [cancelled] });
  check('cancelling needs a reason', has(res, 'Say why the action is cancelled.'), errorOf(res));
  res = await hannah.update(signId, { actionStatusRel: [cancelled], cancelReason: 'Covered by the guard redesign.' });
  sign = await get(signId);
  check('with a reason it is cancelled', res.ok && sign.lastStatus === 'Cancelled', errorOf(res));

  section('Inspections');
  const sheet = await get(wpk.value.checkSheetRel[0].documentId);
  const inProgress = await status('inspectionStatus', 'In Progress');
  const complete = await status('inspectionStatus', 'Completed');
  const items = sheet.checkItems.map((c) => ({ ...c, result: '', comment: '' }));
  res = await liam.insert(T.inspection, 'inspection', { siteRel: [wpk.value], checkSheetRel: wpk.value.checkSheetRel, scheduledDate: iso(Date.now()), inspectorRel: [liam.person], inspectionStatusRel: [inProgress], checkItems: items });
  const inspectionId = res.json?.documentId;
  let inspection = inspectionId && (await get(inspectionId));
  check('an inspection is started', res.ok && /^INS-\d+$/.test(inspection.inspectionRef) && inspection.totalNum === items.length && inspection.answeredNum === 0, `${res.status} ${res.text}`);
  res = await liam.update(inspectionId, { inspectionStatusRel: [complete] });
  check("it can't be completed with checks unanswered", has(res, 'Answer every required check:'), errorOf(res));
  const answered = items.map((c, i) => ({ ...c, result: i === 0 ? 'fail' : 'pass' }));
  res = await liam.update(inspectionId, { inspectionStatusRel: [complete], checkItems: answered });
  check('a failed check needs to say what is wrong', has(res, `Say what is wrong for each failed check: ${items[0].question}.`), errorOf(res));
  answered[0].comment = 'Upright in aisle 3 bent at the base.';
  const scheduledBefore = await docs.countDocuments({ appTags: 'inspection', 'siteRel.documentId': wpk.doc.documentId, 'inspectionStatusRel.name': 'Scheduled', 'systemHeader.currentVersion': true });
  res = await liam.update(inspectionId, { inspectionStatusRel: [complete], checkItems: answered });
  inspection = await get(inspectionId);
  check('completed: result and date kept', res.ok && inspection.resultText === 'Hazards found' && inspection.failedNum === 1 && inspection.completedDate, errorOf(res));
  const raisedHazard = await waitFor(() => docs.findOne({ appTags: 'hazard', 'sourceRel.documentId': inspectionId, 'systemHeader.currentVersion': true }));
  check('the failed check raised a hazard, linked back', !!raisedHazard && raisedHazard.title === items[0].question && raisedHazard.hazardStatusRel[0].name === 'Reported' && raisedHazard.hazardCategoryRel[0].name === 'Plant and machinery' && /^HAZ-\d+$/.test(raisedHazard.hazardRef), JSON.stringify(raisedHazard?.title));
  const scheduledAfter = await docs.countDocuments({ appTags: 'inspection', 'siteRel.documentId': wpk.doc.documentId, 'inspectionStatusRel.name': 'Scheduled', 'systemHeader.currentVersion': true });
  check("the site's next inspection is already booked, so no second one", scheduledAfter === scheduledBefore && scheduledBefore === 1, `${scheduledBefore} → ${scheduledAfter}`);
  res = await liam.update(inspectionId, { inspectionStatusRel: [inProgress] });
  res = res.ok ? await liam.update(inspectionId, { inspectionStatusRel: [complete] }) : res;
  await new Promise((r) => setTimeout(r, 1500));
  const raisedCount = await docs.countDocuments({ appTags: 'hazard', 'sourceRel.documentId': inspectionId, 'systemHeader.currentVersion': true });
  check('completing it again raises nothing twice', res.ok && raisedCount === 1, `${errorOf(res)} ${raisedCount}`);

  section('The server');
  const alive = await fetch('http://localhost:3002/').then((r) => r.ok, () => false);
  check('fieldtec-web is still running after every refusal', alive);
} catch (error) {
  check('rules test ran to completion', false, error.stack);
} finally {
  await demo.finish();
}
console.log("The demo database now holds this run's records: pnpm db:setup --reset to start clean.");

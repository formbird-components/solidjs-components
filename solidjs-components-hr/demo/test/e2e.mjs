// End-to-end test of the HR rulesets on the running demo: signs in as different people, saves
// documents through fieldtec-web's API (so the PreSaveServer and PostSave rules run), and checks the
// results in MongoDB.
//
//   pnpm db:setup --reset && pnpm demo:server     # in another terminal
//   pnpm demo:e2e
//
// It WRITES to the demo database (leave, certificates, onboarding, an expiry check) and expects a
// fresh seed, so run `pnpm db:setup --reset` before it and again afterwards.
import { connectDemo } from '@solidjs-components/platform/e2e';
import { developmentConfig } from '@solidjs-components/platform/fieldtec';
import { serviceUrls } from '@solidjs-components/platform/services';

const { T, DEMO_PASSWORD, TIME_ZONE } = await import('../lib/model.mjs');
const { dayKey, dayStart, workingDays } = await import('../../../solidjs-components-shared/packages/kit/src/domain/range.ts');
const { HOLIDAYS } = await import('../lib/catalog.mjs');

const DAY = 86_400_000;
const demo = await connectDemo({ base: 'http://localhost:3004', db: 'solidjs-hr-demo', app: 'hr', password: DEMO_PASSWORD, serverLog: new URL('../server.log', import.meta.url) });
const { docs, get, named, pick, as, errorOf, waitFor, check, section } = demo;
const status = async (kind, name) => pick(await named(kind, name), { color: 'color', statusCategory: 'statusCategory', indexNum: 'indexNum' });
const leaveType = async (name) =>
  pick(await named('leaveType', name), { color: 'color', balanceKey: 'balanceKey', accrualDaysNum: 'accrualDaysNum', evidenceAfterDaysNum: 'evidenceAfterDaysNum', needsReasonBool: 'needsReasonBool', needsHrBool: 'needsHrBool', maxDaysNum: 'maxDaysNum', indexNum: 'indexNum' });
const accountOf = (key) => docs.findOne({ 'systemHeader.systemType': 'account', email: new RegExp(`^${key}\\.`), 'systemHeader.currentVersion': true });
const employee = async (key) =>
  pick(await accountOf(key), { email: 'email', accountType: 'accountType', jobTitle: 'jobTitle', teamRel: 'teamRel', managerRel: 'managerRel', employeeNo: 'employeeNo', positionRel: 'positionRel', employmentStartDate: 'employmentStartDate' });
const has = (res, text) => !res.ok && res.text.includes(text);
const today = dayKey(Date.now(), TIME_ZONE);
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** The `n`th working day (0-based) at least `from` days ahead. */
const workDay = (from, n = 0) => {
  let k = addDays(today, from);
  let seen = -1;
  for (;;) {
    if (workingDays({ first: k, last: k, holidays: HOLIDAYS }).days) seen++;
    if (seen >= n) return k;
    k = addDays(k, 1);
  }
};
const leaveOf = async (key, statusName) => {
  const a = await accountOf(key);
  return docs.findOne({ appTags: 'leave', 'employeeRel.documentId': a.documentId, 'leaveStatusRel.name': statusName, 'systemHeader.currentVersion': true, firstDay: { $gte: today } });
};
/** A decision on a step, as <solid-approval-chain> writes it. */
const decide = (chain, stepId, decision, by, comment = '') => ({
  steps: chain.steps.map((s) => (s.id === stepId ? { ...s, decision, decidedBy: { documentId: by.documentId, name: by.name }, decidedAt: new Date().toISOString(), comment } : s)),
});

try {
  const james = await as('james'); // Registered Nurse, Parramatta
  const sarah = await as('sarah'); // Nurse Unit Manager, Parramatta
  const david = await as('david'); // Clinical Director (second approver)
  const nadia = await as('nadia'); // People & Culture (Administrator)
  const kate = await as('kate'); // Home Care Coordinator
  const ben = await as('ben'); // Payroll Officer
  const s = { pending: await status('leaveStatus', 'Pending'), cancelled: await status('leaveStatus', 'Cancelled'), approved: await status('leaveStatus', 'Approved') };
  const annual = await leaveType('Annual leave');
  const personal = await leaveType("Personal/carer's leave");
  const request = async (key, type, first, last, extra = {}) => ({
    employeeRel: [await employee(key)],
    leaveTypeRel: [type],
    leaveStatusRel: [s.pending],
    startDate: dayStart(first, TIME_ZONE),
    endDate: dayStart(last, TIME_ZONE),
    startHalfBool: false,
    endHalfBool: false,
    ...extra,
  });

  section('A leave request goes to the line manager');
  const first = workDay(70);
  const last = workDay(70, 2);
  let res = await ben.insert(T.leave, 'leave', await request('ben', annual, first, last, { reason: 'Long weekend away' }));
  const benLeave = res.json?.documentId ? await get(res.json.documentId) : null;
  check('it is saved, numbered and counted in working days', res.ok && /^LV-\d+$/.test(benLeave?.leaveRef ?? '') && benLeave.daysNum === 3 && benLeave.periodText.includes('–'), `${res.status} ${res.text.slice(0, 300)}`);
  check('it waits for Raj (the line manager), who is recorded as told', benLeave?.nextApproverRel?.[0]?.name === 'Raj Malhotra' && benLeave.notifiedRel.some((p) => p.name === 'Raj Malhotra'));
  check('the activity says what was asked and who decides', /^Requested 3 days of annual leave, .+ Waiting for Raj Malhotra \(Line manager\)\./.test(benLeave?.notesCommentsArr?.at(-1)?.detail ?? ''), benLeave?.notesCommentsArr?.at(-1)?.detail);
  check('the balance on the first day is kept on it', typeof benLeave?.balanceAtStartNum === 'number');

  section('Refusals carry the rule’s message');
  res = await ben.insert(T.leave, 'leave', await request('ben', annual, workDay(80), workDay(80, 59)));
  check('more than the balance', has(res, 'That is 60 days of annual leave, but you will have'), res.text.slice(0, 300));
  res = await ben.insert(T.leave, 'leave', await request('ben', annual, first, first));
  check('overlapping your own leave', has(res, 'You already have leave on those days'), res.text.slice(0, 300));
  res = await ben.insert(T.leave, 'leave', await request('emma', annual, workDay(90), workDay(90)));
  check('leave for someone else, as an employee', has(res, 'You can only request leave for yourself.'), res.text.slice(0, 300));
  res = await ben.insert(T.leave, 'leave', await request('ben', personal, workDay(95), workDay(95, 3)));
  check("more than 2 days of personal leave without a certificate", has(res, 'Attach a medical certificate'), res.text.slice(0, 300));
  res = await ben.insert(T.leave, 'leave', { ...(await request('ben', annual, workDay(100), workDay(100))), leaveStatusRel: [s.approved] });
  check('a request that tries to start approved', has(res, 'A new leave request starts as Pending.'), res.text.slice(0, 300));

  section('Minimum staffing brings in a second approver');
  const ahmed = await leaveOf('ahmed', 'Pending');
  res = await james.insert(T.leave, 'leave', await request('james', annual, ahmed.firstDay, ahmed.firstDay, { reason: 'Appointment' }));
  const jamesLeave = res.json?.documentId ? await get(res.json.documentId) : null;
  check('James on Ahmed’s day would leave Parramatta Nursing below four', res.ok && jamesLeave?.staffingBreachBool === true && jamesLeave.approvalChain.steps.map((x) => x.id).join() === 'manager,second', `${res.status} ${res.text.slice(0, 300)}`);
  check('…so David approves after Sarah', jamesLeave?.approvalChain.steps[1].approvers[0].name === 'David Chen' && /below its minimum of 4/.test(jamesLeave.staffingNote ?? ''), jamesLeave?.staffingNote);

  section('Approvals are checked against the saved version');
  res = await james.update(jamesLeave.documentId, { ...jamesLeave, approvalChain: decide(jamesLeave.approvalChain, 'manager', 'approved', james.person) });
  check('James can’t approve his own leave', !res.ok && /Only Sarah Mitchell can decide/.test(res.text), res.text.slice(0, 400));
  res = await david.update(jamesLeave.documentId, { ...jamesLeave, approvalChain: decide(jamesLeave.approvalChain, 'second', 'approved', david.person) });
  check('David can’t approve before Sarah', !res.ok && /isn't the Second approver step's turn/.test(res.text), res.text.slice(0, 400));
  res = await sarah.update(jamesLeave.documentId, { ...jamesLeave, approvalChain: decide(jamesLeave.approvalChain, 'manager', 'approved', sarah.person, 'Fine by me') });
  let saved = await get(jamesLeave.documentId);
  check('Sarah approves: still pending, now waiting for David', res.ok && saved.leaveStatusRel[0].name === 'Pending' && saved.nextApproverRel[0]?.name === 'David Chen' && saved.approvalChain.steps[0].decidedBy.name === 'Sarah Mitchell', `${res.status} ${res.text.slice(0, 300)}`);
  res = await david.update(jamesLeave.documentId, { ...saved, approvalChain: decide(saved.approvalChain, 'second', 'approved', david.person) });
  saved = await get(jamesLeave.documentId);
  check('David approves: approved, James told, decision recorded', res.ok && saved.leaveStatusRel[0].name === 'Approved' && saved.approvalState === 'approved' && !!saved.decidedDate && saved.notesCommentsArr.at(-1).detail.startsWith('**Approved**: 1 day of annual leave'), `${res.status} ${res.text.slice(0, 300)}`);
  const jamesAccount = await waitFor(async () => {
    const a = await accountOf('james');
    return a.leaveBalances?.annual && a ;
  });
  check('the PostSave rule recounts James’s balances on his account', typeof jamesAccount?.annualAvailableNum === 'number' && jamesAccount.leaveBalances.annual.approved >= 1);
  res = await james.update(jamesLeave.documentId, { ...saved, endDate: dayStart(addDays(saved.firstDay, 1), TIME_ZONE) });
  check('approved leave can’t be changed', !res.ok && /Approved leave can't be changed/.test(res.text), res.text.slice(0, 300));
  res = await james.update(jamesLeave.documentId, { ...saved, leaveStatusRel: [s.cancelled], cancelReason: 'Appointment moved' });
  saved = await get(jamesLeave.documentId);
  check('James cancels it before it starts, with a reason', res.ok && saved.leaveStatusRel[0].name === 'Cancelled' && saved.notesCommentsArr.at(-1).detail === '**Cancelled** by James Okoro: Appointment moved', `${res.status} ${res.text.slice(0, 300)}`);

  section('Delegation and rejection');
  const sofia = await leaveOf('sofia', 'Pending');
  check('Grace handed Sofia’s request to Sarah', sofia?.approvalChain?.steps?.[0]?.delegate?.name === 'Sarah Mitchell');
  res = await sarah.update(sofia.documentId, { ...sofia, approvalChain: decide(sofia.approvalChain, 'manager', 'rejected', sarah.person) });
  check('a rejection needs a reason', !res.ok && /Say why you are rejecting it/.test(res.text), res.text.slice(0, 300));
  res = await sarah.update(sofia.documentId, { ...sofia, approvalChain: decide(sofia.approvalChain, 'manager', 'rejected', sarah.person, 'Reception is short that day; can Liam cover first?') });
  const sofiaSaved = await get(sofia.documentId);
  check('the delegate rejects it, with the reason in the activity', res.ok && sofiaSaved.leaveStatusRel[0].name === 'Rejected' && sofiaSaved.notesCommentsArr.some((n) => n.detail.startsWith('**Rejected** by Sarah Mitchell (Line manager): Reception is short')), `${res.status} ${res.text.slice(0, 300)}`);

  section('Certificates');
  const jack = await employee('jack');
  const cpr = pick(await named('certType', 'CPR (HLTAID009)'), { validityMonthsNum: 'validityMonthsNum', shortName: 'shortName', indexNum: 'indexNum' });
  const issued = new Date(Date.now() - 360 * DAY).toISOString();
  res = await kate.insert(T.certificate, 'certificate', { personRel: [jack], certTypeRel: [cpr], certNumber: 'CPR-E2E', issuedDate: issued, expiryDate: new Date(Date.now() + 5 * DAY).toISOString() });
  const certSaved = res.json?.documentId ? await get(res.json.documentId) : null;
  check('an expiring certificate tells its holder and their manager', res.ok && certSaved?.certState === 'Expiring' && certSaved.notifiedRel.map((p) => p.name).join() === 'Jack Wilson,Kate Sullivan' && certSaved.expiryNotifiedBool === true, `${res.status} ${res.text.slice(0, 300)}`);
  res = await ben.insert(T.certificate, 'certificate', { personRel: [jack], certTypeRel: [cpr], issuedDate: issued });
  check('an employee can’t add someone else’s certificate', has(res, 'You can only add your own certificates.'), res.text.slice(0, 300));
  res = await ben.insert(T.certificate, 'certificate', { personRel: [await employee('ben')], certTypeRel: [cpr], issuedDate: new Date(Date.now() - 10 * DAY).toISOString() });
  const benCert = res.json?.documentId ? await get(res.json.documentId) : null;
  check('the expiry follows the type’s validity when it isn’t given', res.ok && !!benCert?.expiryDate && benCert.certState === 'Valid', `${res.status} ${res.text.slice(0, 300)}`);

  section('The expiry check');
  res = await kate.insert(T.certificate, 'certificate', { personRel: [await employee('isla')], certTypeRel: [cpr], issuedDate: issued, expiryDate: new Date(Date.now() + 45 * DAY).toISOString() });
  const later = res.json?.documentId ? await get(res.json.documentId) : null;
  check('a certificate with 45 days left is valid, nobody told yet', res.ok && later?.certState === 'Valid' && !later.expiryNotifiedBool, `${res.status} ${res.text.slice(0, 200)}`);
  // Three weeks pass: it now expires in 24 days (moved in MongoDB and Elasticsearch, as nobody saves it).
  const soon = new Date(Date.now() + 24 * DAY).toISOString();
  await docs.updateOne({ documentId: later.documentId, 'systemHeader.currentVersion': true }, { $set: { expiryDate: new Date(soon) } });
  await fetch(`${serviceUrls(developmentConfig()).es}/solidjs-hr-demo/_update_by_query?refresh=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: { term: { documentId: later.documentId } }, script: { source: 'ctx._source.expiryDate = params.at', params: { at: soon } } }),
  });
  res = await ben.insert(T.expiryCheck, 'expiryCheck', {});
  check('only People & Culture runs it', has(res, 'People & Culture runs the certificate expiry check.'), res.text.slice(0, 300));
  res = await nadia.insert(T.expiryCheck, 'expiryCheck', {});
  const run = res.json?.documentId
    ? await waitFor(async () => {
        const d = await get(res.json.documentId);
        return d?.doneBool && d;
      }, 20000)
    : null;
  check('it flags the certificate that now expires within 30 days, and says what it found', res.ok && run?.notifiedNum === 1 && /^Flagged 1 certificate and told 2 people \(Isla Thompson, Kate Sullivan\)\./.test(run?.summary ?? ''), `${res.status} ${res.text.slice(0, 200)} ${run?.summary}`);
  const flagged = await get(later.documentId);
  check('…Expiring now, with Isla and Kate told in its activity', flagged.certState === 'Expiring' && flagged.expiryNotifiedBool === true && flagged.notifiedRel.map((p) => p.name).join() === 'Isla Thompson,Kate Sullivan' && /\(expiry check EXP-\d+\)\.$/.test(flagged.notesCommentsArr.at(-1).detail), JSON.stringify({ state: flagged.certState, told: flagged.notifiedRel, note: flagged.notesCommentsArr?.at(-1)?.detail }));
  res = await nadia.insert(T.expiryCheck, 'expiryCheck', {});
  const again = res.json?.documentId ? await waitFor(async () => (await get(res.json.documentId))?.doneBool && (await get(res.json.documentId)), 20000) : null;
  check('a second check tells nobody twice', again?.notifiedNum === 0 && /^Nothing new/.test(again?.summary ?? ''), again?.summary);

  section('Onboarding');
  const chloe = await docs.findOne({ appTags: 'onboarding', 'personRel.name': 'Chloe Brennan', 'systemHeader.currentVersion': true });
  const completed = await status('onboardingStatus', 'Completed');
  res = await sarah.update(chloe.documentId, { ...chloe, onboardingStatusRel: [completed] });
  check('it can’t complete with tasks left', !res.ok && /Finish the required tasks first/.test(res.text), res.text.slice(0, 300));
  res = await sarah.update(chloe.documentId, { ...chloe, onboardingStatusRel: [completed], tasks: chloe.tasks.map((t) => ({ ...t, result: 'pass' })) });
  check('…or with a required certificate missing', !res.ok && /still need Medication administration/.test(res.text), res.text.slice(0, 300));
  const meds = pick(await named('certType', 'Medication administration'), { validityMonthsNum: 'validityMonthsNum', shortName: 'shortName', indexNum: 'indexNum' });
  res = await sarah.insert(T.certificate, 'certificate', { personRel: [await employee('chloe')], certTypeRel: [meds], issuedDate: new Date(Date.now() - DAY).toISOString() });
  check('Sarah records Chloe’s medication competency', res.ok, res.text.slice(0, 300));
  await new Promise((r) => setTimeout(r, 1500));
  res = await sarah.update(chloe.documentId, { ...chloe, onboardingStatusRel: [completed], tasks: chloe.tasks.map((t) => ({ ...t, result: 'pass' })) });
  const chloeDone = await get(chloe.documentId);
  check('then onboarding completes', res.ok && chloeDone.onboardingStatusRel[0].name === 'Completed' && chloeDone.progressNum === 100 && chloeDone.missingCerts.length === 0, `${res.status} ${res.text.slice(0, 300)}`);
  const chloeAccount = await waitFor(async () => (await accountOf('chloe'))?.onboardingStatus === 'Completed');
  check('…and her account says so', !!chloeAccount);
} catch (error) {
  check('the end-to-end test ran to completion', false, error.stack);
} finally {
  await demo.finish();
}

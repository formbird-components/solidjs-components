// End-to-end test of the procurement rulesets on the running demo: signs in as different people,
// saves documents through fieldtec-web's API (so the PreSaveServer and PostSave rules run), and checks
// the results in MongoDB.
//
//   pnpm db:setup --reset && pnpm demo:server     # in another terminal
//   pnpm demo:e2e
//
// It WRITES to the demo database (requests, quotes, approvals, an order, a delivery, an invoice) and
// expects a fresh seed, so run `pnpm db:setup --reset` before it and again afterwards.
import { connectDemo } from '@solidjs-components/platform/e2e';

const { T, procId, DEMO_PASSWORD } = await import('../lib/model.mjs');

const DAY = 86_400_000;
const demo = await connectDemo({ base: 'http://localhost:3005', db: 'solidjs-procurement-demo', app: 'proc', password: DEMO_PASSWORD, serverLog: new URL('../server.log', import.meta.url) });
const { docs, get, named, pick, as, waitFor, check, section } = demo;

const status = async (name) => pick(await named('requestStatus', name), { color: 'color', statusCategory: 'statusCategory', indexNum: 'indexNum' });
const supplier = async (name) => pick(await named('supplier', name), { approvedBool: 'approvedBool', blockedBool: 'blockedBool', abn: 'abn', paymentTerms: 'paymentTerms' });
const category = async (name) => pick(await named('category', name), { indexNum: 'indexNum' });
const story = (key) => get(procId('request', key));
const has = (res, text) => !res.ok && res.text.includes(text);
const lastNote = (doc) => doc?.notesCommentsArr?.at(-1)?.detail ?? '';
/** A decision on a step, as <solid-approval-chain> writes it. */
const decide = (chain, stepId, decision, by, comment = '') => ({
  steps: chain.steps.map((s) => (s.id === stepId ? { ...s, decision, decidedBy: { documentId: by.documentId, name: by.name }, decidedAt: new Date().toISOString(), comment } : s)),
});
const centre = async (code) => docs.findOne({ appTags: 'costCentre', code, 'systemHeader.currentVersion': true });

try {
  const kai = await as('kai'); // Heavy diesel fitter, Workshop
  const tom = await as('tom'); // Workshop manager
  const greg = await as('greg'); // GM Operations (Executive)
  const robert = await as('robert'); // CEO
  const anjali = await as('anjali'); // CFO
  const lachlan = await as('lachlan'); // Finance manager, approves budget overrides
  const mia = await as('mia'); // Accounts payable (Finance)
  const marco = await as('marco'); // Procurement buyer
  const sophie = await as('sophie'); // Marketing manager
  const s = { draft: await status('Draft'), submitted: await status('Submitted'), approved: await status('Approved'), ordered: await status('Ordered'), received: await status('Received'), closed: await status('Closed'), cancelled: await status('Cancelled') };
  const kaiAccount = await get(kai.person.documentId);
  const hunter = await supplier('Hunter Hydraulics');
  const tools = await category('Tools and equipment');
  const request = (fields = {}) => ({
    title: 'Hose fittings',
    requesterRel: [kai.person],
    costCentreRel: kaiAccount.costCentreRel,
    categoryRel: [tools],
    supplierRel: [hunter],
    neededByDate: new Date(Date.now() + 10 * DAY).toISOString(),
    requestStatusRel: [s.submitted],
    lineItemsArr: [{ id: 'l1', kind: 'goods', description: 'Hose fittings, assorted', qty: 1, unit: 'kit', unitCost: 1450 }],
    ...fields,
  });

  section('A small request goes to the cost centre manager');
  let res = await kai.insert(T.request, 'request', request());
  const fittings = res.json?.documentId ? await get(res.json.documentId) : null;
  check('it is saved, numbered and added up', res.ok && /^PR-\d+$/.test(fittings?.requestRef ?? '') && fittings.subtotalNum === 1450 && fittings.gstNum === 145 && fittings.totalNum === 1595 && /^FY\d{4}-\d{2}$/.test(fittings.fyKey), `${res.status} ${res.text.slice(0, 300)}`);
  check('under $2,000 it needs no quote, and waits for Tom', fittings?.quotesNeededNum === 0 && fittings.approvalChain.steps.map((x) => x.id).join() === 'manager' && fittings.nextApproverRel[0]?.name === 'Tom Harris');
  check('the activity says what was asked and who decides, and Tom is told', /^Submitted for \$1,450(\.00)? ex GST\. Waiting for Tom Harris \(Cost centre manager\)/.test(lastNote(fittings)) && fittings.notifiedRel?.some((p) => p.name === 'Tom Harris'), lastNote(fittings));
  check('its budget position is kept on it', typeof fittings?.budgetRemainingNum === 'number' && fittings.overBudgetBool === false);

  section('Refusals carry the rule’s message');
  res = await kai.insert(T.request, 'request', request({ lineItemsArr: [{ id: 'l1', kind: 'goods', description: 'Hose crimper dies', qty: 2, unit: 'set', unitCost: 1600 }] }));
  check('$3,200 without a quote', has(res, 'A written quote is needed above $2,000 (0 so far).'), res.text.slice(0, 300));
  res = await kai.insert(T.request, 'request', request({ requesterRel: [(await as('ella')).person] }));
  check('a request for someone else, as an employee', has(res, 'You can only raise a request for yourself.'), res.text.slice(0, 300));
  res = await kai.insert(T.request, 'request', request({ requestStatusRel: [s.approved] }));
  check('a request that tries to start approved', has(res, 'A new request starts as Draft or Submitted.'), res.text.slice(0, 300));
  res = await kai.insert(T.request, 'request', request({ supplierRel: [await supplier('Discount Imports Direct')] }));
  check('a blocked supplier', has(res, 'Discount Imports Direct is blocked: choose another supplier.'), res.text.slice(0, 300));
  res = await kai.insert(T.request, 'request', request({ lineItemsArr: [{ id: 'l1', kind: 'goods', description: 'Fittings', qty: 0, unitCost: 10 }] }));
  check('a line with no quantity', has(res, 'Give "Fittings" a quantity.'), res.text.slice(0, 300));

  section('Approvals follow the amount, and are checked against the saved version');
  const crimper = await story('crimper');
  res = await kai.update(crimper.documentId, { ...crimper, approvalChain: decide(crimper.approvalChain, 'manager', 'approved', kai.person) });
  check('Kai can’t approve his own request', has(res, 'Only Tom Harris can decide the Cost centre manager step.'), res.text.slice(0, 400));
  res = await tom.update(crimper.documentId, { ...crimper, approvalChain: decide(crimper.approvalChain, 'manager', 'rejected', tom.person) });
  check('a rejection needs a reason', has(res, 'Say why you are rejecting it.'), res.text.slice(0, 400));
  res = await tom.update(crimper.documentId, { ...crimper, approvalChain: decide(crimper.approvalChain, 'manager', 'approved', tom.person, 'Worth it') });
  let saved = await story('crimper');
  check('Tom approves $3,480: approved, Kai and Procurement told', res.ok && saved.requestStatusRel[0].name === 'Approved' && saved.approvalState === 'approved' && !!saved.approvedDate && /^\*\*Approved\*\* for \$3,480(\.00)? ex GST: ready to order\. Told .*Kai Robinson.*Marco Ruiz/.test(lastNote(saved)), `${res.status} ${res.text.slice(0, 300)} ${lastNote(saved)}`);
  check('…with Tom’s decision in the activity', saved?.notesCommentsArr?.some((n) => n.detail === '**Approved** by Tom Harris (Cost centre manager): Worth it'));

  const generators = await story('generators');
  check('$18,900 needs a senior manager after Jess', generators.approvalChain.steps.map((x) => x.id).join() === 'manager,senior' && generators.nextApproverRel[0]?.name === 'Greg Mason');
  res = await robert.update(generators.documentId, { ...generators, approvalChain: decide(generators.approvalChain, 'senior', 'approved', robert.person) });
  check('the CEO can’t step in for Greg', has(res, 'Only Greg Mason can decide the Senior manager step.'), res.text.slice(0, 400));
  res = await greg.update(generators.documentId, { ...generators, approvalChain: decide(generators.approvalChain, 'manager', 'rejected', greg.person, 'No') });
  check('a decided step stays decided', has(res, "The Cost centre manager decision has been made and can't be changed."), res.text.slice(0, 400));
  res = await greg.update(generators.documentId, { ...generators, approvalChain: decide(generators.approvalChain, 'senior', 'approved', greg.person) });
  saved = await story('generators');
  check('Greg approves: approved', res.ok && saved.requestStatusRel[0].name === 'Approved', `${res.status} ${res.text.slice(0, 300)}`);

  section('Over budget: Finance approves the override first');
  const laptops = await story('laptops');
  check('IT would go $8,420 over, so Lachlan decides before Anjali', laptops.overBudgetBool === true && laptops.overBudgetByNum === 8420 && laptops.approvalChain.steps.map((x) => x.id).join() === 'manager,finance,senior' && /goes \$8,420 over/.test(laptops.approvalChain.steps[1].reason));
  res = await anjali.update(laptops.documentId, { ...laptops, approvalChain: decide(laptops.approvalChain, 'senior', 'approved', anjali.person) });
  check('Anjali can’t approve before the override', has(res, "It isn't the Senior manager step's turn yet."), res.text.slice(0, 400));
  res = await lachlan.update(laptops.documentId, { ...laptops, approvalChain: decide(laptops.approvalChain, 'finance', 'approved', lachlan.person, 'Fund from the FY27 hardware reserve') });
  saved = await story('laptops');
  check('Lachlan approves the override: still submitted, now waiting for Anjali', res.ok && saved.requestStatusRel[0].name === 'Submitted' && saved.nextApproverRel[0]?.name === 'Anjali Desai' && /^Now waiting for Anjali Desai \(Senior manager\)/.test(lastNote(saved)), `${res.status} ${res.text.slice(0, 300)} ${lastNote(saved)}`);
  const itBefore = await centre('310');
  res = await anjali.update(laptops.documentId, { ...saved, approvalChain: decide(saved.approvalChain, 'senior', 'approved', anjali.person) });
  saved = await story('laptops');
  check('Anjali approves: approved', res.ok && saved.requestStatusRel[0].name === 'Approved', `${res.status} ${res.text.slice(0, 300)}`);
  const itAfter = await waitFor(async () => {
    const c = await centre('310');
    return c.committedNum === itBefore.committedNum + 46200 && c;
  });
  check('the PostSave rule moves the laptops from waiting to committed on IT’s budget', !!itAfter && itAfter.pendingNum === itBefore.pendingNum - 46200 && itAfter.remainingNum === itBefore.remainingNum - 46200, JSON.stringify({ before: pick(itBefore, { c: 'committedNum', p: 'pendingNum', r: 'remainingNum' }), after: itAfter && pick(itAfter, { c: 'committedNum', p: 'pendingNum', r: 'remainingNum' }) }));

  section('An unapproved supplier goes past Procurement');
  const windows = await story('windows');
  check('Heritage Joinery isn’t approved, so Procurement decides after Hannah', windows.approvalChain.steps[1].id === 'procurement' && windows.approvalChain.steps[1].reason.includes('Heritage Joinery Co is not an approved supplier yet.'));
  res = await marco.update(windows.documentId, { ...windows, approvalChain: decide(windows.approvalChain, 'procurement', 'approved', marco.person, 'Heritage listed for the council works') });
  saved = await story('windows');
  check('Marco approves: on to Greg', res.ok && saved.nextApproverRel[0]?.name === 'Greg Mason', `${res.status} ${res.text.slice(0, 300)}`);

  section('Order, delivery and invoice');
  const ppe = await story('ppe');
  res = await marco.update(ppe.documentId, { ...ppe, lineItemsArr: [...ppe.lineItemsArr, { id: 'extra', kind: 'goods', description: 'Hard hats', qty: 10, unit: 'ea', unitCost: 30 }] });
  check('what was approved can’t change', has(res, "An approved request can't change what is bought or from whom"), res.text.slice(0, 300));
  res = await kai.update(ppe.documentId, { ...ppe, requestStatusRel: [s.ordered], expectedDeliveryDate: new Date(Date.now() + 7 * DAY).toISOString() });
  check('only Procurement raises the order', has(res, 'Procurement raises the order.'), res.text.slice(0, 300));
  res = await marco.update(ppe.documentId, { ...ppe, requestStatusRel: [s.ordered] });
  check('…with the expected delivery', has(res, 'Say when the order is expected.'), res.text.slice(0, 300));
  res = await marco.update(ppe.documentId, { ...ppe, requestStatusRel: [s.ordered], expectedDeliveryDate: new Date(Date.now() + 7 * DAY).toISOString() });
  saved = await story('ppe');
  check('Marco orders it: a PO number, who ordered and when', res.ok && saved.requestStatusRel[0].name === 'Ordered' && saved.poNumber === saved.requestRef.replace('PR', 'PO') && saved.orderedByRel[0].name === 'Marco Ruiz' && /^\*\*Ordered\*\* from Coastline PPE: PO-\d+, expected /.test(lastNote(saved)), `${res.status} ${res.text.slice(0, 300)} ${lastNote(saved)}`);

  const tyres = await story('tyres');
  res = await kai.update(tyres.documentId, { ...tyres, requestStatusRel: [s.received] });
  check('Kai can’t receive someone else’s order', has(res, 'The requester, the cost centre manager or Procurement records the delivery.'), res.text.slice(0, 300));
  res = await tom.update(tyres.documentId, { ...tyres, requestStatusRel: [s.received], receiptNotes: 'All eight, no damage' });
  saved = await story('tyres');
  check('Tom records the delivery', res.ok && saved.requestStatusRel[0].name === 'Received' && saved.receivedByRel[0].name === 'Tom Harris' && lastNote(saved) === '**Received** by Tom Harris: All eight, no damage', `${res.status} ${res.text.slice(0, 300)}`);

  const survey = await story('survey');
  res = await tom.update(survey.documentId, { ...survey, requestStatusRel: [s.closed] });
  check('only Finance closes', has(res, 'Finance closes a request once the invoice is in.'), res.text.slice(0, 300));
  res = await mia.update(survey.documentId, { ...survey, requestStatusRel: [s.closed] });
  check('an invoice 10% over needs a reason', has(res, 'The invoice is $1,056 (10%) over the approved $10,560: say why before closing.'), res.text.slice(0, 300));
  res = await mia.update(survey.documentId, { ...survey, requestStatusRel: [s.closed], varianceReason: 'Two extra days on site, agreed by Jess' });
  saved = await story('survey');
  check('Mia closes it with the reason: the match is recorded, ex GST', res.ok && saved.requestStatusRel[0].name === 'Closed' && saved.matchResult === 'Over tolerance' && saved.invoiceVarianceNum === 1056 && saved.invoiceExGstNum === 10560 && saved.closedByRel[0].name === 'Mia Foster', `${res.status} ${res.text.slice(0, 300)}`);
  check('…and says so in the activity', lastNote(saved).startsWith('**Closed.** Invoice PSR-30418 for $11,616') && lastNote(saved).endsWith('Two extra days on site, agreed by Jess'), lastNote(saved));

  section('Cancelling');
  res = await kai.update(fittings.documentId, { ...(await get(fittings.documentId)), requestStatusRel: [s.cancelled] });
  saved = await get(fittings.documentId);
  check('Kai cancels his own request before it is decided', res.ok && saved.requestStatusRel[0].name === 'Cancelled' && lastNote(saved) === '**Cancelled** by Kai Robinson.', `${res.status} ${res.text.slice(0, 300)}`);
  const crimperNow = await story('crimper');
  res = await kai.update(crimperNow.documentId, { ...crimperNow, requestStatusRel: [s.cancelled], cancelReason: 'Changed my mind' });
  check('once approved, only Procurement or Finance cancel', has(res, 'Once approved, only Procurement or Finance can cancel it.'), res.text.slice(0, 300));

  section('Quotes');
  const stand = await story('stand');
  const expo = await supplier('ExpoWorks Displays');
  res = await sophie.insert(T.quote, 'quote', { requestRel: [{ documentId: stand.documentId, name: stand.systemHeader.summaryName, ref: stand.requestRef }], amountNum: 7650 });
  check('a quote needs its supplier', has(res, 'Choose the supplier.'), res.text.slice(0, 300));
  res = await sophie.insert(T.quote, 'quote', { requestRel: [{ documentId: stand.documentId, name: stand.systemHeader.summaryName, ref: stand.requestRef }], supplierRel: [expo], amountNum: 7650, validUntilDate: new Date(Date.now() + 30 * DAY).toISOString() });
  const quote = res.json?.documentId ? await get(res.json.documentId) : null;
  check('a third quote for the stand is saved and numbered', res.ok && /^QT-\d+$/.test(quote?.quoteRef ?? '') && quote.requestRef === stand.requestRef && quote.supplierName === 'ExpoWorks Displays', `${res.status} ${res.text.slice(0, 300)}`);
  const standAfter = await waitFor(async () => {
    const d = await story('stand');
    return d.quotesNum === 3 && d;
  });
  check('the PostSave rule counts it on the request, with the cheapest', standAfter?.quotesNum === 3 && standAfter.cheapestQuoteNum === 7650, JSON.stringify(standAfter && pick(standAfter, { n: 'quotesNum', c: 'cheapestQuoteNum' })));
} catch (error) {
  check('the end-to-end test ran to completion', false, error.stack);
} finally {
  await demo.finish();
}

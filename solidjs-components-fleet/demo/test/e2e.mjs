// End-to-end test of the fleet rulesets on the running demo: signs in as different people, saves
// documents through fieldtec-web's API (so the PreSaveServer and PostSave rules run), and checks the
// results in MongoDB.
//
//   pnpm db:setup --reset && pnpm demo:server     # in another terminal
//   pnpm demo:e2e
//
// It WRITES to the demo database (bookings, checks, requests, work orders, fuel, asset changes) and
// expects a fresh seed, so run `pnpm db:setup --reset` before it and again afterwards.
import { connectDemo } from '@solidjs-components/platform/e2e';

const { T, ASSET_VALUE_FIELDS, TIME_ZONE, DEMO_PASSWORD } = await import('../lib/model.mjs');
const { hireCost } = await import('../../packages/fleet-kit/src/logic/booking.ts');
const { lineTotals } = await import('../../../solidjs-components-shared/packages/kit/src/domain/money.ts');
const { nextServiceDue } = await import('../../packages/fleet-kit/src/logic/service.ts');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Sign-in, API calls (with the server log for refused updates), MongoDB and checks: shared's platform.
const demo = await connectDemo({ base: 'http://localhost:3001', db: 'solidjs-fleet-demo', app: 'fleet', password: DEMO_PASSWORD, serverLog: new URL('../server.log', import.meta.url) });
const { docs, get, named, pick, as, errorOf, sameSecond, waitFor, check, section } = demo;
const asset = (assetId) => docs.findOne({ appTags: 'asset', assetId, 'systemHeader.currentVersion': true, 'systemHeader.systemType': 'document' });
const status = async (kind, name) => pick(await named(kind, name), { color: 'color', statusCategory: 'statusCategory', indexNum: 'indexNum' });
const lookup = async (kind, name) => pick(await named(kind, name), { indexNum: 'indexNum' });
const assetValue = async (assetId, extra = {}) => pick(await asset(assetId), { ...ASSET_VALUE_FIELDS, ...extra });

try {
  const sofia = await as('sofia');
  const now = Date.now();
  const reserved = await status('bookingStatus', 'Asset Reserved');
  const fieldWork = await lookup('bookingReason', 'Field work');

  section('Bookings');
  // A clash: the start of an existing future booking on a field-pool asset.
  const fieldPool = await named('pool', 'Field Services pool');
  const taken = await docs.findOne({
    appTags: 'booking', 'systemHeader.currentVersion': true, 'bookingStatusRel.name': 'Asset Reserved', startDate: { $gt: new Date(now + 2 * HOUR).toISOString() },
    'assetRel.assetId': { $in: (await docs.find({ appTags: 'asset', 'poolsRel.documentId': fieldPool.documentId, 'hireStatusRel.name': { $ne: 'Unavailable For Hire' }, 'systemHeader.currentVersion': true }).toArray()).map((a) => a.assetId) },
  }, { sort: { startDate: 1 } });
  const clashStart = new Date(new Date(taken.startDate).getTime() + 30 * 60_000).toISOString();
  let res = await sofia.insert(T.booking, 'booking', {
    bookingStatusRel: [reserved], assetRel: [await assetValue(taken.assetRel[0].assetId)], requestedByRel: [sofia.person], bookingReasonRel: [fieldWork],
    startDate: clashStart, endDate: new Date(new Date(clashStart).getTime() + 2 * HOUR).toISOString(),
  });
  check(`a clash with ${taken.bookingRef} is refused, naming it`, !res.ok && res.text.includes('already booked') && res.text.includes(taken.bookingRef), `${res.status} ${res.text}`);

  // A free slot far ahead (beyond the seeded two weeks), on a weekday in Sydney at 10:00.
  let day = new Date(now + 20 * DAY);
  while (['Sat', 'Sun'].includes(day.toLocaleDateString('en-AU', { timeZone: TIME_ZONE, weekday: 'short' }))) day = new Date(day.getTime() + DAY);
  const ymd = day.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
  const start = new Date(`${ymd}T10:00:00+11:00`).toISOString();
  const end = new Date(`${ymd}T15:30:00+11:00`).toISOString();
  const u301 = await asset('U-301');
  res = await sofia.insert(T.booking, 'booking', { bookingStatusRel: [reserved], assetRel: [await assetValue('U-301')], requestedByRel: [sofia.person], bookingReasonRel: [fieldWork], startDate: start, endDate: end, jobCode: 'JOB-E2E' });
  check('a free slot books', res.ok, `${res.status} ${res.text}`);
  const bookingId = res.json?.documentId;
  let booking = bookingId && (await get(bookingId));
  check('…with a BK number, its cost from the shared hireCost, and its first transition', !!booking?.bookingRef?.startsWith('BK-') && booking.hireCost === hireCost({ start, end, hourlyRate: u301.hireRateHourly, dailyRate: u301.hireRateDaily, timeZone: TIME_ZONE }) && booking.hireCost > 0 && booking.lastStatus === 'Asset Reserved' && booking.transition?.to === 'Asset Reserved', JSON.stringify({ ref: booking?.bookingRef, cost: booking?.hireCost, last: booking?.lastStatus, transition: booking?.transition }));
  check('…and its summary name from the template rule', booking?.systemHeader?.summaryName === `${booking?.bookingRef}: U-301 for Sofia Russo`, booking?.systemHeader?.summaryName);

  res = await sofia.insert(T.booking, 'booking', { bookingStatusRel: [reserved], assetRel: [await assetValue('T-404')], requestedByRel: [sofia.person], bookingReasonRel: [fieldWork], startDate: start, endDate: end });
  check('outside your vehicle hire pools is refused', !res.ok && res.text.includes('vehicle hire pool'), `${res.status} ${res.text}`);
  res = await sofia.insert(T.booking, 'booking', { bookingStatusRel: [reserved], assetRel: [await assetValue('U-302')], requestedByRel: [sofia.person], bookingReasonRel: [fieldWork], startDate: start, endDate: new Date(new Date(start).getTime() + 60 * HOUR).toISOString() });
  check('longer than the asset allows is refused', !res.ok && res.text.includes('at most 48 hours'), `${res.status} ${res.text}`);
  res = await sofia.insert(T.booking, 'booking', { bookingStatusRel: [reserved], assetRel: [await assetValue('V-202')], requestedByRel: [sofia.person], bookingReasonRel: [fieldWork], startDate: start, endDate: end });
  check('an asset in the workshop is refused', !res.ok && res.text.includes('Unavailable For Hire'), `${res.status} ${res.text}`);
  const liam = await as('liam');
  res = await liam.insert(T.booking, 'booking', { bookingStatusRel: [reserved], assetRel: [await assetValue('T-402')], requestedByRel: [liam.person], bookingReasonRel: [fieldWork], startDate: start, endDate: end });
  check('a licence that covers the asset books (LR for a 4.5 t truck)', res.ok, `${res.status} ${res.text}`);
  res = await liam.insert(T.booking, 'booking', { bookingStatusRel: [reserved], assetRel: [await assetValue('T-404')], requestedByRel: [liam.person], bookingReasonRel: [fieldWork], startDate: start, endDate: end });
  check('one that doesn’t is refused (MR rigid)', !res.ok && res.text.includes('needs a MR licence'), `${res.status} ${res.text}`);
  const noah = await as('noah');
  res = await noah.insert(T.booking, 'booking', { bookingStatusRel: [reserved], assetRel: [await assetValue('U-304')], requestedByRel: [noah.person], bookingReasonRel: [fieldWork], startDate: start, endDate: end });
  check('a licence expiring before the booking ends is refused', !res.ok && res.text.includes('licence expires'), `${res.status} ${res.text}`);

  res = await sofia.insert(T.booking, 'booking', { bookingStatusRel: [await status('bookingStatus', 'Hire Commenced')], assetRel: [await assetValue('U-301')], requestedByRel: [sofia.person], bookingReasonRel: [fieldWork], startDate: start, endDate: end, startMeterNum: 1 });
  check('a new booking can’t skip Asset Reserved through the API', !res.ok && res.text.includes('A new booking starts as Asset Reserved'), `${res.status} ${res.text}`);
  res = await sofia.insert(T.request, 'request', { requestStatusRel: [await status('requestStatus', 'Open')], assetRel: [await assetValue('U-301')], requestedByRel: [sofia.person], reqDescription: 'Skipping triage' });
  check('nor can a driver’s request skip triage', !res.ok && res.text.includes('A new request starts as Pending'), `${res.status} ${res.text}`);

  section('Hire');
  const commenced = await status('bookingStatus', 'Hire Commenced');
  res = await sofia.update(bookingId, { bookingStatusRel: [commenced] });
  check('commencing needs the start meter', !res.ok && res.text.includes('meter reading at the start'), `${res.status} ${res.text}`);
  res = await sofia.update(bookingId, { bookingStatusRel: [commenced], startMeterNum: u301.meterReadingNum });
  booking = await get(bookingId);
  check('commencing records when', res.ok && booking.lastStatus === 'Hire Commenced' && !!booking.commencedDate, `${res.status} ${res.text}`);
  check('…and puts the asset On Hire (PostSave)', await waitFor(async () => (await asset('U-301')).hireStatusRel[0].name === 'On Hire'));
  const closedStatus = await status('bookingStatus', 'Closed');
  res = await sofia.update(bookingId, { bookingStatusRel: [closedStatus], endMeterNum: u301.meterReadingNum - 5 });
  check('closing below the start meter is refused', !res.ok && res.text.includes('Lower than the start reading'), `${res.status} ${res.text}`);
  res = await sofia.update(bookingId, { bookingStatusRel: [closedStatus], endMeterNum: u301.meterReadingNum + 57 });
  booking = await get(bookingId);
  check('closing records the distance', res.ok && booking.distanceNum === 57 && !!booking.closedDate, `${res.status} ${res.text} ${booking?.distanceNum}`);
  const backU301 = await waitFor(async () => {
    const a = await asset('U-301');
    return a.hireStatusRel[0].name === 'Available For Hire' && a.meterReadingNum === u301.meterReadingNum + 57 ? a : null;
  });
  check('…and returns the asset to Available For Hire with its new meter (PostSave → asset PreSave)', !!backU301 && backU301.meterReading === `${(u301.meterReadingNum + 57).toLocaleString('en-AU')} km`, JSON.stringify((await asset('U-301')).hireStatusRel));
  res = await sofia.update(bookingId, { bookingStatusRel: [reserved] });
  check('a closed booking can’t be reopened', !res.ok && res.text.includes('from Closed to Asset Reserved'), `${res.status} ${res.text}`);

  section('Daily Driver');
  const sheet = (await get((await asset('U-305')).checkSheetRel[0].documentId)).checkItems;
  const answers = (fail) => sheet.map((c) => ({ ...c, result: c.key === 'brakes-and-handbrake' ? 'fail' : 'pass', comment: c.key === 'brakes-and-handbrake' ? fail : '' }));
  const u305 = await asset('U-305');
  const ddBase = { assetRel: [await assetValue('U-305', { checkSheetRel: 'checkSheetRel' })], driverRel: [sofia.person], checkDate: new Date().toISOString(), meterReadingNum: u305.meterReadingNum + 12 };
  res = await sofia.insert(T.dailyDriver, 'dailyDriver', { ...ddBase, checksArr: answers('') });
  check('a failed check needs a comment', !res.ok && res.text.includes('Say what is wrong with: Brakes and handbrake'), `${res.status} ${res.text}`);
  res = await sofia.insert(T.dailyDriver, 'dailyDriver', { ...ddBase, checksArr: answers('Handbrake doesn’t hold on a slope') });
  check('a defect needs describing', !res.ok && res.text.includes('Describe the defect'), `${res.status} ${res.text}`);
  const urgent = await lookup('requestPriority', 'Urgent – Asset Out of Service');
  res = await sofia.insert(T.dailyDriver, 'dailyDriver', { ...ddBase, checksArr: answers('Handbrake doesn’t hold on a slope'), defectDescription: 'Handbrake doesn’t hold on a slope.', defectPriorityRel: [urgent], serviceRequested: 'In Workshop' });
  check('…and Defect Inspection Complete ticked', !res.ok && res.text.includes('Defect Inspection Complete'), `${res.status} ${res.text}`);
  res = await sofia.insert(T.dailyDriver, 'dailyDriver', { ...ddBase, checksArr: answers('Handbrake doesn’t hold on a slope'), defectDescription: 'Handbrake doesn’t hold on a slope.', defectPriorityRel: [urgent], serviceRequested: 'In Workshop', inspectionCompleteBool: true });
  const ddId = res.json?.documentId;
  const ddDoc = ddId && (await get(ddId));
  check('a complete sheet saves as "Defects found"', res.ok && ddDoc?.ddResult === 'Defects found' && ddDoc.ddRef?.startsWith('CHK-'), `${res.status} ${res.text}`);
  const raised = await waitFor(() => docs.findOne({ appTags: 'request', 'dailyDriverRel.documentId': ddId, 'systemHeader.currentVersion': true }));
  check('it raises a Pending Daily Driver Defect request with the failed checks (PostSave)', raised?.requestStatusRel?.[0]?.name === 'Pending' && raised.requestTypeRel[0].name === 'Daily Driver Defect' && raised.priorityRel[0].name.startsWith('Urgent') && raised.reqDescription.includes('Handbrake doesn’t hold') && raised.requestRef?.startsWith('REQ-'), JSON.stringify(raised && { ref: raised.requestRef, status: raised.requestStatusRel, desc: raised.reqDescription }));
  check('an urgent defect takes the asset off hire', await waitFor(async () => (await asset('U-305')).hireStatusRel[0].name === 'Unavailable For Hire'));
  const u304 = await asset('U-304');
  res = await sofia.insert(T.dailyDriver, 'dailyDriver', { assetRel: [await assetValue('U-304', { checkSheetRel: 'checkSheetRel' })], driverRel: [sofia.person], checkDate: new Date().toISOString(), meterReadingNum: u304.meterReadingNum - 500, checksArr: sheet.map((c) => ({ ...c, result: 'pass', comment: '' })) });
  const lowDd = res.json?.documentId && (await get(res.json.documentId));
  check('a reading below the asset meter is kept but flagged, not applied', res.ok && lowDd.meterExcludedBool === true && lowDd.meterExcludedReason.includes('Primary Meter < Asset Meter') && (await asset('U-304')).meterReadingNum === u304.meterReadingNum, `${res.status} ${res.text}`);

  section('Workshop');
  res = await sofia.update(raised.documentId, { requestStatusRel: [await status('requestStatus', 'Open')] });
  check('a driver can’t triage a request', !res.ok && res.text.includes('Only a workshop supervisor'), `${res.status} ${res.text}`);
  const priya = await as('priya');
  res = await priya.update(raised.documentId, { expectedStartDate: new Date(now + HOUR).toISOString(), expectedCompletionDate: new Date(now + 6 * HOUR).toISOString() });
  let req = await get(raised.documentId);
  check('a supervisor setting the expected dates opens it (FLEET: Pending → Open)', res.ok && req.requestStatusRel[0].name === 'Open' && req.lastStatus === 'Open', `${res.status} ${res.text} ${req.requestStatusRel[0].name}`);
  res = await priya.update(raised.documentId, { requestStatusRel: [await status('requestStatus', 'Closed')] });
  check('moves outside the workflow are refused (Open → Closed)', !res.ok && res.text.includes('from Open to Closed'), `${res.status} ${res.text}`);
  res = await priya.update(raised.documentId, { requestStatusRel: [await status('requestStatus', 'Drop Off')] });
  req = await get(raised.documentId);
  check('Drop Off records when', res.ok && !!req.dropOffDate, `${res.status} ${res.text}`);
  const tom = await as('tom');
  const repair = await lookup('workOrderType', 'Repair');
  const newWo = await status('workOrderStatus', 'New');
  const pads = await named('material', 'Brake pads, rear (ute)');
  const lines = [
    { id: 'p1', kind: 'part', description: pads.nameId, materialRel: [{ documentId: pads.documentId, name: pads.nameId, partNo: pads.partNo }], qty: 1, unit: 'set', unitCost: pads.unitCost },
    { id: 'l1', kind: 'labour', description: 'Adjust handbrake, replace rear pads', qty: 1.5, unit: 'h', unitCost: 120 },
  ];
  res = await tom.insert(T.workOrder, 'workOrder', { requestRel: [{ documentId: req.documentId, name: req.systemHeader.summaryName, requestRef: req.requestRef, assetRel: req.assetRel }], workOrderTypeRel: [repair], workOrderStatusRel: [newWo], assignedToRel: [tom.person], lineItemsArr: lines });
  const woId = res.json?.documentId;
  let wo = woId && (await get(woId));
  const totals = lineTotals(lines, 0.1);
  check('a work order takes its asset from the request and totals from the shared lineTotals', res.ok && wo.assetRel?.[0]?.assetId === 'U-305' && wo.totalCost === totals.total && wo.partsTotal === totals.parts && wo.workOrderRef?.startsWith('WO-'), `${res.status} ${res.text} ${JSON.stringify(wo && { asset: wo.assetRel, total: wo.totalCost })}`);
  res = await tom.update(woId, { workOrderStatusRel: [await status('workOrderStatus', 'In Progress')] });
  check('starting it…', res.ok, `${res.status} ${res.text}`);
  check('…puts the request In Progress (work order PostSave → request PreSave)', await waitFor(async () => (await get(raised.documentId)).requestStatusRel[0].name === 'In Progress'));
  res = await tom.update(woId, { workOrderStatusRel: [await status('workOrderStatus', 'Complete')] });
  check('completing needs the work described', !res.ok && res.text.includes('Describe the Work Completed'), `${res.status} ${res.text}`);
  res = await tom.update(woId, { workOrderStatusRel: [await status('workOrderStatus', 'Complete')], workCompleted: 'Rear pads replaced, handbrake adjusted and tested on the ramp.' });
  wo = await get(woId);
  check('completing records when', res.ok && !!wo.completedDate, `${res.status} ${res.text}`);
  check('…the request is Work Complete once its last work order is (PostSave)', await waitFor(async () => (await get(raised.documentId)).requestStatusRel[0].name === 'Work Complete'));
  check('…and used parts come out of stock', await waitFor(async () => (await get(pads.documentId)).qtyAvailable === pads.qtyAvailable - 1));
  res = await priya.update(raised.documentId, { requestStatusRel: [await status('requestStatus', 'Pick Up')] });
  check('Pick Up releases the asset (request PostSave)', res.ok && (await waitFor(async () => (await asset('U-305')).hireStatusRel[0].name === 'Available For Hire')), `${res.status} ${res.text}`);
  res = await priya.update(raised.documentId, { requestStatusRel: [await status('requestStatus', 'Closed')] });
  req = await get(raised.documentId);
  check('closing records the downtime', res.ok && !!req.closedDate && typeof req.downTimeHours === 'number', `${res.status} ${res.text}`);

  section('Preventive maintenance');
  const e151 = await asset('E-151');
  const pmRequest = await docs.findOne({ appTags: 'request', 'assetRel.assetId': 'E-151', 'requestStatusRel.name': 'Open', 'systemHeader.currentVersion': true });
  const plan = await get(e151.servicePlanRel[0].documentId);
  const filter = await named('material', 'Cabin filter');
  const pmLines = [{ id: 'c1', kind: 'part', description: filter.nameId, materialRel: [{ documentId: filter.documentId, name: filter.nameId, partNo: filter.partNo }], qty: 1, unit: 'ea', unitCost: filter.unitCost }, { id: 'l2', kind: 'labour', description: 'EV service', qty: 1, unit: 'h', unitCost: 120 }];
  res = await tom.insert(T.workOrder, 'workOrder', {
    requestRel: [{ documentId: pmRequest.documentId, name: pmRequest.systemHeader.summaryName, requestRef: pmRequest.requestRef, assetRel: pmRequest.assetRel }],
    workOrderTypeRel: [await lookup('workOrderType', 'PM Service')], workOrderStatusRel: [newWo], assignedToRel: [tom.person], lineItemsArr: pmLines,
    serviceChecksArr: plan.tasks.map((t) => ({ ...t, result: '', comment: '' })),
  });
  const pmId = res.json?.documentId;
  await tom.update(pmId, { workOrderStatusRel: [await status('workOrderStatus', 'In Progress')] });
  const doneAt = new Date().toISOString();
  res = await tom.update(pmId, { workOrderStatusRel: [await status('workOrderStatus', 'Complete')], workCompleted: 'EV service done.', dateAtService: doneAt, meterAtServiceNum: e151.meterReadingNum + 9 });
  check('a PM Service can’t complete with service checks unanswered', !res.ok && res.text.includes('Answer every service check'), `${res.status} ${res.text}`);
  res = await tom.update(pmId, { workOrderStatusRel: [await status('workOrderStatus', 'Complete')], workCompleted: 'EV service done.', dateAtService: doneAt, meterAtServiceNum: e151.meterReadingNum + 9, serviceChecksArr: plan.tasks.map((t) => ({ ...t, result: 'pass', comment: '' })) });
  check('with them answered it completes', res.ok, `${res.status} ${res.text}`);
  const expected = nextServiceDue({ serviceDate: doneAt, serviceMeter: e151.meterReadingNum + 9, dueDate: e151.serviceDueDate, dueMeter: e151.serviceDueMeterNum, intervalWeeks: plan.intervalWeeks, intervalMeter: plan.intervalMeter });
  const serviced = await waitFor(async () => {
    const a = await asset('E-151');
    return sameSecond(a.lastServiceDate, doneAt) ? a : null;
  });
  check(
    'the asset’s next service is rescheduled by the shared nextServiceDue (PostSave)',
    !!serviced && sameSecond(serviced.serviceDueDate, expected.dueDate) && serviced.serviceDueMeterNum === expected.dueMeter && serviced.serviceWarning === 'Not Due' && serviced.meterReadingNum === e151.meterReadingNum + 9,
    JSON.stringify({ got: serviced && { date: serviced.serviceDueDate, meter: serviced.serviceDueMeterNum, warning: serviced.serviceWarning }, expected }),
  );

  section('Fuel');
  const u302 = await asset('U-302');
  res = await sofia.insert(T.fuelReceipt, 'fuelReceipt', { assetRel: [await assetValue('U-302')], driverRel: [sofia.person], fuelDate: new Date().toISOString(), meterReadingNum: u302.meterReadingNum + 300, litresNum: 120, costNum: 242.4 });
  const flagged = res.json?.documentId && (await get(res.json.documentId));
  check('more litres than the tank holds is flagged, and the meter isn’t applied', res.ok && flagged.fuelFlagsText.includes('Tank Capacity Exceeded') && (await asset('U-302')).meterReadingNum === u302.meterReadingNum, `${res.status} ${res.text}`);
  res = await sofia.insert(T.fuelReceipt, 'fuelReceipt', { assetRel: [await assetValue('U-302')], driverRel: [sofia.person], fuelDate: new Date(Date.now() + 60_000).toISOString(), meterReadingNum: u302.meterReadingNum + 640, litresNum: 38, costNum: 76.76 });
  const clean = res.json?.documentId && (await get(res.json.documentId));
  check('a clean receipt works out L/100 km and updates the meter', res.ok && clean.fuelFlagsText === '' && clean.consumptionNum === Math.round((38 / 340) * 1000) / 10 && (await waitFor(async () => (await asset('U-302')).meterReadingNum === u302.meterReadingNum + 640)), `${res.status} ${res.text} ${clean?.consumptionNum}`);

  section('Assets');
  res = await sofia.update(u301.documentId, { assetStatusRel: [await status('assetStatus', 'Decommission')] });
  check('only an Asset Manager changes the lifecycle', !res.ok && res.text.includes('Only an Asset Manager'), `${res.status} ${res.text}`);
  const olivia = await as('olivia');
  res = await olivia.update(u301.documentId, { assetId: 'v-202' });
  check('IDs are unique (case-insensitive)', !res.ok && res.text.includes('Asset ID V-202 is already used'), `${res.status} ${res.text}`);
  res = await olivia.update(u301.documentId, { trackerSerial: (await asset('V-201')).trackerSerial });
  check('trackers are unique', !res.ok && res.text.includes('Tracker Device Must Be Unique'), `${res.status} ${res.text}`);
  res = await olivia.update(u301.documentId, { purchasePrice: 4800, purchaseDate: '2023-03-01T00:00:00.000Z', replacementCycleMonths: 60 });
  const priced = await asset('U-301');
  check('financial class and replacement due follow the purchase', res.ok && priced.financialClass === 'Minor Plant' && priced.replacementDueDate?.startsWith('2028-03-01'), `${res.status} ${res.text} ${priced.financialClass} ${priced.replacementDueDate}`);
} catch (error) {
  check('rules test ran to completion', false, error.stack);
} finally {
  await demo.finish();
}
console.log('The demo database now holds this run\'s records: pnpm db:setup --reset to start clean.');

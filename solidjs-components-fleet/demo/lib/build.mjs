// Assembles every document of the fleet demo database: lookups, sites, people, the fleet, three weeks
// of bookings behind and two ahead, workshop requests and work orders, Daily Driver checks, fuel
// receipts, the templates and rulesets, and the platform documents.
//
// Data is generated around "now" with a seeded random generator, so every seed tells the same story
// relative to the day it runs: hires out now, two overdue, services due, a forklift in the workshop.
// Derived values (hire cost, next service, checklist results, fuel flags, line totals) come from the
// same functions the rulesets use, so seeded records look exactly as if they had been saved.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentRepos, DocumentSet, header, menuGroup, menuItem, related, SYSTEM } from '@solidjs-components/platform/documents';
import { LOOKUP_FIELDS, STATUS_FIELDS } from '@solidjs-components/platform/form-parts';
import { appDocuments, boxRing, companyClock, iso, pointGeo, polygonGeo, random, slug } from '@solidjs-components/platform/seed-kit';
import { hireCost, hireHours } from '../../packages/fleet-kit/src/logic/booking.ts';
import { checklistOutcome } from '../../../solidjs-components-shared/packages/kit/src/domain/checklist.ts';
import { fuelCheck } from '../../packages/fleet-kit/src/logic/meter.ts';
import { lineTotals } from '../../packages/fleet-kit/src/logic/money.ts';
import { nextServiceDue, serviceWarning } from '../../packages/fleet-kit/src/logic/service.ts';
import {
  ASSET_TYPES, ASSETS, CHECK_SHEETS, DESTINATIONS, IN_WORKSHOP, LOCATIONS, LOOKUP_VALUES, MATERIALS, PEOPLE, POOLS, SERVICE_PLANS, STATUSES,
} from './catalog.mjs';
import {
  ASSET_VALUE_FIELDS, COUNTERS, DEMO_PASSWORD, fleetId, KEYS, LABOUR_RATE, LOOKUPS, MAX_BOOKING_HOURS, RULESETS, T, TIME_ZONE,
} from './model.mjs';
import * as rules from './rules.mjs';
import { HOME_BY_TYPE, menuFor, q, templateComponents } from './templates.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Builds the fleet demo documents.
 * @param {{ now?: Date, urlRoot?: string }} [options]
 * @returns {{ documents: Record<string, any>[], people: { name: string, email: string, role: string }[], urls: Record<string, string>, password: string }}
 */
export function buildDemo({ now = new Date(), urlRoot = 'http://localhost:3001' } = {}) {
  const NOW = now.getTime();
  const rand = random(20261104);

  // Company time: a wall-clock time in Sydney, `dayOffset` days from today there.
  const { at, weekday } = companyClock({ now: NOW, timeZone: TIME_ZONE });

  const seededAt = new Date(at(-120, 8));
  const adminId = fleetId('account', 'olivia');
  const set = new DocumentSet({ at: seededAt, by: adminId });
  const add = (doc) => set.add(doc);
  const { doc, statusValues, lookupValues } = appDocuments({ set, app: 'fleet', idOf: fleetId, at: seededAt, by: adminId });

  // ---------------------------------------------------------------------------------- lookups
  const statuses = {};
  for (const [kind, list] of Object.entries(STATUSES)) statuses[kind] = statusValues(kind, T[`lookup_${kind}`], list);
  const values = {};
  const lookupList = (kind, names, extra) => (values[kind] = lookupValues(kind, T[`lookup_${kind}`], names, extra));
  for (const [kind, names] of Object.entries(LOOKUP_VALUES)) lookupList(kind, names);
  lookupList('licence', ['C', 'LR', 'MR', 'HR', 'LF', 'EWP', 'EX'], (name) => ({
    description: { C: 'Car', LR: 'Light rigid', MR: 'Medium rigid', HR: 'Heavy rigid', LF: 'Forklift high risk licence', EWP: 'Elevating work platform', EX: 'Excavator (VOC)' }[name],
  }));
  lookupList('pool', POOLS.map((p) => p.name), () => ({ poolType: 'General' }));
  const poolValue = (key) => values.pool[POOLS.find((p) => p.key === key).name];

  // ---------------------------------------------------------------------------------- sites
  const locations = {};
  const locationValue = {};
  LOCATIONS.forEach((l, i) => {
    const d = doc('location', T.location, l.name, {
      nameId: l.name, code: l.code, locationType: l.type, indexNum: (i + 1) * 10, inactiveBool: false,
      addressGeo: pointGeo(l.at, { suburb: l.suburb, postcode: l.postcode, state: 'NSW', label: `${l.suburb} NSW ${l.postcode}` }),
      boundaryGeo: polygonGeo(boxRing(l.at)),
    });
    locations[l.key] = d;
    locationValue[l.key] = related(d, LOOKUP_FIELDS);
  });
  const near = ([lon, lat], spread = 0.0009) => [Math.round((lon + (rand.next() - 0.5) * spread) * 1e6) / 1e6, Math.round((lat + (rand.next() - 0.5) * spread * 0.7) * 1e6) / 1e6];

  // ------------------------------------------------------------------- sheets, plans, materials
  const sheetValue = {};
  Object.entries(CHECK_SHEETS).forEach(([key, sheet], i) => {
    const d = doc('checkSheet', T.checkSheet, sheet.name, {
      nameId: sheet.name, indexNum: (i + 1) * 10, inactiveBool: false,
      checkItems: sheet.items.map(([question, category, mandatory, instruction]) => ({ key: slug(question).slice(0, 40), question, category, ...(mandatory ? { mandatory: true } : {}), ...(instruction ? { instruction } : {}) })),
    });
    sheetValue[key] = related(d, LOOKUP_FIELDS);
  });
  const planValue = {};
  const plans = {};
  Object.entries(SERVICE_PLANS).forEach(([key, plan], i) => {
    const d = doc('servicePlan', T.servicePlan, plan.name, {
      nameId: plan.name, indexNum: (i + 1) * 10, inactiveBool: false, intervalWeeks: plan.weeks, intervalMeter: plan.meter, leadWeeks: plan.leadWeeks, leadMeter: plan.leadMeter,
      tasks: plan.tasks.map((question) => ({ key: slug(question).slice(0, 40), question, category: 'Service', mandatory: true })),
    });
    plans[key] = d;
    planValue[key] = related(d, { weeks: 'intervalWeeks', meter: 'intervalMeter', leadWeeks: 'leadWeeks', leadMeter: 'leadMeter' });
  });
  const materials = {};
  MATERIALS.forEach(([name, partNo, unit, unitCost, qty, threshold, store], i) => {
    materials[partNo] = doc('material', T.material, name, {
      nameId: name, partNo, unit, unitCost, qtyAvailable: qty, reorderThreshold: threshold, reorderBool: qty <= threshold,
      storeLocationRel: [locationValue[store]], indexNum: (i + 1) * 10, inactiveBool: false,
    });
  });

  // ------------------------------------------------------------------------------ asset types
  const typeValue = {};
  const types = {};
  ASSET_TYPES.forEach((t, i) => {
    const d = doc('assetType', T.lookup_assetType, t.name, {
      nameId: t.name, indexNum: (i + 1) * 10, inactiveBool: false, iconKind: t.kind, assetClass: t.cls, primaryMeter: t.meter, requiredLicence: t.licence,
      checkSheetRel: [sheetValue[t.sheet]], servicePlanRel: [planValue[t.plan]], maxBookingHours: t.maxHours, hireRateHourly: t.hourly, hireRateDaily: t.daily,
      fuelTypeRel: t.fuel ? [values.fuelType[t.fuel]] : [], tankCapacityL: t.tank || null, rangeKm: t.range || null,
    });
    types[t.key] = { ...t, doc: d };
    typeValue[t.key] = related(d, {
      iconKind: 'iconKind', assetClass: 'assetClass', primaryMeter: 'primaryMeter', requiredLicence: 'requiredLicence', maxBookingHours: 'maxBookingHours',
      hireRateHourly: 'hireRateHourly', hireRateDaily: 'hireRateDaily', checkSheetRel: 'checkSheetRel', servicePlanRel: 'servicePlanRel', fuelTypeRel: 'fuelTypeRel',
      tankCapacityL: 'tankCapacityL', rangeKm: 'rangeKm',
    });
  });

  // ---------------------------------------------------------------------------------- people
  const people = {};
  const personValue = (key) => ({ documentId: people[key].documentId, name: people[key].name, email: people[key].email, accountType: people[key].type });
  const authorValue = (key) => ({ documentId: people[key].documentId, name: people[key].name });
  for (const p of PEOPLE) {
    const email = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';
    const account = set.account({
      id: fleetId('account', p.key),
      securityId: fleetId('accountSecurity', p.key),
      controlId: fleetId('accountControl', p.key),
      first: p.first,
      last: p.last,
      email,
      title: p.title,
      password: DEMO_PASSWORD,
      adminKey: KEYS.admin,
      accessKeys: p.keys.map((k) => KEYS[k]),
      fields: {
        accountType: p.type,
        poolsRel: p.pools.map(poolValue),
        licencesRel: p.licences.map((l) => values.licence[l]),
        licenceExpiryDate: iso(at(p.key === 'noah' ? 20 : 300 + rand.int(0, 700), 0)),
        departmentRel: [values.department[p.department]],
        homeLocationRel: [locationValue[p.home]],
        phone: `04${rand.int(10, 99)} ${rand.int(100, 999)} ${rand.int(100, 999)}`,
        defaultURL: HOME_BY_TYPE[p.type],
        menu: menuFor(p.type, { menuItem, menuGroup }),
      },
    });
    people[p.key] = { ...p, name: `${p.first} ${p.last}`, email, documentId: account.documentId };
  }
  locations.alexandria.managerRel = [personValue('marcus')];
  locations['alexandria-ws'].managerRel = [personValue('priya')];
  locations.wetherill.managerRel = [personValue('priya')];
  const peopleIn = (pool, licence) =>
    PEOPLE.filter((p) => p.pools.includes(pool) && !['Administrator', 'Asset Manager'].includes(p.type))
      .filter((p) => !licence || p.licences.includes(licence) || (['LR', 'MR'].includes(licence) && p.licences.some((h) => ['MR', 'HR'].includes(h))))
      .map((p) => p.key);

  // ---------------------------------------------------------------------------------- assets
  const PURCHASE = { car: 34000, ev: 52000, van: 48000, ute: 56000, 'light-truck': 92000, rigid: 145000, trailer: 6500, forklift: 38000, lift: 29000, excavator: 64000, generator: 21000 };
  const CYCLE = { car: 60, ev: 72, van: 72, ute: 72, 'light-truck': 96, rigid: 120, trailer: 120, forklift: 120, lift: 120, excavator: 96, generator: 96 };
  const COLOURS = ['White', 'White', 'Silver', 'Grey', 'Blue', 'White', 'Black'];
  const assets = {};
  ASSETS.forEach(([id, typeKey, make, model, year, rego, home, pool, lifecycle, meter], index) => {
    const type = types[typeKey];
    const plan = plans[type.plan];
    const isPlant = type.cls === 'Plant' || type.cls === 'Yellow Plant';
    const workshop = ['Heavy Vehicle', 'Plant', 'Yellow Plant'].includes(type.cls) && home !== 'alexandria' ? 'wetherill' : 'alexandria-ws';
    // Service state: some overdue, some due soon, most not due (by date or meter).
    const state = index % 9 === 4 ? 'overdue' : index % 5 === 1 ? 'soon' : 'ok';
    const weeks = plan.intervalWeeks;
    const lastServiceDays = state === 'overdue' ? weeks * 7 + rand.int(3, 30) : state === 'soon' ? weeks * 7 - rand.int(4, 24) : rand.int(20, Math.max(25, weeks * 7 - 60));
    const interval = plan.intervalMeter;
    const sinceService = state === 'overdue' ? interval * 1.04 : state === 'soon' ? interval - plan.leadMeter * 0.6 : rand.int(Math.round(interval * 0.05), Math.round(interval * 0.6));
    const lastServiceMeter = interval ? Math.max(0, Math.round(meter - sinceService)) : null;
    const lastServiceDate = iso(at(-lastServiceDays, 10));
    const due = nextServiceDue({ serviceDate: lastServiceDate, serviceMeter: lastServiceMeter, intervalWeeks: weeks, intervalMeter: plan.intervalMeter || null });
    const purchased = new Date(Date.UTC(year, rand.int(0, 10), rand.int(1, 27)));
    const replacementDue = new Date(purchased);
    replacementDue.setUTCMonth(replacementDue.getUTCMonth() + CYCLE[typeKey]);
    const regDays = id === 'T-405' ? -6 : ['V-203', 'C-101', 'TR-502'].includes(id) ? rand.int(5, 26) : rand.int(40, 330);
    const price = Math.round(PURCHASE[typeKey] * (0.9 + rand.next() * 0.25));
    const responsible = ['U-301', 'U-304'].includes(id) ? (id === 'U-301' ? 'liam' : 'noah') : null;
    const d = doc('asset', T.asset, `${id} · ${make} ${model}${rego ? ` · ${rego}` : ''}`, {
      assetId: id, make, model, makeModel: `${make} ${model}`, yearNum: year, registration: rego, vin: isPlant ? '' : `JT${rand.int(100000000, 999999999)}${String.fromCharCode(65 + rand.int(0, 25))}${rand.int(1000, 9999)}`,
      colour: rand.pick(COLOURS), assetName: [id, make, model, rego].filter(Boolean).join(' '),
      assetTypeRel: [typeValue[typeKey]], iconKind: type.kind, assetClass: type.cls, requiredLicence: type.licence,
      assetStatusRel: [statuses.assetStatus[lifecycle]], lastStatus: lifecycle,
      hireStatusRel: [statuses.hireStatus[lifecycle === 'Active' ? 'Available For Hire' : 'Unavailable For Hire']],
      allocationStatus: responsible ? (id === 'U-301' ? 'Permanently Assigned' : 'Temporary Allocation') : 'Unassigned',
      responsiblePersonRel: responsible ? [personValue(responsible)] : [],
      responsibleWorkshopRel: [locationValue[workshop]], locationRel: [locationValue[home]],
      departmentRel: [values.department[{ field: 'Field Services', corporate: 'Corporate', logistics: 'Logistics', plant: 'Field Services' }[pool]]],
      poolsRel: [poolValue(pool)],
      fuelTypeRel: type.fuel ? [values.fuelType[type.fuel]] : [], tankCapacityL: type.tank || null, rangeKm: type.range || null,
      primaryMeterUnit: type.meter, meterReadingNum: meter, meterReadingDate: iso(NOW - rand.int(1, 40) * HOUR),
      servicePlanRel: [planValue[type.plan]], lastServiceDate, lastServiceMeterNum: lastServiceMeter,
      serviceDueDate: due.dueDate ?? null, serviceDueMeterNum: due.dueMeter ?? null,
      regDueDate: isPlant ? null : iso(at(regDays, 0)), insuranceDueDate: isPlant ? null : iso(at(regDays + rand.int(0, 40), 0)),
      purchaseDate: purchased.toISOString(), purchasePrice: price, financialClass: price > 5000 ? 'Major Plant' : 'Minor Plant',
      replacementCycleMonths: CYCLE[typeKey], replacementDueDate: replacementDue.toISOString(), currentValue: Math.round(price * Math.max(0.15, 1 - (2026 - year) * 0.13)),
      bookableBool: lifecycle === 'Active', maxBookingHours: type.maxHours, hireRateHourly: type.hourly, hireRateDaily: type.daily,
      dailyDriverRequiredBool: !isPlant || typeKey === 'forklift', checkSheetRel: [sheetValue[type.sheet]],
      trackerSerial: isPlant || typeKey === 'trailer' ? '' : `TRK-${40000 + index * 7}`, includeInMapBool: lifecycle !== 'Disposed',
      locationGeo: pointGeo(near(LOCATIONS.find((l) => l.key === home).at), { label: LOCATIONS.find((l) => l.key === home).name, source: 'telematics', recordedDate: iso(NOW - rand.int(5, 300) * 60_000) }),
      lastPositionDate: iso(NOW - rand.int(5, 300) * 60_000),
      notesCommentsArr: [],
    });
    assets[id] = { doc: d, type, typeKey, pool, home, workshop, meter, plan };
  });
  const assetRelOf = (id, extra = {}) => [related(assets[id].doc, { ...ASSET_VALUE_FIELDS, ...extra })];

  // ------------------------------------------------------------------------ workshop requests
  const requests = [];
  const workOrders = [];
  const blocks = {}; // asset id → [[start, end]] the generator keeps bookings out of
  const block = (id, start, end) => (blocks[id] = [...(blocks[id] ?? []), [start, end]]);
  const line = (partNo, qty) => {
    const m = materials[partNo];
    return { id: fleetId('line', `${partNo}:${workOrders.length}:${qty}`), kind: 'part', description: m.nameId, materialRel: [{ documentId: m.documentId, name: m.nameId, partNo }], qty, unit: m.unit, unitCost: m.unitCost };
  };
  const labour = (hours, description = 'Labour') => ({ id: fleetId('line', `labour:${workOrders.length}:${hours}:${description}`), kind: 'labour', description, qty: hours, unit: 'h', unitCost: LABOUR_RATE });
  const tasksDone = (plan, all = true) => plan.tasks.map((t) => ({ ...t, result: all ? 'pass' : '', comment: '' }));

  /** A request with its work orders; dates in company time. */
  const request = (spec) => {
    const n = requests.length + 1;
    const ref = `REQ-${n}`;
    const asset = assets[spec.asset];
    const created = spec.created;
    const statusName = spec.status;
    const d = doc('request', T.request, `${ref}: ${spec.asset} ${spec.type}`, {
      requestRef: ref,
      assetRel: assetRelOf(spec.asset, { responsibleWorkshopRel: 'responsibleWorkshopRel' }),
      requestTypeRel: [values.requestType[spec.type]],
      priorityRel: [values.requestPriority[spec.urgent ? 'Urgent – Asset Out of Service' : 'Non-Urgent – Asset Operational']],
      requestReasonRel: [values.requestReason[spec.reason]],
      requestStatusRel: [statuses.requestStatus[statusName]], lastStatus: statusName, transition: null,
      reqDescription: spec.description,
      requestedByRel: [personValue(spec.by)],
      workshopRel: [locationValue[asset.workshop]],
      assignedToRel: spec.assigned ? [personValue(spec.assigned)] : [],
      expectedStartDate: spec.start ? iso(spec.start) : null,
      expectedCompletionDate: spec.end ? iso(spec.end) : null,
      disableBooking: spec.disable ?? 'Auto Disable',
      bookingConflicts: 'None',
      dropOffDate: spec.dropOff ? iso(spec.dropOff) : null,
      startedDate: spec.started ? iso(spec.started) : null,
      workCompleteDate: spec.workComplete ? iso(spec.workComplete) : null,
      closedDate: spec.closed ? iso(spec.closed) : null,
      downTimeHours: spec.closed && (spec.dropOff || spec.started) ? Math.round(((spec.workComplete ?? spec.closed) - (spec.dropOff ?? spec.started)) / HOUR * 10) / 10 : null,
      closeReasonRel: spec.closeReason ? [values.closeReason[spec.closeReason]] : [],
      dailyDriverRel: [],
      createdDate: iso(created), createdByRel: [authorValue(spec.by)], updatedDate: iso(spec.closed ?? spec.workComplete ?? spec.started ?? created), updatedByRel: [authorValue(spec.assigned ?? spec.by)],
      notesCommentsArr: (spec.notes ?? []).map(([by, time, detail], i) => ({ dataId: fleetId('note', `${ref}:${i}`), detail, createdBy: authorValue(by), createdDate: iso(time) })),
    }, { id: fleetId('request', ref), created: new Date(created), by: people[spec.by].documentId });
    requests.push(d);
    // The asset is off hire while it is in the workshop (or booking is disabled), now and in the past.
    if (IN_WORKSHOP.includes(statusName) || (spec.disable === 'Disable' && ['Open', 'Pending'].includes(statusName))) {
      asset.doc.hireStatusRel = [statuses.hireStatus['Unavailable For Hire']];
    }
    const visitStart = spec.dropOff ?? spec.started ?? spec.start;
    const visitEnd = spec.workComplete ?? spec.end;
    if (['Drop Off', 'In Progress', 'Work Complete', 'Pick Up', 'Closed'].includes(statusName) && visitStart) block(spec.asset, visitStart, Math.max(visitEnd ?? 0, ['Closed', 'Pick Up'].includes(statusName) ? 0 : NOW + 2 * DAY));
    else if (['Open', 'Pending'].includes(statusName) && spec.disable !== 'Do Not Disable') block(spec.asset, spec.start ?? created, spec.end ?? NOW + 3 * DAY);
    for (const wo of spec.workOrders ?? []) {
      const m = workOrders.length + 1;
      const woRef = `WO-${m}`;
      const totals = lineTotals(wo.lines ?? [], 0.1);
      const pm = wo.type === 'PM Service';
      const w = doc('workOrder', T.workOrder, `${woRef}: ${wo.type} (${ref})`, {
        workOrderRef: woRef,
        requestRel: [{ documentId: d.documentId, name: d.systemHeader.summaryName, requestRef: ref, assetRel: d.assetRel }],
        assetRel: assetRelOf(spec.asset, { servicePlanRel: 'servicePlanRel' }),
        workOrderTypeRel: [values.workOrderType[wo.type]],
        workOrderStatusRel: [statuses.workOrderStatus[wo.status]], lastStatus: wo.status, transition: null,
        assignedToRel: [personValue(wo.assigned ?? spec.assigned ?? 'tom')],
        estimatedLabourHours: wo.estimate ?? 2,
        serviceChecksArr: pm ? tasksDone(asset.plan, wo.status === 'Complete') : [],
        lineItemsArr: wo.lines ?? [],
        partsTotal: totals.parts, labourTotal: totals.labour, labourHours: totals.labourHours, taxTotal: totals.tax, totalCost: totals.total,
        meterAtServiceNum: wo.meter ?? null, dateAtService: wo.completed ? iso(wo.completed) : null,
        workCompleted: wo.done ?? '', technicianReport: wo.report ?? '', onHoldReason: wo.onHold ?? '',
        startedDate: wo.started ? iso(wo.started) : null, completedDate: wo.completed ? iso(wo.completed) : null,
        createdDate: iso(wo.created ?? created), createdByRel: [authorValue('priya')], updatedDate: iso(wo.completed ?? wo.started ?? created), updatedByRel: [authorValue(wo.assigned ?? 'tom')],
        notesCommentsArr: [],
      }, { id: fleetId('workOrder', woRef), created: new Date(wo.created ?? created), by: people.priya.documentId });
      workOrders.push(w);
    }
    return d;
  };

  const lightService = (id, meter) => [line('OF-LV-90915', 1), line('OIL-5W30', 6), labour(1.5, 'PM service labour')];
  const truckService = () => [line('OF-HV-1R0739', 1), line('OIL-15W40', 14), line('FF-HV-326', 1), labour(3, 'Heavy service labour')];

  // Closed services in the last weeks: the service records behind the assets' last service dates.
  for (const [id, info] of Object.entries(assets)) {
    const last = new Date(info.doc.lastServiceDate).getTime();
    if (NOW - last > 30 * DAY || info.doc.assetStatusRel[0].name !== 'Active') continue;
    const day = Math.round((last - at(0, 10)) / DAY);
    const heavy = info.type.cls === 'Heavy Vehicle';
    request({
      asset: id, type: 'Service Request', reason: 'Scheduled Maintenance', status: 'Closed', by: 'priya', assigned: heavy ? 'jack' : 'tom',
      description: `${info.plan.nameId} due.`, created: at(day - 6, 8), start: at(day, 7, 30), end: at(day, 15), dropOff: at(day, 7, 40), started: at(day, 8), workComplete: at(day, 14), closed: at(day, 16),
      workOrders: [{ type: 'PM Service', status: 'Complete', assigned: heavy ? 'jack' : 'tom', lines: heavy ? truckService() : lightService(), meter: info.doc.lastServiceMeterNum, started: at(day, 8), completed: at(day, 14), done: `${info.plan.nameId} completed. No issues found.` }],
    });
  }

  request({
    asset: 'T-401', type: 'Accident Damage', reason: 'Damage', status: 'Closed', by: 'daniel', assigned: 'jack', created: at(-15, 16),
    description: 'Reversed into a bollard at the Mascot loading dock. Rear left tail light and bumper damaged; tailgate closes.',
    start: at(-14, 8), end: at(-12, 16), dropOff: at(-14, 8), started: at(-14, 9), workComplete: at(-12, 12), closed: at(-12, 15),
    workOrders: [
      { type: 'Accident Data Collection', status: 'Complete', assigned: 'priya', lines: [labour(0.5, 'Photos, report and insurer details')], started: at(-14, 9), completed: at(-14, 10), done: 'Report and photos sent to the insurer (claim 7741).' },
      { type: 'Repair', status: 'Complete', assigned: 'jack', lines: [labour(4, 'Replace rear bumper and tail light'), { id: fleetId('line', 'bumper'), kind: 'other', description: 'Rear bumper and tail light assembly (supplier)', qty: 1, unit: 'ea', unitCost: 612 }], started: at(-13, 8), completed: at(-12, 12), done: 'Rear bumper and LH tail light replaced; lights tested.' },
    ],
    notes: [['priya', at(-14, 9, 10), 'Insurer approved the repair this morning. Parts arrive tomorrow.']],
  });

  // In the workshop now.
  request({
    asset: 'V-202', type: 'Repair/General Request', reason: 'Breakdown', status: 'In Progress', urgent: true, by: 'sofia', assigned: 'tom', created: at(-1, 15, 20),
    description: 'Grinding noise from the front brakes when stopping, worse downhill. Brake warning light came on near Burwood.',
    start: at(-1, 16), end: at(1, 12), dropOff: at(-1, 16, 30), started: at(0, 7, 45),
    workOrders: [
      { type: 'Diagnose', status: 'Complete', assigned: 'tom', lines: [labour(0.75, 'Inspect brakes')], started: at(0, 7, 45), completed: at(0, 8, 30), done: 'Front pads worn to the backing plate; discs within tolerance.' },
      { type: 'Repair', status: 'In Progress', assigned: 'tom', lines: [line('BP-VAN-F', 1), labour(1.5, 'Replace front brake pads')], started: at(0, 9), estimate: 2 },
    ],
    notes: [['tom', at(0, 8, 35), 'Pads are metal-on-metal. Discs are OK, so pads only. Back on the road tomorrow.']],
  });
  request({
    asset: 'T-403', type: 'Service Request', reason: 'Scheduled Maintenance', status: 'In Progress', by: 'priya', assigned: 'jack', created: at(-6, 9),
    description: 'Heavy Vehicle Service overdue on the meter.', start: at(-2, 7), end: at(1, 16), dropOff: at(-2, 7, 15), started: at(-2, 8),
    workOrders: [{ type: 'PM Service', status: 'On Hold', assigned: 'jack', lines: [line('OF-HV-1R0739', 1), line('OIL-15W40', 14), labour(2, 'Heavy service labour')], started: at(-2, 8), onHold: 'Waiting for a fuel filter: none in stock at Wetherill Park (ordered).', estimate: 4 }],
  });
  request({
    asset: 'U-303', type: 'Repair/General Request', reason: 'Breakdown', status: 'Work Complete', by: 'liam', assigned: 'tom', created: at(-2, 11),
    description: 'Front left tyre slow leak, sidewall bulge.', start: at(-1, 8), end: at(0, 12), dropOff: at(-1, 8), started: at(-1, 10), workComplete: at(0, 11),
    workOrders: [{ type: 'Tyres', status: 'Complete', assigned: 'tom', lines: [{ ...line('TY-2656517', 2) }, labour(1, 'Fit and balance two tyres')], started: at(-1, 10), completed: at(0, 11), done: 'Both front tyres replaced (bulge on LF), wheel alignment checked.' }],
  });
  request({
    asset: 'X-701', type: 'Repair/General Request', reason: 'Breakdown', status: 'Pick Up', by: 'grace', assigned: 'jack', created: at(-4, 14),
    description: 'Hydraulic hose to the boom weeping at the fitting.', start: at(-3, 8), end: at(-1, 16), dropOff: at(-3, 8), started: at(-3, 9), workComplete: at(-1, 15),
    workOrders: [{ type: 'Repair', status: 'Complete', assigned: 'jack', lines: [line('HYD-46', 8), labour(2.5, 'Replace boom hose')], started: at(-3, 9), completed: at(-1, 15), done: 'Boom hose replaced and hydraulic oil topped up. Ready for pick up at Wetherill Park.' }],
  });
  // Scheduled: the calendar blocks these assets out.
  request({
    asset: 'E-151', type: 'Service Request', reason: 'Scheduled Maintenance', status: 'Open', by: 'priya', assigned: 'tom', created: at(-3, 10),
    description: 'Electric Vehicle Service (annual).', start: at(weekday(2) ? 2 : 4, 8), end: at(weekday(2) ? 2 : 4, 15), disable: 'Auto Disable',
  });
  request({
    asset: 'F-601', type: 'Service Request', reason: 'Compliance', status: 'Open', by: 'priya', assigned: 'jack', created: at(-5, 10),
    description: 'Annual forklift safety inspection.', start: at(1, 7), end: at(1, 12), disable: 'Disable',
  });
  request({
    asset: 'L-652', type: 'Service Request', reason: 'Compliance', status: 'Open', by: 'priya', assigned: 'jack', created: at(-7, 10),
    description: 'Annual boom lift inspection (10-year major due next year).', start: at(-1, 7), end: at(0, 16), disable: 'Do Not Disable',
  });
  request({
    asset: 'C-104', type: 'Repair/General Request', reason: 'Breakdown', status: 'Cancelled', by: 'ava', created: at(-9, 9), closed: at(-9, 11), closeReason: 'Duplicate',
    description: 'Check engine light on (duplicate of the decommission assessment).',
  });

  // ------------------------------------------------------------------------- Daily Drivers
  const dailyDrivers = [];
  const dd = (spec) => {
    const n = dailyDrivers.length + 1;
    const ref = `${COUNTERS.dailyDriver.prefix}-${n}`;
    const asset = assets[spec.asset];
    const sheet = CHECK_SHEETS[asset.type.sheet];
    const checks = sheet.items.map(([question, category, mandatory]) => {
      const key = slug(question).slice(0, 40);
      const failed = spec.fail?.[key];
      return { key, question, category, ...(mandatory ? { mandatory: true } : {}), result: failed ? 'fail' : !mandatory && rand.chance(0.08) ? 'na' : 'pass', comment: failed ?? '' };
    });
    const outcome = checklistOutcome(checks);
    const d = doc('dailyDriver', T.dailyDriver, `${ref}: ${spec.asset} ${outcome.result}`, {
      ddRef: ref, assetRel: assetRelOf(spec.asset, { checkSheetRel: 'checkSheetRel' }), driverRel: [personValue(spec.by)], checkDate: iso(spec.time),
      meterReadingNum: spec.meter, checksArr: checks, ddResult: outcome.result, defectCount: outcome.failed,
      defectDescription: spec.defect ?? '', defectPriorityRel: spec.defect ? [values.requestPriority[spec.urgent ? 'Urgent – Asset Out of Service' : 'Non-Urgent – Asset Operational']] : [],
      serviceRequested: spec.defect ? 'In Workshop' : '', inspectionCompleteBool: !!spec.defect,
      meterExcludedBool: !!spec.excluded, meterExcludedReason: spec.excluded ? `Excluded From Asset Update: Primary Meter < Asset Meter (${asset.doc.meterReadingNum.toLocaleString('en-AU')} km).` : '',
      lastStatus: 'Submitted', transition: null,
      createdDate: iso(spec.time), createdByRel: [authorValue(spec.by)], updatedDate: iso(spec.time), updatedByRel: [authorValue(spec.by)],
    }, { id: fleetId('dailyDriver', ref), created: new Date(spec.time), by: people[spec.by].documentId });
    dailyDrivers.push(d);
    return d;
  };
  // Defects raised this morning, waiting in triage.
  const ddV206 = dd({ asset: 'V-206', by: 'noah', time: at(0, 7, 5), meter: assets['V-206'].meter, defect: 'Brake warning light on and the pedal feels soft.', urgent: true, fail: { 'brakes-and-handbrake': 'Pedal goes down further than normal', 'dashboard-warning-lights': 'Red brake warning light stays on' } });
  const ddC102 = dd({ asset: 'C-102', by: 'ava', time: at(-1, 8, 10), meter: assets['C-102'].meter - 0, defect: 'Stone chip in the windscreen, passenger side, about 5 mm.', fail: { 'windscreen-and-mirrors': 'Chip on the passenger side, not in the driver’s view' } });
  const defectRequest = (ddDoc, spec) => {
    const r = request(spec);
    r.dailyDriverRel = [{ documentId: ddDoc.documentId, name: ddDoc.systemHeader.summaryName }];
    return r;
  };
  defectRequest(ddV206, {
    asset: 'V-206', type: 'Daily Driver Defect', reason: 'Driver Defect', status: 'Pending', urgent: true, by: 'noah', created: at(0, 7, 6), disable: 'Disable',
    description: 'Brake warning light on and the pedal feels soft.\n\n- **Brakes and handbrake**: Pedal goes down further than normal\n- **Dashboard warning lights**: Red brake warning light stays on\n\nService requested: In Workshop. Raised by CHK-1.',
  });
  defectRequest(ddC102, {
    asset: 'C-102', type: 'Daily Driver Defect', reason: 'Driver Defect', status: 'Pending', by: 'ava', created: at(-1, 8, 11), disable: 'Do Not Disable',
    description: 'Stone chip in the windscreen, passenger side, about 5 mm.\n\n- **Windscreen and mirrors**: Chip on the passenger side, not in the driver’s view\n\nService requested: In Workshop. Raised by CHK-2.',
  });

  // -------------------------------------------------------------------------------- bookings
  const bookings = [];
  const PURPOSE = {
    'Client site visit': ['Quarterly service visit', 'Site survey', 'Client walk-through'],
    'Field work': ['HVAC maintenance round', 'Fire panel testing', 'Generator load test', 'Lighting retrofit', 'Plant room inspection'],
    'Delivery run': ['Parts to the Parramatta depot', 'Stock run to job sites', 'Equipment drop-off'],
    Training: ['Forklift refresher', 'Defensive driving course'],
    Maintenance: ['Move to the workshop'],
  };
  const DISTANCE = { car: [18, 140], ev: [18, 160], van: [25, 220], ute: [30, 260], 'light-truck': [40, 300], rigid: [60, 420], trailer: [0, 0], forklift: [1, 6], lift: [1, 6], excavator: [2, 7], generator: [3, 10] };
  const PROBABILITY = { car: 0.42, ev: 0.48, van: 0.6, ute: 0.6, 'light-truck': 0.4, rigid: 0.32, trailer: 0.15, forklift: 0.25, lift: 0.22, excavator: 0.25, generator: 0.2 };
  const overdueAssets = new Set(['V-203', 'U-302']);
  // Out right now whenever the seed runs (whatever the time of day), for the map and the calendar.
  const liveAssets = new Set(['V-201', 'E-152', 'T-404']);
  const liveStart = Math.floor((NOW - 2 * HOUR) / (30 * 60_000)) * 30 * 60_000;
  const clear = (id, start, end) => !(blocks[id] ?? []).some(([s, e]) => start < e && s < end);

  for (const [id, info] of Object.entries(assets)) {
    if (info.doc.assetStatusRel[0].name !== 'Active' || !info.doc.bookableBool) continue;
    const requesters = peopleIn(info.pool, info.type.licence);
    if (!requesters.length) continue;
    const plan = [];
    let cursor = at(-21, 0);
    for (let day = -21; day <= 14; day++) {
      if (!weekday(day)) continue;
      if (overdueAssets.has(id) && day >= -1 && day <= 0) continue;
      if (liveAssets.has(id) && Math.abs(at(day, 12) - NOW) < 1.5 * DAY) continue;
      if (!rand.chance(PROBABILITY[info.typeKey])) continue;
      const multiDay = ['light-truck', 'rigid', 'ute'].includes(info.typeKey) && rand.chance(0.15);
      const startHour = rand.pick([7, 7.5, 8, 8, 8.5, 9, 10, 11, 13]);
      const start = at(day, Math.floor(startHour), (startHour % 1) * 60);
      const length = multiDay ? DAY + rand.int(6, 9) * HOUR : rand.pick([2, 3, 4, 4, 5, 6, 8, 9]) * HOUR;
      const end = Math.min(start + length, at(day + (multiDay ? 1 : 0), 18));
      if (start < cursor || !clear(id, start, end)) continue;
      // Keep one free slot around now for a live demo, except on a couple of assets that are out.
      plan.push({ start, end: Math.max(end, start + HOUR) });
      cursor = end + HOUR;
      if (multiDay) day++;
    }
    if (overdueAssets.has(id)) plan.push({ start: at(id === 'V-203' ? -1 : 0, 7, 30), end: id === 'V-203' ? at(-1, 17) : NOW - 2 * HOUR, overdue: true });
    if (liveAssets.has(id) && clear(id, liveStart, liveStart + 5 * HOUR)) plan.push({ start: liveStart, end: liveStart + 5 * HOUR });
    plan.sort((a, b) => a.start - b.start);
    // Meters: the asset's meter now is after every finished or running hire.
    const [minD, maxD] = DISTANCE[info.typeKey];
    const runs = plan.map((p) => ({ ...p, distance: p.end <= NOW || p.overdue ? rand.int(minD, maxD) : 0 }));
    let meter = info.meter - runs.filter((r) => r.end <= NOW && !r.overdue).reduce((sum, r) => sum + r.distance, 0);
    for (const run of runs) {
      const person = rand.pick(requesters);
      const reason = run.overdue ? 'Field work' : rand.pick(['Client site visit', 'Field work', 'Field work', 'Delivery run', ...(info.type.cls === 'Plant' ? ['Field work'] : ['Training'])]);
      const [destName, lon, lat] = rand.pick(DESTINATIONS);
      const cancelled = !run.overdue && run.end < NOW && rand.chance(0.06);
      const live = !cancelled && run.start <= NOW && (run.end > NOW || run.overdue);
      const status = cancelled ? 'Cancelled' : live ? 'Hire Commenced' : run.end <= NOW ? 'Closed' : 'Asset Reserved';
      const startMeter = status === 'Closed' || status === 'Hire Commenced' ? meter : null;
      const endMeter = status === 'Closed' ? meter + run.distance : null;
      if (status === 'Closed') meter = endMeter;
      const closedDate = status === 'Closed' ? run.end + rand.int(-20, 25) * 60_000 : null;
      bookings.push({
        id, info, person, reason, run, status, destName, destination: [lon, lat], startMeter, endMeter, closedDate,
        created: run.start - rand.int(1, 6) * DAY - rand.int(1, 8) * HOUR,
        purpose: rand.pick(PURPOSE[reason] ?? ['Field work']), job: `JOB-${24000 + rand.int(100, 999)}`,
      });
    }
  }
  bookings.sort((a, b) => a.created - b.created);
  bookings.forEach((b, index) => {
    const ref = `BK-${index + 1}`;
    const asset = b.info.doc;
    const closed = b.closedDate;
    const commenced = b.status === 'Hire Commenced' || b.status === 'Closed' ? b.run.start + rand.int(-10, 15) * 60_000 : null;
    const hours = hireHours(b.run.start, b.run.end, closed);
    const cost = b.status === 'Cancelled' ? 0 : hireCost({ start: b.run.start, end: b.run.end, closed, hourlyRate: asset.hireRateHourly, dailyRate: asset.hireRateDaily, timeZone: TIME_ZONE });
    const d = doc('booking', T.booking, `${ref}: ${b.id} for ${people[b.person].name}`, {
      bookingRef: ref,
      bookingStatusRel: [statuses.bookingStatus[b.status]], lastStatus: b.status, transition: null,
      assetRel: assetRelOf(b.id),
      requestedByRel: [personValue(b.person)],
      startDate: iso(b.run.start), endDate: iso(b.run.end),
      bookingReasonRel: [values.bookingReason[b.reason]], jobCode: b.job, destination: `${b.purpose}, ${b.destName}`,
      destinationGeo: pointGeo(near(b.destination, 0.01), { label: b.destName }),
      bookingNotes: '',
      startMeterNum: b.startMeter, endMeterNum: b.endMeter,
      commencedDate: commenced ? iso(commenced) : null, closedDate: closed ? iso(closed) : null,
      distanceNum: b.status === 'Closed' ? b.endMeter - b.startMeter : null,
      hireDurationHours: Math.round(hours * 100) / 100, hireCost: cost,
      hireOverdueBool: b.status === 'Hire Commenced' && b.run.end < NOW,
      cancelReasonRel: b.status === 'Cancelled' ? [values.cancelReason[rand.pick(LOOKUP_VALUES.cancelReason.slice(0, 3))]] : [],
      createdDate: iso(b.created), createdByRel: [authorValue(b.person)], updatedDate: iso(closed ?? commenced ?? b.created), updatedByRel: [authorValue(b.person)],
      notesCommentsArr: b.run.overdue ? [{ dataId: fleetId('note', `${ref}:late`), detail: 'Running late: the job overran. Will drop it back at the depot as soon as I can.', createdBy: authorValue(b.person), createdDate: iso(Math.max(b.run.end - 30 * 60_000, b.run.start)) }] : [],
    }, { id: fleetId('booking', ref), created: new Date(b.created), by: people[b.person].documentId });
    b.doc = d;
    if (b.status === 'Hire Commenced') {
      asset.hireStatusRel = [statuses.hireStatus['On Hire']];
      asset.locationGeo = pointGeo(near(b.destination, 0.02), { label: `Near ${b.destName}`, source: 'telematics', speedKmh: rand.int(0, 60), recordedDate: iso(NOW - rand.int(1, 9) * 60_000) });
      asset.lastPositionDate = iso(NOW - rand.int(1, 9) * 60_000);
    }
    if (b.status === 'Closed' && b.run.end > NOW - 10 * DAY && b.info.type.cls !== 'Plant' && b.info.type.cls !== 'Yellow Plant' && b.info.typeKey !== 'trailer' && rand.chance(0.45)) {
      dd({ asset: b.id, by: b.person, time: b.run.start - 10 * 60_000, meter: b.startMeter });
    }
  });
  // Assets in the workshop or tagged out sit at their workshop.
  for (const info of Object.values(assets)) {
    if (info.doc.hireStatusRel[0].name === 'Unavailable For Hire' && info.doc.assetStatusRel[0].name === 'Active') {
      info.doc.locationGeo = pointGeo(near(LOCATIONS.find((l) => l.key === info.workshop).at), { label: LOCATIONS.find((l) => l.key === info.workshop).name, source: 'telematics', recordedDate: iso(NOW - rand.int(30, 600) * 60_000) });
    }
    info.doc.meterReading = `${info.doc.meterReadingNum.toLocaleString('en-AU')} ${info.doc.primaryMeterUnit === 'hours' ? 'hours' : 'km'}`;
    info.doc.serviceWarning = serviceWarning({ dueDate: info.doc.serviceDueDate, dueMeter: info.doc.serviceDueMeterNum, meter: info.doc.meterReadingNum, leadWeeks: info.plan.leadWeeks, leadMeter: info.plan.leadMeter, now: NOW });
  }
  // One check whose reading was lower than the asset's meter (kept, flagged, not used).
  const flagged = bookings.find((b) => b.status === 'Closed' && b.id === 'U-301');
  if (flagged) dd({ asset: 'U-301', by: flagged.person, time: flagged.run.start - 15 * 60_000, meter: flagged.startMeter - 1200, excluded: true });
  // Daily Drivers are numbered in time order.
  dailyDrivers
    .sort((a, b) => a.checkDate.localeCompare(b.checkDate))
    .forEach((d, i) => {
      const ref = `${COUNTERS.dailyDriver.prefix}-${i + 1}`;
      d.ddRef = ref;
      d.systemHeader.summaryName = `${ref}: ${d.assetRel[0].assetId} ${d.ddResult}`;
    });
  for (const r of requests) {
    if (!r.dailyDriverRel?.length) continue;
    const check = dailyDrivers.find((d) => d.documentId === r.dailyDriverRel[0].documentId);
    r.dailyDriverRel = [{ documentId: check.documentId, name: check.systemHeader.summaryName }];
    r.reqDescription = r.reqDescription.replace(/Raised by CHK-\d+\./, `Raised by ${check.ddRef}.`);
  }

  // ---------------------------------------------------------------------------- fuel receipts
  const fuel = [];
  const PRICE = { Diesel: 2.02, 'Unleaded 91': 1.89, 'Premium Unleaded 95': 2.05 };
  const CONSUMPTION = { car: 6.2, van: 9.8, ute: 10.6, 'light-truck': 16.5, rigid: 24 };
  for (const [id, info] of Object.entries(assets)) {
    const fuelType = info.type.fuel;
    if (!PRICE[fuelType] || !CONSUMPTION[info.typeKey]) continue;
    const runs = bookings.filter((b) => b.id === id && b.status === 'Closed' && b.run.end > NOW - 30 * DAY).sort((a, b) => a.run.end - b.run.end);
    let since = 0;
    let previousMeter = null;
    for (const b of runs) {
      since += b.endMeter - b.startMeter;
      if (since < 250 && b !== runs.at(-1)) continue;
      const tooMuch = id === 'V-204' && previousMeter !== null && fuel.filter((f) => f.assetRel[0].assetId === 'V-204').length === 1;
      const litres = tooMuch ? info.type.tank + 14 : Math.min(info.type.tank, Math.round(((since * CONSUMPTION[info.typeKey]) / 100) * (0.92 + rand.next() * 0.16) * 10) / 10);
      const check = fuelCheck({ litres, meter: b.endMeter, previousMeter, tankCapacity: info.type.tank, rangeKm: info.type.range });
      const n = fuel.length + 1;
      const ref = `FR-${n}`;
      fuel.push(doc('fuelReceipt', T.fuelReceipt, `${ref}: ${id} ${litres} L`, {
        fuelRef: ref, assetRel: assetRelOf(id), driverRel: [personValue(b.person)], fuelDate: iso(b.run.end - 25 * 60_000),
        meterReadingNum: b.endMeter, litresNum: litres, costNum: Math.round(litres * PRICE[fuelType] * 100) / 100, fuelTypeRel: [values.fuelType[fuelType]],
        supplier: rand.pick(['Ampol Alexandria', 'BP Mascot', 'Shell Parramatta', '7-Eleven Silverwater', 'Ampol Wetherill Park']),
        fuelFlags: check.flags, fuelFlagsText: check.flags.join(', '), distanceNum: check.distance ?? null, consumptionNum: check.litresPer100km ?? null,
        lastStatus: 'Recorded', transition: null,
        createdDate: iso(b.run.end - 20 * 60_000), createdByRel: [authorValue(b.person)],
      }, { id: fleetId('fuelReceipt', ref), created: new Date(b.run.end - 20 * 60_000), by: people[b.person].documentId }));
      previousMeter = b.endMeter;
      since = 0;
    }
  }

  // A note or two on assets.
  assets['T-405'].doc.notesCommentsArr = [{ dataId: fleetId('note', 'T-405:1'), detail: 'Replacement truck ordered (delivery in 6 weeks). Keep this one off the road; rego lapses this week.', createdBy: authorValue('marcus'), createdDate: iso(at(-8, 11)) }];
  assets['E-153'].doc.notesCommentsArr = [{ dataId: fleetId('note', 'E-153:1'), detail: 'Delivered. Charging cable and fleet card to be fitted before it goes **Active**.', createdBy: authorValue('marcus'), createdDate: iso(at(-2, 14)) }];

  // -------------------------------------------------------------------------------- counters
  const counters = { booking: bookings.length, request: requests.length, workOrder: workOrders.length, dailyDriver: dailyDrivers.length, fuel: fuel.length };
  for (const [key, c] of Object.entries(COUNTERS)) {
    add({ documentId: c.id, systemHeader: header({ systemType: 'document', templateId: T.counter, summaryName: `${c.prefix} counter`, at: seededAt, by: adminId }), [c.field]: counters[key] });
  }

  // ------------------------------------------------------------------------ templates and rules
  const components = templateComponents();
  const ref = (key, name) => [{ documentId: RULESETS[key], name }];
  const client = (key, name) => ({ preRenderClientRuleRel: ref(key, name), onLoadClientRuleRel: ref(key, name), onFieldChangeClientRuleRel: ref(key, name), preSaveClientRuleRel: ref(key, name) });
  const template = (id, name, extra = {}) => set.template({ id, name, components: components[id], ...extra });
  const page = (id, name) => template(id, name, { hideCommandBar: true });
  page(T.overview, 'Fleet overview');
  page(T.calendar, 'Booking calendar');
  page(T.bookings, 'Bookings');
  page(T.map, 'Asset map');
  page(T.assets, 'Assets');
  page(T.workshop, 'Workshop dashboard');
  page(T.dailyDrivers, 'Daily Drivers');
  page(T.fuelReceipts, 'Fuel receipts');
  template(T.asset, 'Asset', {
    appTags: ['fleet', 'asset'], summaryNameRule: '{{{assetId}}} · {{{make}}} {{{model}}}{{#if registration}} · {{{registration}}}{{/if}}',
    ...client('assetClient', 'Fleet Asset - Client'), preSaveServerRuleRel: ref('assetServer', 'Fleet Asset - PreSaveServer'),
  });
  template(T.booking, 'Booking', {
    appTags: ['fleet', 'booking'], summaryNameRule: '{{{bookingRef}}}: {{{assetRel.0.assetId}}} for {{{requestedByRel.0.name}}}',
    ...client('bookingClient', 'Fleet Booking - Client'), preSaveServerRuleRel: ref('bookingServer', 'Fleet Booking - PreSaveServer'), postSaveServerRuleRel: ref('bookingPost', 'Fleet Booking - PostSave'),
  });
  template(T.dailyDriver, 'Daily Driver', {
    appTags: ['fleet', 'dailyDriver'], summaryNameRule: '{{{ddRef}}}: {{{assetRel.0.assetId}}} {{{ddResult}}}',
    ...client('ddClient', 'Fleet Daily Driver - Client'), preSaveServerRuleRel: ref('ddServer', 'Fleet Daily Driver - PreSaveServer'), postSaveServerRuleRel: ref('ddPost', 'Fleet Daily Driver - PostSave'),
  });
  template(T.request, 'Workshop request', {
    appTags: ['fleet', 'request'], summaryNameRule: '{{{requestRef}}}: {{{assetRel.0.assetId}}} {{{requestTypeRel.0.name}}}',
    ...client('requestClient', 'Fleet Request - Client'), preSaveServerRuleRel: ref('requestServer', 'Fleet Request - PreSaveServer'), postSaveServerRuleRel: ref('requestPost', 'Fleet Request - PostSave'),
  });
  template(T.workOrder, 'Work order', {
    appTags: ['fleet', 'workOrder'], summaryNameRule: '{{{workOrderRef}}}: {{{workOrderTypeRel.0.name}}} ({{{requestRel.0.requestRef}}})',
    ...client('woClient', 'Fleet Work Order - Client'), preSaveServerRuleRel: ref('woServer', 'Fleet Work Order - PreSaveServer'), postSaveServerRuleRel: ref('woPost', 'Fleet Work Order - PostSave'),
  });
  template(T.fuelReceipt, 'Fuel receipt', {
    appTags: ['fleet', 'fuelReceipt'], summaryNameRule: '{{{fuelRef}}}: {{{assetRel.0.assetId}}} {{{litresNum}}} L',
    preSaveServerRuleRel: ref('fuelServer', 'Fleet Fuel - PreSaveServer'), postSaveServerRuleRel: ref('fuelPost', 'Fleet Fuel - PostSave'),
  });
  template(T.location, 'Location', { appTags: ['fleet', 'location'], summaryNameRule: '{{{nameId}}}' });
  template(T.checkSheet, 'Check sheet', { appTags: ['fleet', 'checkSheet'], summaryNameRule: '{{{nameId}}}' });
  template(T.servicePlan, 'Service plan', { appTags: ['fleet', 'servicePlan'], summaryNameRule: '{{{nameId}}}' });
  template(T.material, 'Material', { appTags: ['fleet', 'material'], summaryNameRule: '{{{nameId}}}', preSaveServerRuleRel: ref('materialServer', 'Fleet Material - PreSaveServer') });
  template(T.counter, 'Counter', { summaryNameRule: 'Counter' });
  for (const [kind, names] of Object.entries(LOOKUPS)) template(T[`lookup_${kind}`], names.name, { appTags: ['fleet', kind], summaryNameRule: '{{{nameId}}}' });

  const linked = (templateId, name, events) => [{ documentId: templateId, name, eventNames: events }];
  const CLIENT_EVENTS = 'preRenderClient | onLoadClient | onFieldChangeClient | preSaveClient';
  const bookableAssets = { sort: [{ 'assetId.lcase': 'asc' }], query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: 'fleet' } }, { term: { appTags: 'asset' } }, { term: { bookableBool: true } }, { term: { 'assetStatusRel.name': 'Active' } }] } } };
  const rs = (key, name, dsl, templateId, templateName, events) => set.ruleset({ id: RULESETS[key], name, dsl, group: 'fleet', linked: linked(templateId, templateName, events) });
  rs('assetClient', 'Fleet Asset - Client', rules.assetClientRules({ statuses }), T.asset, 'Asset', CLIENT_EVENTS);
  rs('assetServer', 'Fleet Asset - PreSaveServer', rules.assetServerRules({ statuses }), T.asset, 'Asset', 'preSaveServer');
  rs('bookingClient', 'Fleet Booking - Client', rules.bookingClientRules({ statuses, assetFilter: bookableAssets }), T.booking, 'Booking', CLIENT_EVENTS);
  rs('bookingServer', 'Fleet Booking - PreSaveServer', rules.bookingServerRules({ statuses }), T.booking, 'Booking', 'preSaveServer');
  rs('bookingPost', 'Fleet Booking - PostSave', rules.bookingPostRules({ statuses }), T.booking, 'Booking', 'postSaveServer');
  rs('ddClient', 'Fleet Daily Driver - Client', rules.ddClientRules(), T.dailyDriver, 'Daily Driver', CLIENT_EVENTS);
  rs('ddServer', 'Fleet Daily Driver - PreSaveServer', rules.ddServerRules(), T.dailyDriver, 'Daily Driver', 'preSaveServer');
  rs('ddPost', 'Fleet Daily Driver - PostSave', rules.ddPostRules({ statuses, values, requestTemplateId: T.request }), T.dailyDriver, 'Daily Driver', 'postSaveServer');
  rs('requestClient', 'Fleet Request - Client', rules.requestClientRules({ statuses, values }), T.request, 'Workshop request', CLIENT_EVENTS);
  rs('requestServer', 'Fleet Request - PreSaveServer', rules.requestServerRules({ statuses }), T.request, 'Workshop request', 'preSaveServer');
  rs('requestPost', 'Fleet Request - PostSave', rules.requestPostRules({ statuses }), T.request, 'Workshop request', 'postSaveServer');
  rs('woClient', 'Fleet Work Order - Client', rules.woClientRules({ statuses }), T.workOrder, 'Work order', CLIENT_EVENTS);
  rs('woServer', 'Fleet Work Order - PreSaveServer', rules.woServerRules(), T.workOrder, 'Work order', 'preSaveServer');
  rs('woPost', 'Fleet Work Order - PostSave', rules.woPostRules({ statuses }), T.workOrder, 'Work order', 'postSaveServer');
  rs('fuelServer', 'Fleet Fuel - PreSaveServer', rules.fuelServerRules(), T.fuelReceipt, 'Fuel receipt', 'preSaveServer');
  rs('fuelPost', 'Fleet Fuel - PostSave', rules.fuelPostRules(), T.fuelReceipt, 'Fuel receipt', 'postSaveServer');
  rs('materialServer', 'Fleet Material - PreSaveServer', rules.materialServerRules(), T.material, 'Material', 'preSaveServer');

  // ---------------------------------------------------------------------- platform documents
  set.platformDocuments(componentRepos(appRoot));
  // People's fleet details on the account form (this database's copy of the platform template).
  const accountTemplate = set.documents.find((d) => d.documentId === SYSTEM.account);
  if (accountTemplate?.components) {
    const lookupPicker = (name, label, kind, extra = {}) => ({ componentName: 'solid-lookup-picker', name, label, showDropDown: true, iconSet: 'none', filter: q({ sort: [{ indexNum: 'asc' }], query: { bool: { filter: [{ term: { appTags: 'fleet' } }, { term: { appTags: kind } }] } } }), relatedFields: { indexNum: 'indexNum' }, ...extra });
    accountTemplate.components.splice(1, 0,
      { componentName: 'sc-drop-down', name: 'accountType', label: 'Account type', dropDownList: ['Driver', 'Operator', 'Technician', 'Supervisor', 'Asset Manager', 'Administrator'] },
      lookupPicker('poolsRel', 'Vehicle hire pools', 'pool', { fullWidth: true }),
      lookupPicker('licencesRel', 'Licences and tickets', 'licence'),
      { componentName: 'sc-date-time', name: 'licenceExpiryDate', label: 'Licence expiry' },
      lookupPicker('departmentRel', 'Department', 'department', { singleSelection: true }),
      lookupPicker('homeLocationRel', 'Home location', 'location', { singleSelection: true }),
      { componentName: 'sc-text-box', name: 'phone', label: 'Phone' },
    );
  }
  set.configuration({ defaultTemplate: T.overview, urlRoot });

  return {
    documents: set.finish(),
    password: DEMO_PASSWORD,
    people: PEOPLE.map((p) => ({ name: people[p.key].name, email: people[p.key].email, role: p.type })),
    urls: {
      overview: `/form/${T.overview}`,
      calendar: `/form/${T.calendar}`,
      map: `/form/${T.map}`,
      workshop: `/form/${T.workshop}`,
      assets: `/form/${T.assets}`,
      newBooking: `/form/${T.booking}`,
    },
    stats: { assets: Object.keys(assets).length, bookings: bookings.length, requests: requests.length, workOrders: workOrders.length, dailyDrivers: dailyDrivers.length, fuel: fuel.length },
  };
}

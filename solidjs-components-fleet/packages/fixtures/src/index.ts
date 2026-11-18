// A small fleet in the demo's data model, for the preview gallery and the browser test. Times are
// relative to when the page loads, so the calendar always has something now, an overdue hire and
// tomorrow's bookings.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const today = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
/** An ISO time `hours` after midnight today (local). */
export const at = (hours: number) => new Date(today + hours * HOUR).toISOString();
const iso = (time: number) => new Date(time).toISOString();
const now = Date.now();

type Doc = Record<string, unknown> & { documentId: string };
export type ComponentDef = Record<string, unknown> & { componentName: string; name: string };

const header = (summaryName: string, templateId: string, systemType = 'document') => ({ systemType, summaryName, templateId, versionId: `v-${summaryName}` });
const rel = (doc: Doc, fields: Record<string, unknown> = {}) => ({ documentId: doc.documentId, name: (doc.systemHeader as { summaryName: string }).summaryName, ...fields });

// ------------------------------------------------------------------------------------ lookups
const lookup = (kind: string, name: string, extra: Record<string, unknown> = {}): Doc => ({
  documentId: `${kind}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  systemHeader: header(name, `template-${kind}`),
  appTags: ['fleet', kind],
  nameId: name,
  inactiveBool: false,
  ...extra,
});

export const hireStatuses = {
  available: lookup('hireStatus', 'Available For Hire', { color: '#2f9e5b', indexNum: 10 }),
  onHire: lookup('hireStatus', 'On Hire', { color: '#3e63dd', indexNum: 20 }),
  unavailable: lookup('hireStatus', 'Unavailable For Hire', { color: '#d1361f', indexNum: 30 }),
};
export const assetStatuses = {
  active: lookup('assetStatus', 'Active', { color: '#2f9e5b', statusCategory: 'inprogress', indexNum: 20 }),
};
export const bookingStatuses = {
  reserved: lookup('bookingStatus', 'Asset Reserved', { color: '#7c5cff', statusCategory: 'todo', indexNum: 10 }),
  commenced: lookup('bookingStatus', 'Hire Commenced', { color: '#0b8fb3', statusCategory: 'inprogress', indexNum: 20 }),
  closed: lookup('bookingStatus', 'Closed', { color: '#8b8d98', statusCategory: 'done', indexNum: 30 }),
  cancelled: lookup('bookingStatus', 'Cancelled', { color: '#8b8d98', statusCategory: 'done', indexNum: 40 }),
};
export const requestStatuses = {
  inProgress: lookup('requestStatus', 'In Progress', { color: '#d97706', statusCategory: 'inprogress', indexNum: 40 }),
};

export const checkSheet: Doc = {
  ...lookup('checkSheet', 'Light Vehicle Daily Driver'),
  checkItems: [
    { key: 'tyres', question: 'Tyres: tread and pressure', category: 'Exterior', mandatory: true, instruction: 'At least 1.5 mm of tread; no cuts or bulges.' },
    { key: 'lights', question: 'Lights and indicators', category: 'Exterior', mandatory: true },
    { key: 'body', question: 'Body damage', category: 'Exterior' },
    { key: 'oil', question: 'Engine oil level', category: 'Engine', mandatory: true },
    { key: 'coolant', question: 'Coolant level', category: 'Engine' },
    { key: 'brakes', question: 'Brakes', category: 'Cabin', mandatory: true },
    { key: 'seatbelts', question: 'Seatbelts', category: 'Cabin', mandatory: true },
    { key: 'first-aid', question: 'First aid kit', category: 'Cabin' },
  ],
};

export const assetTypes = {
  van: lookup('assetType', 'Panel Van', { iconKind: 'van', primaryMeter: 'km', assetClass: 'Light Vehicle' }),
  ute: lookup('assetType', 'Dual Cab Ute', { iconKind: 'ute', primaryMeter: 'km', assetClass: 'Light Vehicle' }),
  forklift: lookup('assetType', 'Forklift', { iconKind: 'forklift', primaryMeter: 'hours', assetClass: 'Plant' }),
};

export const materials: Doc[] = [
  lookup('material', 'Oil filter (Toyota 90915)', { partNo: '90915-YZZD2', unitCost: 18.5, unit: 'ea', qtyAvailable: 14 }),
  lookup('material', 'Engine oil 5W-30', { partNo: 'OIL-5W30-20L', unitCost: 12, unit: 'L', qtyAvailable: 120 }),
  lookup('material', 'Brake pads, front set', { partNo: 'BP-HIACE-F', unitCost: 96, unit: 'set', qtyAvailable: 3 }),
];

// ---------------------------------------------------------------------------------- locations
const ring = (lon: number, lat: number, d = 0.0025) => [
  [lon - d, lat - d],
  [lon + d, lat - d],
  [lon + d, lat + d],
  [lon - d, lat + d],
  [lon - d, lat - d],
];
const point = (lon: number, lat: number, properties: Record<string, unknown> = {}) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties }],
});
const area = (lon: number, lat: number) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(lon, lat)] }, properties: {} }] });

export const locations = {
  alexandria: { ...lookup('location', 'Alexandria Depot', { locationType: 'Depot', addressGeo: point(151.196, -33.9105, { suburb: 'Alexandria', postcode: '2015' }), boundaryGeo: area(151.196, -33.9105) }) },
  parramatta: { ...lookup('location', 'Parramatta Depot', { locationType: 'Depot', addressGeo: point(151.0011, -33.815, { suburb: 'Parramatta', postcode: '2150' }), boundaryGeo: area(151.0011, -33.815) }) },
};

// ------------------------------------------------------------------------------------- people
const account = (id: string, first: string, last: string, title: string): Doc => ({
  documentId: id,
  systemHeader: header(`${first} ${last}`, 'template-account', 'account'),
  email: `${first}.${last}@example.com`.toLowerCase(),
  jobTitle: title,
  inactiveBool: false,
});
export const CURRENT_ACCOUNT_ID = 'account-sofia';
export const accounts = [
  account(CURRENT_ACCOUNT_ID, 'Sofia', 'Russo', 'Field Technician'),
  account('account-liam', 'Liam', 'Walsh', 'Field Technician'),
  account('account-priya', 'Priya', 'Shah', 'Workshop Supervisor'),
];

// ------------------------------------------------------------------------------------- assets
const asset = (id: string, type: Doc, make: string, model: string, rego: string, location: Doc, hire: Doc, extra: Record<string, unknown> = {}): Doc => ({
  documentId: `asset-${id.toLowerCase()}`,
  systemHeader: header(`${id} · ${make} ${model} · ${rego}`, 'template-asset'),
  appTags: ['fleet', 'asset'],
  assetId: id,
  make,
  model,
  registration: rego,
  assetTypeRel: [rel(type, { iconKind: type.iconKind, primaryMeter: type.primaryMeter })],
  assetStatusRel: [rel(assetStatuses.active, { color: assetStatuses.active.color })],
  hireStatusRel: [rel(hire, { color: hire.color })],
  locationRel: [rel(location)],
  checkSheetRel: [rel(checkSheet)],
  primaryMeterUnit: type.primaryMeter,
  bookableBool: true,
  maxBookingHours: 72,
  ...extra,
});
export const assets = {
  v101: asset('V-101', assetTypes.van, 'Toyota', 'HiAce', 'CX45LM', locations.alexandria, hireStatuses.available, {
    yearNum: 2023,
    meterReadingNum: 48210,
    meterReadingDate: iso(now - 3 * DAY),
    serviceDueMeterNum: 49000,
    serviceDueDate: iso(now + 40 * DAY),
    regDueDate: iso(now + 12 * DAY),
    locationGeo: point(151.1968, -33.9101, { label: 'Alexandria Depot', recordedDate: iso(now - 2 * HOUR) }),
    maxBookingHours: 48,
  }),
  v102: asset('V-102', assetTypes.van, 'Ford', 'Transit Custom', 'DF12QR', locations.alexandria, hireStatuses.onHire, {
    meterReadingNum: 61022,
    locationGeo: point(151.2093, -33.8688, { label: 'Sydney CBD', speedKmh: 34, recordedDate: iso(now - 5 * 60_000) }),
  }),
  u201: asset('U-201', assetTypes.ute, 'Toyota', 'HiLux SR', 'BT77AA', locations.parramatta, hireStatuses.available, {
    meterReadingNum: 30544,
    locationGeo: point(151.0021, -33.8156, { label: 'Parramatta Depot' }),
  }),
  f301: asset('F-301', assetTypes.forklift, 'Toyota', '8FG25', '', locations.alexandria, hireStatuses.unavailable, {
    meterReadingNum: 4123,
    locationGeo: point(151.1955, -33.9109, { label: 'Alexandria Depot' }),
  }),
};

// ----------------------------------------------------------------------------------- bookings
const booking = (ref: string, a: Doc, start: string, end: string, status: Doc, who: Doc, extra: Record<string, unknown> = {}): Doc => ({
  documentId: `booking-${ref.toLowerCase()}`,
  systemHeader: header(`${ref}: ${a.assetId}`, 'template-booking'),
  appTags: ['fleet', 'booking'],
  bookingRef: ref,
  assetRel: [rel(a, { assetId: a.assetId })],
  startDate: start,
  endDate: end,
  bookingStatusRel: [rel(status, { color: status.color })],
  requestedByRel: [rel(who)],
  ...extra,
});
export const bookings = [
  booking('BK-11', assets.v101, at(10), at(13), bookingStatuses.reserved, accounts[0]),
  // Out since yesterday morning and due back an hour ago: Hire Overdue. Starting yesterday keeps it
  // overlapping any period the tests pick today, whatever the time of day they run.
  booking('BK-12', assets.v102, at(-24 + 9), iso(now - HOUR), bookingStatuses.commenced, accounts[1]),
  booking('BK-13', assets.u201, at(24 + 9), at(24 + 17), bookingStatuses.reserved, accounts[0]),
  booking('BK-9', assets.u201, at(-24 + 8), at(-24 + 12), bookingStatuses.closed, accounts[1], { closedDate: at(-24 + 11.5) }),
];

export const requests = [
  {
    documentId: 'request-req-4',
    systemHeader: header('REQ-4: F-301 hydraulic leak', 'template-request'),
    appTags: ['fleet', 'request'],
    requestRef: 'REQ-4',
    assetRel: [rel(assets.f301, { assetId: 'F-301' })],
    requestStatusRel: [rel(requestStatuses.inProgress)],
    expectedStartDate: iso(now - DAY),
    expectedCompletionDate: iso(now + DAY),
  },
];

// -------------------------------------------------------------------------------------- forms
export const BOOKING_TEMPLATE_ID = 'template-booking';
export const DAILY_DRIVER_TEMPLATE_ID = 'template-daily-driver';
export const REQUEST_TEMPLATE_ID = 'template-request';

/** A booking being made: V-101 from 11:00 to 14:00 today, clashing with BK-11 (10:00–13:00). */
export const newBooking: Doc = {
  documentId: 'booking-new',
  systemHeader: { systemType: 'document', templateId: BOOKING_TEMPLATE_ID },
  assetRel: [rel(assets.v101, { assetId: 'V-101', maxBookingHours: 48 })],
  startDate: at(11),
  endDate: at(14),
};
/** A Daily Driver check on V-101, not started. */
export const dailyDriver: Doc = {
  documentId: 'dd-new',
  systemHeader: { systemType: 'document', templateId: DAILY_DRIVER_TEMPLATE_ID },
  assetRel: [rel(assets.v101, { assetId: 'V-101' })],
};
/** A work order with a part and labour already on it. */
export const workOrder: Doc = {
  documentId: 'wo-7',
  systemHeader: header('WO-7: V-101 service', 'template-work-order'),
  lineItemsArr: [
    { id: 'l1', kind: 'part', description: 'Oil filter (Toyota 90915)', materialRel: [rel(materials[0], { partNo: '90915-YZZD2' })], qty: 1, unit: 'ea', unitCost: 18.5 },
    { id: 'l2', kind: 'labour', description: 'Service labour', qty: 1.5, unit: 'h', unitCost: 120 },
  ],
};
/** A check sheet typed in by hand (or imported): its checks have no keys. */
export const handSheet: Doc = {
  ...lookup('checkSheet', 'Trailer Check'),
  checkItems: [
    { question: 'Coupling and safety chains', category: 'Hitch', mandatory: true },
    { question: 'Lights and plug', category: 'Hitch' },
  ],
};
/** The page the dashboard elements sit on. */
export const dashboard: Doc = { documentId: 'page-fleet', systemHeader: header('Fleet overview', 'template-overview') };

export const documents: Doc[] = [
  ...Object.values(hireStatuses),
  ...Object.values(assetStatuses),
  ...Object.values(bookingStatuses),
  ...Object.values(requestStatuses),
  checkSheet,
  ...Object.values(assetTypes),
  ...materials,
  ...Object.values(locations),
  ...accounts,
  ...Object.values(assets),
  ...bookings,
  ...requests,
];
export const forms = [assets.v101, newBooking, dailyDriver, workOrder, dashboard, handSheet];

// ------------------------------------------------------------------------------- definitions
const ASSETS = "{'query':{'bool':{'filter':[{'term':{'appTags':'asset'}},{'term':{'bookableBool':true}}]}}}";
const ASSET_VALUE_FIELDS = { assetId: 'assetId', maxBookingHours: 'maxBookingHours' };

/** Component definitions, by element role, as the demo's templates write them. */
export const definitions: Record<string, ComponentDef> = {
  tiles: {
    componentName: 'solid-stat-tiles',
    name: 'fleetTiles',
    label: 'Fleet today',
    disableSave: true,
    tiles: [
      { label: 'Available For Hire', tone: 'good', filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'asset'}},{'term':{'hireStatusRel.name':'Available For Hire'}}]}}}", link: 'page-assets', icon: 'asset:Panel Van' },
      { label: 'On Hire', tone: 'info', filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'asset'}},{'term':{'hireStatusRel.name':'On Hire'}}]}}}" },
      { label: 'Hire Overdue', tone: 'bad', zeroTone: 'good', filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'booking'}},{'term':{'bookingStatusRel.name':'Hire Commenced'}},{'range':{'endDate':{'lt':'now'}}}]}}}", hint: 'Out past their booking' },
      { label: 'Rego due in 30 days', tone: 'warn', icon: 'calendar', filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'asset'}},{'range':{'regDueDate':{'lte':'now+30d/d'}}}]}}}" },
    ],
  },
  calendar: {
    componentName: 'solid-booking-calendar',
    name: 'bookingCalendar',
    label: 'Booking calendar',
    disableSave: true,
    bookingTemplateId: BOOKING_TEMPLATE_ID,
    assetFilter: ASSETS,
    assetValueFields: ASSET_VALUE_FIELDS,
    bookingFilter: "{'query':{'bool':{'filter':[{'term':{'appTags':'booking'}}],'must_not':[{'term':{'bookingStatusRel.name':'Cancelled'}}]}}}",
    blockFilter: "{'query':{'bool':{'filter':[{'term':{'appTags':'request'}},{'terms':{'requestStatusRel.name':['Drop Off','In Progress','Work Complete']}}]}}}",
    height: '420px',
  },
  availability: {
    componentName: 'solid-booking-calendar',
    name: 'availability',
    label: 'Availability',
    mode: 'field',
    disableSave: true,
    assetFilter: ASSETS,
    assetValueFields: ASSET_VALUE_FIELDS,
    bookingFilter: "{'query':{'bool':{'filter':[{'term':{'appTags':'booking'}}],'must_not':[{'terms':{'bookingStatusRel.name':['Cancelled','Closed']}}]}}}",
    blockFilter: "{'query':{'bool':{'filter':[{'term':{'appTags':'request'}},{'terms':{'requestStatusRel.name':['Drop Off','In Progress','Work Complete']}}]}}}",
  },
  period: {
    componentName: 'solid-date-range',
    name: 'startDate',
    label: 'When',
    endField: 'endDate',
    mandatory: true,
    maxHoursFrom: 'assetRel.0.maxBookingHours',
  },
  map: {
    componentName: 'solid-map',
    name: 'fleetMap',
    label: 'Fleet map',
    disableSave: true,
    height: '380px',
    layers: [
      {
        name: 'assets',
        label: 'Assets',
        filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'asset'}}]}}}",
        geometryField: 'locationGeo',
        style: { kind: 'tile', statusField: 'hireStatusRel', iconField: 'assetTypeRel.0.name', iconKindField: 'assetTypeRel.0.iconKind' },
        popup: {
          fields: [
            { label: 'Hire status', path: 'hireStatusRel', type: 'status' },
            { label: 'Meter', path: 'meterReadingNum', type: 'number', suffix: 'km' },
          ],
          actions: [{ label: 'Book', icon: 'calendar', primary: true, templateId: BOOKING_TEMPLATE_ID, values: { assetRel: { $record: { assetId: 'assetId' } } } }],
        },
      },
      {
        name: 'locations',
        label: 'Depots',
        filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'location'}}]}}}",
        geometryField: 'boundaryGeo',
        style: { kind: 'area', color: '#5b47e0' },
      },
    ],
  },
  location: { componentName: 'solid-map', name: 'locationGeo', label: 'Location', mode: 'point', height: '260px' },
  summary: {
    componentName: 'solid-asset-summary',
    name: 'assetSummary',
    disableSave: true,
    actions: [
      { label: 'Book', icon: 'calendar', primary: true, templateId: BOOKING_TEMPLATE_ID, values: { assetRel: { $asset: { assetId: 'assetId' } } } },
      { label: 'Daily Driver', icon: 'list', templateId: DAILY_DRIVER_TEMPLATE_ID, values: { assetRel: { $asset: { assetId: 'assetId' } } } },
      { label: 'Report a fault', icon: 'wrench', templateId: REQUEST_TEMPLATE_ID, values: { assetRel: { $asset: { assetId: 'assetId' } } } },
    ],
  },
  checks: {
    componentName: 'solid-checklist',
    name: 'checksArr',
    label: 'Checks',
    mandatory: true,
    itemsFrom: { field: 'assetRel', documentField: 'checkSheetRel', itemsField: 'checkItems' },
    allowAdd: true,
  },
  sheet: { componentName: 'solid-checklist', name: 'checkItems', label: 'Checks on the sheet', mode: 'define' },
  meter: { componentName: 'solid-meter-reading', name: 'meterReadingNum', label: 'Odometer', mandatory: true, maxIncrease: 2000 },
  lines: {
    componentName: 'solid-line-items',
    name: 'lineItemsArr',
    label: 'Parts and labour',
    labourRate: 120,
    materialFilter: "{'sort':[{'systemHeader.summaryName':'asc'}],'query':{'bool':{'filter':[{'term':{'appTags':'material'}}]}}}",
  },
};

/** The template every fixture form is shown with (fields only matter for the host's definition watch). */
export const template = { documentId: 'template-fixtures', components: Object.values(definitions) };

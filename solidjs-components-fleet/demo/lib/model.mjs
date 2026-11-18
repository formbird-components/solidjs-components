// Identifiers and constants shared by every part of the fleet demo seed.

import { idFactory } from '@solidjs-components/platform/documents';

/** Stable id for a demo object, so re-seeding keeps links and bookmarks working. */
export const fleetId = idFactory('fleet');

/** Everyone in the demo signs in with this password. */
export const DEMO_PASSWORD = 'Fleet1234!';

/** The company's time zone: business hours, calendar days for hire charges, weekends. */
export const TIME_ZONE = 'Australia/Sydney';

/** The demo company. */
export const COMPANY = 'Harbourline Services';

/** Access keys. Password hashes and access documents need ADMIN; the others gate workflow moves. */
export const KEYS = {
  admin: fleetId('key', 'admin'),
  /** Asset Managers: asset lifecycle, booking overrides (duration, pools, licences). */
  manager: fleetId('key', 'fleet-manager'),
  /** Workshop staff: moving requests and work orders along. */
  workshop: fleetId('key', 'workshop'),
  /** Workshop supervisors: triage (Pending → Open), closing and cancelling requests. */
  supervisor: fleetId('key', 'workshop-supervisor'),
};

/** Templates (forms and pages). */
export const T = {
  overview: fleetId('template', 'Fleet overview'),
  calendar: fleetId('template', 'Booking calendar'),
  bookings: fleetId('template', 'Bookings'),
  map: fleetId('template', 'Asset map'),
  assets: fleetId('template', 'Assets'),
  workshop: fleetId('template', 'Workshop dashboard'),
  dailyDrivers: fleetId('template', 'Daily Drivers'),
  fuelReceipts: fleetId('template', 'Fuel receipts'),
  asset: fleetId('template', 'Asset'),
  booking: fleetId('template', 'Booking'),
  dailyDriver: fleetId('template', 'Daily Driver'),
  request: fleetId('template', 'Workshop request'),
  workOrder: fleetId('template', 'Work order'),
  fuelReceipt: fleetId('template', 'Fuel receipt'),
  location: fleetId('template', 'Location'),
  checkSheet: fleetId('template', 'Check sheet'),
  servicePlan: fleetId('template', 'Service plan'),
  material: fleetId('template', 'Material'),
  counter: fleetId('template', 'Counter'),
};

/** Lookup kinds: one admin template each, documents tagged ['fleet', kind]. */
export const LOOKUPS = {
  assetType: { name: 'Asset type', plural: 'Asset types' },
  assetStatus: { name: 'Asset status', plural: 'Asset statuses' },
  hireStatus: { name: 'Hire status', plural: 'Hire statuses' },
  bookingStatus: { name: 'Booking status', plural: 'Booking statuses' },
  bookingReason: { name: 'Reason for booking', plural: 'Reasons for booking' },
  cancelReason: { name: 'Reason for cancellation', plural: 'Reasons for cancellation' },
  requestStatus: { name: 'Request status', plural: 'Request statuses' },
  requestType: { name: 'Request type', plural: 'Request types' },
  requestPriority: { name: 'Priority', plural: 'Priorities' },
  requestReason: { name: 'Reason for request', plural: 'Reasons for request' },
  closeReason: { name: 'Reason for closing', plural: 'Reasons for closing' },
  workOrderStatus: { name: 'Work order status', plural: 'Work order statuses' },
  workOrderType: { name: 'Work order type', plural: 'Work order types' },
  disposedBy: { name: 'Disposed by', plural: 'Disposal methods' },
  fuelType: { name: 'Fuel type', plural: 'Fuel types' },
  department: { name: 'Department', plural: 'Departments' },
  pool: { name: 'Vehicle hire pool', plural: 'Vehicle hire pools' },
  licence: { name: 'Licence or ticket', plural: 'Licences and tickets' },
};
for (const kind of Object.keys(LOOKUPS)) T[`lookup_${kind}`] = fleetId('template', `lookup:${kind}`);

/**
 * Reference number counters (Reference No: "BK-#"). fieldtec-web's Reference No preprocessor
 * replaces YY, MM and DD in the format with the date, so prefixes must avoid those letters in pairs.
 */
export const COUNTERS = {
  booking: { id: fleetId('counter', 'booking'), field: 'bookingCounter', prefix: 'BK' },
  request: { id: fleetId('counter', 'request'), field: 'requestCounter', prefix: 'REQ' },
  workOrder: { id: fleetId('counter', 'workOrder'), field: 'workOrderCounter', prefix: 'WO' },
  dailyDriver: { id: fleetId('counter', 'dailyDriver'), field: 'dailyDriverCounter', prefix: 'CHK' },
  fuel: { id: fleetId('counter', 'fuel'), field: 'fuelCounter', prefix: 'FR' },
};

/** Ruleset ids. */
export const RULESETS = Object.fromEntries(
  ['assetClient', 'assetServer', 'bookingClient', 'bookingServer', 'bookingPost', 'ddClient', 'ddServer', 'ddPost', 'requestClient', 'requestServer', 'requestPost', 'woClient', 'woServer', 'woPost', 'fuelServer', 'fuelPost', 'materialServer'].map(
    (name) => [name, fleetId('ruleset', name)],
  ),
);

/**
 * What a record stores about its asset (the asset pickers' relatedFields): enough for the rules and
 * elements to work without loading the asset (icon, limits, rates, meter unit, licence, pools).
 */
export const ASSET_VALUE_FIELDS = {
  assetId: 'assetId',
  registration: 'registration',
  iconKind: 'iconKind',
  primaryMeterUnit: 'primaryMeterUnit',
  maxBookingHours: 'maxBookingHours',
  hireRateHourly: 'hireRateHourly',
  hireRateDaily: 'hireRateDaily',
  requiredLicence: 'requiredLicence',
};

/** Workshop rate for labour lines, per hour. */
export const LABOUR_RATE = 120;

/** System-wide maximum booking length, hours (an asset's own maximum wins). */
export const MAX_BOOKING_HOURS = 72;

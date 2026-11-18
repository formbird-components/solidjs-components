// Component lists of every fleet template: the forms (asset, booking, Daily Driver, workshop request,
// work order, fuel receipt, location, check sheet, service plan, material), the pages (overview,
// booking calendar, asset map, workshop dashboard, lists) and the admin lookups.

import { CONFIG_ID, SYSTEM, TEMPLATE_EDITOR_ID } from '@solidjs-components/platform/documents';
import {
  appParts, button, check, comments, date, dropDown, html, inPanel, LOOKUP_FIELDS, markdown, ME, number, pageTitle, person, q, query, referenceField,
  searchBox, table, term, terms, text, THIS,
} from '@solidjs-components/platform/form-parts';
import { ASSET_KINDS } from '../../../solidjs-components-shared/packages/kit/src/domain/lookups.ts';
import { IN_WORKSHOP, STATUSES, TRANSITIONS } from './catalog.mjs';
import { ASSET_VALUE_FIELDS, COUNTERS, KEYS, LABOUR_RATE, LOOKUPS, MAX_BOOKING_HOURS, T } from './model.mjs';

const { docs: fleetDocs, lookupFilter, tags, lookup, status } = appParts('fleet', { transitions: TRANSITIONS });
export { q, lookupFilter };

const WORKSHOP_PEOPLE = q(query([term('systemHeader.systemType', 'account'), terms('accountType', ['Technician', 'Supervisor', 'Administrator'])], { sort: [{ 'systemHeader.summaryName': 'asc' }] }));
const WORKSHOPS = lookupFilter('location', [term('locationType', 'Workshop')]);
const BOOKABLE_ASSETS = q(
  query(fleetDocs('asset', term('bookableBool', true), term('assetStatusRel.name', 'Active')), { sort: [{ 'assetId.lcase': 'asc' }] }),
);
const ALL_ASSETS = q(query(fleetDocs('asset'), { mustNot: [term('assetStatusRel.name', 'Disposed')], sort: [{ 'assetId.lcase': 'asc' }] }));
const keyOf = (name) => [KEYS[name]];

/** A reference number ("BK-12"), assigned on first save by fieldtec-web's Reference No preprocessor. */
const reference = (counter, label, extra = {}) =>
  referenceField(`${counter === 'dailyDriver' ? 'dd' : counter === 'fuel' ? 'fuel' : counter}Ref`, COUNTERS[counter], label, extra);
/** The asset a record is about. */
const assetPicker = (extra = {}) => ({
  componentName: 'solid-lookup-picker', name: 'assetRel', label: 'Asset', mandatory: true, singleSelection: true, showDropDown: true,
  iconSet: 'asset', iconKindField: 'iconKind', filter: ALL_ASSETS, relatedFields: ASSET_VALUE_FIELDS, ...extra,
});

// ------------------------------------------------------------------------------------------------
// Columns and filters reused across pages
// ------------------------------------------------------------------------------------------------

const ACTIVE_BOOKING = terms('bookingStatusRel.name', ['Asset Reserved', 'Hire Commenced']);
const OPEN_REQUEST = { mustNot: [terms('requestStatusRel.name', ['Closed', 'Cancelled'])] };

const bookingColumns = ({ wide = false } = {}) => [
  { displayName: 'Booking', field: 'bookingRef', type: 'key', sortField: 'systemHeader.createdDate' },
  { displayName: 'Asset', field: 'assetRel', type: 'icon', iconSet: 'asset', iconKindField: 'assetRel.iconKind' },
  { displayName: 'Status', field: 'bookingStatusRel', type: 'status' },
  { displayName: 'Starts', field: 'startDate', type: 'datetime', sort: { direction: wide ? 'desc' : 'asc', precedence: 1 } },
  { displayName: 'Ends', field: 'endDate', type: 'datetime', responsive: { xs: 0 } },
  { displayName: 'Requested by', field: 'requestedByRel', type: 'user', responsive: { xs: 0, sm: 0 } },
  ...(wide
    ? [
        { displayName: 'Reason', field: 'bookingReasonRel', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Job', field: 'jobCode', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Distance', field: 'distanceNum', type: 'numeric', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Hire cost', field: 'hireCost', type: 'money', responsive: { xs: 0, sm: 0 } },
      ]
    : []),
];
const assetColumns = ({ wide = false, byDue = false } = {}) => [
  { displayName: 'Type', field: 'assetTypeRel', type: 'icon', iconSet: 'asset', iconKindField: 'iconKind', iconOnly: true },
  { displayName: 'ID', field: 'assetId', type: 'key', sort: { direction: 'asc', precedence: 2 } },
  { displayName: 'Make and model', field: 'makeModel', link: true },
  { displayName: 'Rego', field: 'registration', responsive: { xs: 0 } },
  { displayName: 'Location', field: 'locationRel', type: 'labels', responsive: { xs: 0, sm: 0 } },
  { displayName: 'Hire status', field: 'hireStatusRel', type: 'status' },
  ...(wide
    ? [
        { displayName: 'Lifecycle', field: 'assetStatusRel', type: 'status', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Meter', field: 'meterReading', responsive: { xs: 0, sm: 0, md: 0 }, sortField: 'meterReadingNum' },
        { displayName: 'Responsible', field: 'responsiblePersonRel', type: 'user', responsive: { xs: 0, sm: 0, md: 0 } },
      ]
    : []),
  { displayName: 'Next service', field: 'serviceDueDate', type: 'due', warnDays: 28, responsive: { xs: 0 }, ...(byDue ? { sort: { direction: 'asc', precedence: 1 } } : {}) },
  { displayName: 'Rego due', field: 'regDueDate', type: 'due', responsive: { xs: 0, sm: 0 } },
];
const requestColumns = () => [
  { displayName: 'Request', field: 'requestRef', type: 'key', sortField: 'systemHeader.createdDate' },
  { displayName: 'Type', field: 'requestTypeRel', type: 'icon', iconSet: 'work', iconOnly: true },
  { displayName: 'Asset', field: 'assetRel', type: 'icon', iconSet: 'asset', iconKindField: 'assetRel.iconKind' },
  { displayName: 'Status', field: 'requestStatusRel', type: 'status' },
  { displayName: 'Priority', field: 'priorityRel', type: 'priority', responsive: { xs: 0, sm: 0 } },
  { displayName: 'Expected start', field: 'expectedStartDate', type: 'datetime', sort: { direction: 'asc', precedence: 1 }, responsive: { xs: 0 } },
  { displayName: 'Assigned to', field: 'assignedToRel', type: 'user', responsive: { xs: 0, sm: 0 } },
];
const workOrderColumns = () => [
  { displayName: 'Work order', field: 'workOrderRef', type: 'key', sortField: 'systemHeader.createdDate', sort: { direction: 'desc', precedence: 1 } },
  { displayName: 'Type', field: 'workOrderTypeRel', type: 'icon', iconSet: 'work' },
  { displayName: 'Status', field: 'workOrderStatusRel', type: 'status' },
  { displayName: 'Assigned', field: 'assignedToRel', type: 'user', responsive: { xs: 0 } },
  { displayName: 'Total', field: 'totalCost', type: 'money', responsive: { xs: 0, sm: 0 } },
];
const serviceDue = () =>
  query(fleetDocs('asset'), {
    should: [terms('serviceWarning', ['Due Soon', 'Overdue']), { range: { regDueDate: { lte: 'now+30d/d' } } }],
    mustNot: [term('assetStatusRel.name', 'Disposed')],
  });
const assetMapLayer = (actions) => ({
  name: 'assets',
  label: 'Assets',
  filter: q(query(fleetDocs('asset', term('includeInMapBool', true)), { mustNot: [term('assetStatusRel.name', 'Disposed')] })),
  geometryField: 'locationGeo',
  style: { kind: 'tile', statusField: 'hireStatusRel', iconField: 'assetTypeRel.0.name', iconKindField: 'iconKind' },
  popup: {
    titleField: 'systemHeader.summaryName',
    fields: [
      { label: 'Hire status', path: 'hireStatusRel', type: 'status' },
      { label: 'Location', path: 'locationRel.0.name' },
      { label: 'Meter', path: 'meterReading' },
      { label: 'Last position', path: 'lastPositionDate', type: 'relative' },
    ],
    actions,
  },
});
const sitesLayer = () => ({
  name: 'sites',
  label: 'Depots and workshops',
  filter: q(query(fleetDocs('location'), { mustNot: [term('inactiveBool', true)] })),
  geometryField: 'boundaryGeo',
  style: { kind: 'area', color: '#5b47e0', labelField: 'nameId' },
});
const ASSET_ACTION_VALUES = { assetRel: { $record: ASSET_VALUE_FIELDS } };
const assetActions = () => [
  { label: 'Book', icon: 'calendar', primary: true, templateId: T.booking, values: ASSET_ACTION_VALUES },
  { label: 'Daily Driver', icon: 'list', templateId: T.dailyDriver, values: ASSET_ACTION_VALUES },
  { label: 'Report a fault', icon: 'wrench', templateId: T.request, values: ASSET_ACTION_VALUES },
];

/** Every record of a kind, at the foot of its form (the form doubles as its admin page). */
const allOf = (kind, label, columns) =>
  table('allDocsDt', label, query(fleetDocs(kind)), [{ displayName: 'Name', field: 'nameId', link: true }, ...columns, { displayName: 'Order', field: 'indexNum', type: 'numeric', sort: { direction: 'asc' } }], { rowsPerPage: 25 });

// ------------------------------------------------------------------------------------------------
// Templates
// ------------------------------------------------------------------------------------------------

/**
 * Every fleet template's components, keyed by template id.
 * @returns {Record<string, object[]>}
 */
export function templateComponents() {
  return {
    // ---------------------------------------------------------------------------- pages
    [T.overview]: [
      pageTitle('welcome', 'Fleet overview', 'Where the fleet is, what is out, what needs attention.', [
        button(`/form/${T.booking}`, '+ New booking', true),
        button(`/form/${T.calendar}`, 'Booking calendar'),
        button(`/form/${T.dailyDriver}`, 'Daily Driver'),
        button(`/form/${T.request}`, 'Report a fault'),
      ]),
      {
        componentName: 'solid-stat-tiles', name: 'fleetTiles', label: 'Today', fullWidth: true, disableSave: true, refreshSeconds: 120,
        tiles: [
          { label: 'Available For Hire', tone: 'good', icon: 'asset:Panel Van', link: T.assets, filter: q(query(fleetDocs('asset', term('hireStatusRel.name', 'Available For Hire'), term('assetStatusRel.name', 'Active')))) },
          { label: 'On Hire', tone: 'info', icon: 'calendar', link: T.bookings, filter: q(query(fleetDocs('asset', term('hireStatusRel.name', 'On Hire')))) },
          { label: 'Hire Overdue', tone: 'bad', zeroTone: 'good', icon: 'clock', hint: 'Not returned by their booking end', link: T.bookings, filter: q(query(fleetDocs('booking', term('bookingStatusRel.name', 'Hire Commenced'), { range: { endDate: { lt: 'now' } } }))) },
          { label: 'Bookings today', tone: 'accent', icon: 'calendar', link: T.calendar, filter: q(query(fleetDocs('booking', { range: { startDate: { lt: 'now+1d/d' } } }, { range: { endDate: { gte: 'now/d' } } }), { mustNot: [term('bookingStatusRel.name', 'Cancelled')] })) },
          { label: 'Unavailable For Hire', tone: 'warn', zeroTone: 'good', icon: 'wrench', link: T.workshop, filter: q(query(fleetDocs('asset', term('hireStatusRel.name', 'Unavailable For Hire'), term('assetStatusRel.name', 'Active')))) },
          { label: 'Urgent defects', tone: 'bad', zeroTone: 'good', icon: 'alert', link: T.workshop, filter: q(query(fleetDocs('request', term('priorityRel.name', 'Urgent – Asset Out of Service')), OPEN_REQUEST)) },
          { label: 'Service due (4 weeks)', tone: 'warn', zeroTone: 'good', icon: 'wrench', link: T.assets, filter: q(query(fleetDocs('asset', terms('serviceWarning', ['Due Soon', 'Overdue'])), { mustNot: [term('assetStatusRel.name', 'Disposed')] })) },
          { label: 'Rego due (30 days)', tone: 'warn', zeroTone: 'good', icon: 'calendar', link: T.assets, filter: q(query(fleetDocs('asset', { range: { regDueDate: { lte: 'now+30d/d' } } }), { mustNot: [term('assetStatusRel.name', 'Disposed')] })) },
        ],
      },
      { componentName: 'solid-map', name: 'fleetMap', label: 'Fleet map', fullWidth: true, disableSave: true, height: '400px', layers: [assetMapLayer(assetActions()), sitesLayer()] },
      table('myBookingsDt', 'My bookings', query(fleetDocs('booking', term('requestedByRel.documentId', ME), ACTIVE_BOOKING)), bookingColumns(), { emptyText: 'No upcoming bookings. Book from the calendar.', statusFilter: lookupFilter('bookingStatus') }),
      table('overdueDt', 'Hire Overdue', query(fleetDocs('booking', term('bookingStatusRel.name', 'Hire Commenced'), { range: { endDate: { lt: 'now' } } })), bookingColumns(), { emptyText: 'Every hire is back on time.', statusFilter: lookupFilter('bookingStatus') }),
      table('warningsDt', 'Asset warnings', serviceDue(), assetColumns({ byDue: true }), { emptyText: 'No services or registrations due.', statusFilter: lookupFilter('hireStatus') }),
      table('openRequestsDt', 'Open workshop requests', query(fleetDocs('request'), OPEN_REQUEST), requestColumns(), { emptyText: 'Nothing in the workshop.', statusFilter: lookupFilter('requestStatus') }),
    ],

    [T.calendar]: [
      pageTitle('calendarTitle', 'Booking calendar', 'Drag across free time on an asset to book it. Assets in the workshop are blocked out.', [button(`/form/${T.booking}`, '+ New booking', true), button(`/form/${T.bookings}`, 'All bookings')]),
      {
        componentName: 'solid-booking-calendar', name: 'bookingCalendar', label: 'Booking calendar', fullWidth: true, disableSave: true, hideLabel: true,
        bookingTemplateId: T.booking, assetFilter: BOOKABLE_ASSETS, assetValueFields: ASSET_VALUE_FIELDS,
        assetFields: { iconKind: 'iconKind' },
        bookingFilter: q(query(fleetDocs('booking'), { mustNot: [term('bookingStatusRel.name', 'Cancelled')] })),
        blockFilter: q(query(fleetDocs('request'), { should: [terms('requestStatusRel.name', IN_WORKSHOP), terms('disableBooking', ['Disable', 'Auto Disable'])], mustNot: [terms('requestStatusRel.name', ['Closed', 'Cancelled', 'Pick Up'])] })),
        height: '64vh',
      },
      table('myCalendarBookingsDt', 'My bookings', query(fleetDocs('booking', term('requestedByRel.documentId', ME), ACTIVE_BOOKING)), bookingColumns(), { emptyText: 'No upcoming bookings.', statusFilter: lookupFilter('bookingStatus') }),
    ],

    [T.bookings]: [
      pageTitle('bookingsTitle', 'Bookings', '', [button(`/form/${T.booking}`, '+ New booking', true), button(`/form/${T.calendar}`, 'Booking calendar')]),
      table('overdueBookingsDt', 'Hire Overdue', query(fleetDocs('booking', term('bookingStatusRel.name', 'Hire Commenced'), { range: { endDate: { lt: 'now' } } })), bookingColumns(), { emptyText: 'Every hire is back on time.', statusFilter: lookupFilter('bookingStatus') }),
      table('allBookingsDt', 'All bookings', query(fleetDocs('booking')), bookingColumns({ wide: true }), {
        rowsPerPage: 25, showSearch: true, searchPlaceholder: 'Search bookings, assets, people, jobs', searchBoxFilter: searchBox('bookingRef', 'assetRel.name', 'requestedByRel.name', 'jobCode', 'destination'),
        exportTypes: ['CSV'], emptyText: 'No bookings yet.', statusFilter: lookupFilter('bookingStatus'),
      }),
    ],

    [T.map]: [
      pageTitle('mapTitle', 'Asset map', 'Last known positions, coloured by hire status. Select an asset to book it or report a fault.'),
      {
        componentName: 'solid-map', name: 'assetMap', label: 'Asset map', fullWidth: true, disableSave: true, hideLabel: true, height: '68vh',
        layers: [
          assetMapLayer(assetActions()),
          {
            name: 'destinations', label: 'Hire destinations',
            filter: q(query(fleetDocs('booking', term('bookingStatusRel.name', 'Hire Commenced')))),
            geometryField: 'destinationGeo', style: { kind: 'marker', statusField: 'bookingStatusRel' },
            popup: {
              titleField: 'destination',
              fields: [
                { label: 'Booking', path: 'bookingRef' },
                { label: 'Asset', path: 'assetRel.0.name' },
                { label: 'Driver', path: 'requestedByRel.0.name' },
                { label: 'Due back', path: 'endDate', type: 'datetime' },
              ],
            },
          },
          sitesLayer(),
        ],
      },
    ],

    [T.assets]: [
      pageTitle('assetsTitle', 'Assets', '', [button(`/form/${T.asset}`, '+ New asset', true), button(`/form/${T.map}`, 'Asset map')]),
      table('assetWarningsDt', 'Asset warnings', serviceDue(), assetColumns({ byDue: true }), { emptyText: 'No services or registrations due.', statusFilter: lookupFilter('hireStatus') }),
      table('assetRegisterDt', 'Asset register', query(fleetDocs('asset')), assetColumns({ wide: true }), {
        rowsPerPage: 25, showSearch: true, searchPlaceholder: 'Search ID, make, model, rego', searchBoxFilter: searchBox('assetId', 'makeModel', 'registration', 'vin'),
        exportTypes: ['CSV'], statusFilter: lookupFilter('hireStatus'), emptyText: 'No assets yet.',
      }),
    ],

    [T.workshop]: [
      pageTitle('workshopTitle', 'Workshop dashboard', 'Triage, what is in the yard, and what is due.', [button(`/form/${T.request}`, '+ New request', true), button(`/form/${T.workOrder}`, '+ New work order')]),
      {
        componentName: 'solid-stat-tiles', name: 'workshopTiles', label: 'Current activity', fullWidth: true, disableSave: true, refreshSeconds: 120,
        tiles: [
          { label: 'Triage – Urgent', tone: 'bad', zeroTone: 'good', icon: 'alert', filter: q(query(fleetDocs('request', term('requestStatusRel.name', 'Pending'), term('priorityRel.name', 'Urgent – Asset Out of Service')))) },
          { label: 'Triage – Non-Urgent', tone: 'warn', zeroTone: 'good', icon: 'list', filter: q(query(fleetDocs('request', term('requestStatusRel.name', 'Pending')), { mustNot: [term('priorityRel.name', 'Urgent – Asset Out of Service')] })) },
          { label: 'In The Yard', tone: 'info', icon: 'work:Repair', filter: q(query(fleetDocs('request', terms('requestStatusRel.name', IN_WORKSHOP)))) },
          { label: 'Start Overdue', tone: 'bad', zeroTone: 'good', icon: 'clock', hint: 'Open, past their expected start', filter: q(query(fleetDocs('request', term('requestStatusRel.name', 'Open'), { range: { expectedStartDate: { lt: 'now' } } }))) },
          { label: 'Expected Today', tone: 'accent', icon: 'calendar', filter: q(query(fleetDocs('request', { range: { expectedCompletionDate: { gte: 'now/d', lt: 'now+1d/d' } } }), OPEN_REQUEST)) },
          { label: 'Next 7 Days', tone: 'neutral', icon: 'calendar', filter: q(query(fleetDocs('request', term('requestStatusRel.name', 'Open'), { range: { expectedStartDate: { gte: 'now', lt: 'now+7d/d' } } }))) },
          { label: 'Completed Today', tone: 'good', icon: 'check', filter: q(query(fleetDocs('request', { range: { workCompleteDate: { gte: 'now/d' } } }))) },
          { label: 'Work Orders On Hold', tone: 'warn', zeroTone: 'good', icon: 'clock', filter: q(query(fleetDocs('workOrder', term('workOrderStatusRel.name', 'On Hold')))) },
        ],
      },
      table('triageDt', 'Triage (Pending)', query(fleetDocs('request', term('requestStatusRel.name', 'Pending'))), requestColumns(), { emptyText: 'Nothing waiting for triage.', statusFilter: lookupFilter('requestStatus') }),
      table('activityDt', 'Current activity', query(fleetDocs('request', terms('requestStatusRel.name', ['Open', 'Drop Off', 'In Progress', 'Work Complete', 'Pick Up']))), requestColumns(), { rowsPerPage: 15, statusFilter: lookupFilter('requestStatus'), emptyText: 'No open requests.' }),
      table('myWorkOrdersDt', 'My work orders', query(fleetDocs('workOrder', term('assignedToRel.documentId', ME)), { mustNot: [term('workOrderStatusRel.name', 'Complete')] }), workOrderColumns(), { emptyText: 'Nothing assigned to you.', statusFilter: lookupFilter('workOrderStatus') }),
      table('servicesDueDt', 'Services due', query(fleetDocs('asset', terms('serviceWarning', ['Due Soon', 'Overdue'])), { mustNot: [term('assetStatusRel.name', 'Disposed')] }), assetColumns({ byDue: true }), { emptyText: 'No services due.', statusFilter: lookupFilter('hireStatus') }),
      table('reorderDt', 'Materials to reorder', query(fleetDocs('material', term('reorderBool', true))), [
        { displayName: 'Material', field: 'nameId', link: true, sort: { direction: 'asc' } },
        { displayName: 'Part no.', field: 'partNo' },
        { displayName: 'In stock', field: 'qtyAvailable', type: 'numeric' },
        { displayName: 'Reorder at', field: 'reorderThreshold', type: 'numeric' },
        { displayName: 'Store', field: 'storeLocationRel', type: 'labels', responsive: { xs: 0 } },
      ], { emptyText: 'Stock is fine.' }),
    ],

    [T.dailyDrivers]: [
      pageTitle('ddTitle', 'Daily Drivers', 'Pre-start checks. A failed check raises a workshop request; an urgent one takes the asset off hire.', [button(`/form/${T.dailyDriver}`, '+ New Daily Driver', true)]),
      table('ddDt', 'Daily Drivers', query(fleetDocs('dailyDriver')), [
        { displayName: 'Check', field: 'ddRef', type: 'key', sortField: 'systemHeader.createdDate' },
        { displayName: 'Asset', field: 'assetRel', type: 'icon', iconSet: 'asset', iconKindField: 'assetRel.iconKind' },
        { displayName: 'Driver', field: 'driverRel', type: 'user' },
        { displayName: 'Checked', field: 'checkDate', type: 'datetime', sort: { direction: 'desc', precedence: 1 } },
        { displayName: 'Result', field: 'ddResult' },
        { displayName: 'Meter', field: 'meterReadingNum', type: 'numeric', responsive: { xs: 0 } },
      ], { rowsPerPage: 25, showSearch: true, searchBoxFilter: searchBox('ddRef', 'assetRel.name', 'driverRel.name'), exportTypes: ['CSV'], emptyText: 'No checks yet.' }),
    ],

    [T.fuelReceipts]: [
      pageTitle('fuelTitle', 'Fuel receipts', 'Meters, litres and cost; receipts that don’t add up are flagged.', [button(`/form/${T.fuelReceipt}`, '+ New fuel receipt', true)]),
      table('fuelDt', 'Fuel receipts', query(fleetDocs('fuelReceipt')), [
        { displayName: 'Receipt', field: 'fuelRef', type: 'key', sortField: 'systemHeader.createdDate' },
        { displayName: 'Asset', field: 'assetRel', type: 'icon', iconSet: 'asset', iconKindField: 'assetRel.iconKind' },
        { displayName: 'Date', field: 'fuelDate', type: 'datetime', sort: { direction: 'desc', precedence: 1 } },
        { displayName: 'Litres', field: 'litresNum', type: 'numeric' },
        { displayName: 'Cost', field: 'costNum', type: 'money' },
        { displayName: 'L/100 km', field: 'consumptionNum', type: 'numeric', responsive: { xs: 0 } },
        { displayName: 'Flags', field: 'fuelFlags', type: 'labels', responsive: { xs: 0, sm: 0 } },
      ], { rowsPerPage: 25, showSearch: true, searchBoxFilter: searchBox('fuelRef', 'assetRel.name', 'supplier'), exportTypes: ['CSV'], emptyText: 'No receipts yet.' }),
    ],

    // ---------------------------------------------------------------------------- the asset
    [T.asset]: [
      tags('asset'),
      { componentName: 'solid-asset-summary', name: 'assetSummary', fullWidth: true, disableSave: true, actions: [...assetActions(), { label: 'Fuel receipt', icon: 'fuel', templateId: T.fuelReceipt, values: ASSET_ACTION_VALUES }] },
      ...inPanel('classificationPanel', 'Classification', [
        text('assetId', 'ID', { mandatory: true, maxLength: 12 }),
        text('assetName', 'Asset name', { enabled: false }),
        { ...lookup('assetTypeRel', 'Asset type', 'assetType'), mandatory: true, iconSet: 'asset', iconKindField: 'iconKind', relatedFields: { iconKind: 'iconKind', assetClass: 'assetClass', primaryMeter: 'primaryMeter', requiredLicence: 'requiredLicence', maxBookingHours: 'maxBookingHours', hireRateHourly: 'hireRateHourly', hireRateDaily: 'hireRateDaily', checkSheetRel: 'checkSheetRel', servicePlanRel: 'servicePlanRel', fuelTypeRel: 'fuelTypeRel', tankCapacityL: 'tankCapacityL', rangeKm: 'rangeKm' } },
        status('assetStatusRel', 'Asset status', 'assetStatus', {
          transitionKeys: Object.fromEntries(STATUSES.assetStatus.map(([name]) => [name, keyOf('manager')])),
          resolution: { fieldName: 'disposedByRel', label: 'Disposed by', requiredFor: ['Disposed'], filter: lookupFilter('disposedBy'), relatedFields: LOOKUP_FIELDS },
        }),
        status('hireStatusRel', 'Hire status', 'hireStatus', { enabled: false, mandatory: false }),
        dropDown('allocationStatus', 'Allocation status', ['Permanently Assigned', 'Temporary Allocation', 'Unassigned', 'Hire Store'], { mandatory: true }),
        person('responsiblePersonRel', 'Responsible person'),
        lookup('responsibleWorkshopRel', 'Responsible workshop', 'location', { mandatory: true, filter: WORKSHOPS }),
        lookup('locationRel', 'Location', 'location', { mandatory: true }),
        lookup('departmentRel', 'Department', 'department'),
        { ...lookup('poolsRel', 'Vehicle hire pools', 'pool'), singleSelection: false, fullWidth: true },
      ]),
      ...inPanel('detailsPanel', 'Physical details', [
        text('make', 'Make', { mandatory: true }),
        text('model', 'Model', { mandatory: true }),
        number('yearNum', 'Year'),
        text('registration', 'Registration #', { maxLength: 8 }),
        text('vin', 'Chassis # / VIN'),
        text('colour', 'Colour'),
        lookup('fuelTypeRel', 'Fuel type (primary)', 'fuelType'),
        number('tankCapacityL', 'Primary tank capacity (litres)'),
        number('rangeKm', 'Range (km)'),
      ]),
      ...inPanel('metersPanel', 'Meters and service', [
        dropDown('primaryMeterUnit', 'Primary meter measure', ['km', 'hours'], { mandatory: true }),
        number('meterReadingNum', 'Primary meter'),
        date('meterReadingDate', 'Meter read'),
        lookup('servicePlanRel', 'Service plan', 'servicePlan', { filter: lookupFilter('servicePlan'), relatedFields: { weeks: 'intervalWeeks', meter: 'intervalMeter', leadWeeks: 'leadWeeks', leadMeter: 'leadMeter' } }),
        date('lastServiceDate', 'Last service'),
        number('lastServiceMeterNum', 'Meter at last service'),
        date('serviceDueDate', 'Service due (date)', { enabled: false }),
        number('serviceDueMeterNum', 'Service due (meter)', { enabled: false }),
        text('serviceWarning', 'Service status', { enabled: false }),
      ]),
      ...inPanel('registrationPanel', 'Registration and finance', [
        date('regDueDate', 'Reg. due'),
        date('insuranceDueDate', 'Insurance due'),
        date('purchaseDate', 'Purchase date'),
        number('purchasePrice', 'Purchase price ($)'),
        text('financialClass', 'Financial class', { enabled: false }),
        number('replacementCycleMonths', 'Replacement cycle (months)'),
        date('replacementDueDate', 'Replacement due', { enabled: false }),
        number('currentValue', 'Current value ($)'),
      ], { collapsed: true }),
      ...inPanel('bookingPanel', 'Booking / hire', [
        check('bookableBool', 'Available in the booking calendar'),
        number('maxBookingHours', 'Max. booking duration (hrs)'),
        number('hireRateHourly', 'Hourly hire rate ($)'),
        number('hireRateDaily', 'Daily hire rate ($)'),
        check('dailyDriverRequiredBool', 'Daily Driver check required'),
        lookup('checkSheetRel', 'Daily Driver check sheet', 'checkSheet', { filter: lookupFilter('checkSheet') }),
      ], { collapsed: true }),
      ...inPanel('trackingPanel', 'Location and telematics', [
        { componentName: 'solid-map', name: 'locationGeo', label: 'Last known position', mode: 'point', fullWidth: true, height: '300px' },
        text('trackerSerial', 'Device serial number'),
        check('includeInMapBool', 'Include in map display'),
      ]),
      table('assetBookingsDt', 'Bookings', query(fleetDocs('booking', term('assetRel.documentId', THIS))), bookingColumns(), { rowsPerPage: 5, emptyText: 'No bookings for this asset.', statusFilter: lookupFilter('bookingStatus') }),
      table('assetRequestsDt', 'Workshop requests', query(fleetDocs('request', term('assetRel.documentId', THIS))), requestColumns(), { rowsPerPage: 5, emptyText: 'No workshop requests.', statusFilter: lookupFilter('requestStatus') }),
      table('assetChecksDt', 'Daily Drivers', query(fleetDocs('dailyDriver', term('assetRel.documentId', THIS))), [
        { displayName: 'Check', field: 'ddRef', type: 'key' },
        { displayName: 'Driver', field: 'driverRel', type: 'user' },
        { displayName: 'Checked', field: 'checkDate', type: 'datetime', sort: { direction: 'desc' } },
        { displayName: 'Result', field: 'ddResult' },
      ], { rowsPerPage: 5, emptyText: 'No checks yet.' }),
      comments(),
    ],

    // ---------------------------------------------------------------------------- booking
    [T.booking]: [
      tags('booking'),
      reference('booking', 'Booking', { newText: 'New booking' }),
      status('bookingStatusRel', 'Status', 'bookingStatus', {
        resolution: { fieldName: 'cancelReasonRel', label: 'Reason for cancellation', requiredFor: ['Cancelled'], filter: lookupFilter('cancelReason'), relatedFields: LOOKUP_FIELDS },
      }),
      assetPicker({ filter: BOOKABLE_ASSETS }),
      person('requestedByRel', 'Requested by', { mandatory: true }),
      {
        componentName: 'solid-date-range', name: 'startDate', label: 'When', endField: 'endDate', mandatory: true, fullWidth: true,
        startLabel: 'Booking Start', endLabel: 'Booking Completion', maxHours: MAX_BOOKING_HOURS, maxHoursFrom: 'assetRel.0.maxBookingHours',
      },
      {
        componentName: 'solid-booking-calendar', name: 'availability', label: 'Availability', mode: 'field', fullWidth: true, disableSave: true,
        assetFilter: BOOKABLE_ASSETS, assetValueFields: ASSET_VALUE_FIELDS, assetFields: { iconKind: 'iconKind' },
        bookingFilter: q(query(fleetDocs('booking', ACTIVE_BOOKING))),
        blockFilter: q(query(fleetDocs('request'), { should: [terms('requestStatusRel.name', IN_WORKSHOP), terms('disableBooking', ['Disable', 'Auto Disable'])], mustNot: [terms('requestStatusRel.name', ['Closed', 'Cancelled', 'Pick Up'])] })),
      },
      lookup('bookingReasonRel', 'Reason for booking', 'bookingReason', { mandatory: true }),
      text('jobCode', 'Job / account code', { maxLength: 20 }),
      text('destination', 'Destination'),
      { componentName: 'solid-map', name: 'destinationGeo', label: 'Destination on the map', mode: 'point', fullWidth: true, height: '240px' },
      text('bookingNotes', 'Booking notes', { fullWidth: true }),
      ...inPanel('hirePanel', 'Hire', [
        { componentName: 'solid-meter-reading', name: 'startMeterNum', label: 'Meter at start', maxIncrease: 2000 },
        { componentName: 'solid-meter-reading', name: 'endMeterNum', label: 'Meter at end', minimumField: 'startMeterNum', maxIncrease: 3000 },
        date('commencedDate', 'Hire commenced', { enabled: false }),
        date('closedDate', 'Hire closed', { enabled: false }),
        number('distanceNum', 'Distance', { enabled: false }),
        number('hireDurationHours', 'Hire duration (hrs)', { enabled: false }),
        number('hireCost', 'Hire cost ($)', { enabled: false }),
        lookup('cancelReasonRel', 'Reason for cancellation', 'cancelReason', { enabled: false }),
      ]),
      comments(),
    ],

    // ---------------------------------------------------------------------------- Daily Driver
    [T.dailyDriver]: [
      tags('dailyDriver'),
      reference('dailyDriver', 'Daily Driver', { newText: 'New check' }),
      assetPicker({ relatedFields: { ...ASSET_VALUE_FIELDS, checkSheetRel: 'checkSheetRel' } }),
      person('driverRel', 'Driver', { mandatory: true }),
      date('checkDate', 'Checked', { mandatory: true }),
      { componentName: 'solid-meter-reading', name: 'meterReadingNum', label: 'Primary meter', mandatory: true, maxIncrease: 2000 },
      { componentName: 'solid-checklist', name: 'checksArr', label: 'Checks', mandatory: true, fullWidth: true, allowAdd: true, itemsFrom: { field: 'assetRel', documentField: 'checkSheetRel', itemsField: 'checkItems' } },
      ...inPanel('defectPanel', 'Defect', [
        text('defectDescription', 'Defect description', { fullWidth: true }),
        lookup('defectPriorityRel', 'Priority', 'requestPriority', { iconSet: 'priority' }),
        dropDown('serviceRequested', 'Service requested', ['In Workshop', 'In Field']),
        check('inspectionCompleteBool', 'Defect inspection complete'),
      ]),
      text('ddResult', 'Result', { enabled: false }),
      text('meterExcludedReason', 'Meter reading', { enabled: false }),
      table('ddRequestsDt', 'Workshop requests raised', query(fleetDocs('request', term('dailyDriverRel.documentId', THIS))), requestColumns(), { rowsPerPage: 5, emptyText: 'None.', statusFilter: lookupFilter('requestStatus') }),
    ],

    // ---------------------------------------------------------------------------- workshop
    [T.request]: [
      tags('request'),
      reference('request', 'Request', { typeField: 'requestTypeRel', iconSet: 'work', newText: 'New request' }),
      status('requestStatusRel', 'Status', 'requestStatus', {
        transitionKeys: {
          Open: keyOf('supervisor'), Cancelled: keyOf('supervisor'), Closed: keyOf('supervisor'), Pending: keyOf('supervisor'),
          'Drop Off': keyOf('workshop'), 'In Progress': keyOf('workshop'), 'Work Complete': keyOf('workshop'), 'Pick Up': keyOf('workshop'),
        },
        resolution: { fieldName: 'closeReasonRel', label: 'Reason for closing', requiredFor: ['Cancelled'], filter: lookupFilter('closeReason'), relatedFields: LOOKUP_FIELDS },
      }),
      assetPicker({ relatedFields: { ...ASSET_VALUE_FIELDS, responsibleWorkshopRel: 'responsibleWorkshopRel' } }),
      lookup('requestTypeRel', 'Request type', 'requestType', { mandatory: true, iconSet: 'work' }),
      lookup('priorityRel', 'Priority', 'requestPriority', { mandatory: true, iconSet: 'priority' }),
      lookup('requestReasonRel', 'Reason for request', 'requestReason'),
      markdown('reqDescription', 'Req. description', { mandatory: true }),
      person('requestedByRel', 'Requested by', { mandatory: true }),
      lookup('workshopRel', 'Workshop', 'location', { filter: WORKSHOPS }),
      person('assignedToRel', 'Request assigned to', { filter: WORKSHOP_PEOPLE }),
      { componentName: 'solid-date-range', name: 'expectedStartDate', label: 'Expected start and completion', endField: 'expectedCompletionDate', fullWidth: true, startLabel: 'Start', endLabel: 'Done', presets: [2, 4, 8, 24], warnPast: false, noun: 'job' },
      dropDown('disableBooking', 'Disable asset booking in booking calendar', ['Auto Disable', 'Disable', 'Do Not Disable']),
      text('bookingConflicts', 'Booking conflicts', { enabled: false, fullWidth: true }),
      ...inPanel('deferPanel', 'Deferred', [check('deferredBool', 'Deferred'), text('deferredReason', 'Reason deferred', { fullWidth: true })], { collapsed: true }),
      html('newWorkOrder', `<div>${button(`/form/${T.workOrder}`, '+ New work order', false)}</div>`),
      table('requestWorkOrdersDt', 'Work orders', query(fleetDocs('workOrder', term('requestRel.documentId', THIS))), workOrderColumns(), { rowsPerPage: 5, emptyText: 'No work orders yet.', statusFilter: lookupFilter('workOrderStatus') }),
      ...inPanel('outcomePanel', 'Outcome', [
        date('workCompleteDate', 'Work complete', { enabled: false }),
        date('closedDate', 'Closed', { enabled: false }),
        number('downTimeHours', 'Total down time (hrs)', { enabled: false }),
        lookup('dailyDriverRel', 'From Daily Driver', 'dailyDriver', { enabled: false, filter: q(query(fleetDocs('dailyDriver'))) }),
        lookup('closeReasonRel', 'Reason for closing', 'closeReason', { enabled: false }),
      ], { collapsed: true }),
      comments(),
    ],

    [T.workOrder]: [
      tags('workOrder'),
      reference('workOrder', 'Work order', { typeField: 'workOrderTypeRel', iconSet: 'work', newText: 'New work order' }),
      status('workOrderStatusRel', 'Status', 'workOrderStatus', {
        transitionKeys: { 'In Progress': keyOf('workshop'), 'On Hold': keyOf('workshop'), Complete: keyOf('workshop') },
      }),
      lookup('requestRel', 'Request', 'request', {
        mandatory: true, filter: q(query(fleetDocs('request'), { ...OPEN_REQUEST, sort: [{ 'systemHeader.createdDate': 'desc' }] })),
        relatedFields: { requestRef: 'requestRef', assetRel: 'assetRel' },
      }),
      assetPicker({ enabled: false, mandatory: false, relatedFields: { ...ASSET_VALUE_FIELDS, servicePlanRel: 'servicePlanRel' } }),
      lookup('workOrderTypeRel', 'Work order type', 'workOrderType', { mandatory: true, iconSet: 'work' }),
      person('assignedToRel', 'Assigned', { filter: WORKSHOP_PEOPLE }),
      number('estimatedLabourHours', 'Estimated labour (hrs)'),
      { componentName: 'solid-checklist', name: 'serviceChecksArr', label: 'Service checks', fullWidth: true, allowNa: true, itemsFrom: { field: 'assetRel', documentField: 'servicePlanRel', itemsField: 'tasks' } },
      { componentName: 'solid-line-items', name: 'lineItemsArr', label: 'Materials and labour', fullWidth: true, labourRate: LABOUR_RATE, materialFilter: lookupFilter('material') },
      ...inPanel('completionPanel', 'Completion', [
        { componentName: 'solid-meter-reading', name: 'meterAtServiceNum', label: 'Meter at service', maxIncrease: 3000 },
        date('dateAtService', 'Date at service'),
        text('workCompleted', 'Work completed', { fullWidth: true }),
        markdown('technicianReport', "Technician's report"),
        text('onHoldReason', 'Reason on hold', { fullWidth: true }),
        number('partsTotal', 'Parts ($)', { enabled: false }),
        number('labourTotal', 'Labour ($)', { enabled: false }),
        number('totalCost', 'Total incl. GST ($)', { enabled: false }),
        date('completedDate', 'Completed', { enabled: false }),
      ]),
      comments(),
    ],

    // ---------------------------------------------------------------------------- fuel
    [T.fuelReceipt]: [
      tags('fuelReceipt'),
      reference('fuel', 'Fuel receipt', { newText: 'New receipt' }),
      assetPicker(),
      person('driverRel', 'Driver'),
      date('fuelDate', 'Date', { mandatory: true }),
      { componentName: 'solid-meter-reading', name: 'meterReadingNum', label: 'Meter', mandatory: true, maxIncrease: 2500 },
      number('litresNum', 'Fuel quantity (L)', { mandatory: true }),
      number('costNum', 'Fuel cost ($)', { mandatory: true }),
      lookup('fuelTypeRel', 'Product', 'fuelType'),
      text('supplier', 'Supplier'),
      number('consumptionNum', 'L/100 km', { enabled: false }),
      text('fuelFlagsText', 'Flags', { enabled: false, fullWidth: true }),
    ],

    // ---------------------------------------------------------------------------- set-up
    [T.location]: [
      tags('location'),
      text('nameId', 'Name', { mandatory: true }),
      text('code', 'Code', { maxLength: 4 }),
      dropDown('locationType', 'Location type', ['Depot', 'Workshop', 'Office', 'External']),
      person('managerRel', 'Manager'),
      number('indexNum', 'Order'),
      { componentName: 'solid-map', name: 'addressGeo', label: 'Address', mode: 'point', fullWidth: true, height: '260px' },
      { componentName: 'solid-map', name: 'boundaryGeo', label: 'Site boundary', mode: 'area', fullWidth: true, height: '320px' },
      table('locationAssetsDt', 'Assets here', query(fleetDocs('asset', term('locationRel.documentId', THIS))), assetColumns(), { rowsPerPage: 10, statusFilter: lookupFilter('hireStatus'), emptyText: 'No assets at this location.' }),
      check('inactiveBool', 'Inactive'),
      allOf('location', 'Locations', [{ displayName: 'Type', field: 'locationType' }, { displayName: 'Code', field: 'code' }]),
    ],
    [T.checkSheet]: [
      tags('checkSheet'),
      text('nameId', 'Check sheet', { mandatory: true }),
      number('indexNum', 'Order'),
      { componentName: 'solid-checklist', name: 'checkItems', label: 'Checks', mode: 'define', fullWidth: true },
      table('sheetTypesDt', 'Asset types using it', query(fleetDocs('assetType', term('checkSheetRel.documentId', THIS))), [{ displayName: 'Asset type', field: 'nameId', link: true }], { emptyText: 'Not used yet.' }),
      check('inactiveBool', 'Inactive'),
      allOf('checkSheet', 'Check sheets', []),
    ],
    [T.servicePlan]: [
      tags('servicePlan'),
      text('nameId', 'Service plan', { mandatory: true }),
      number('intervalWeeks', 'Interval: time (weeks)'),
      number('intervalMeter', 'Interval: primary meter'),
      number('leadWeeks', 'Generation lead (weeks)'),
      number('leadMeter', 'Generation lead (meter)'),
      number('indexNum', 'Order'),
      { componentName: 'solid-checklist', name: 'tasks', label: 'Service checks', mode: 'define', fullWidth: true },
      check('inactiveBool', 'Inactive'),
      allOf('servicePlan', 'Service plans', [{ displayName: 'Weeks', field: 'intervalWeeks', type: 'numeric' }, { displayName: 'Meter', field: 'intervalMeter', type: 'numeric' }]),
    ],
    [T.material]: [
      tags('material'),
      text('nameId', 'Material', { mandatory: true }),
      text('partNo', 'Part number'),
      text('unit', 'Unit', { maxLength: 6 }),
      number('unitCost', 'Unit cost ($)'),
      number('qtyAvailable', 'Quantity available'),
      number('reorderThreshold', 'Reorder threshold'),
      lookup('storeLocationRel', 'Store', 'location', { filter: WORKSHOPS }),
      check('reorderBool', 'Reorder now', { enabled: false }),
      number('indexNum', 'Order'),
      check('inactiveBool', 'Inactive'),
      allOf('material', 'Materials', [
        { displayName: 'Part no.', field: 'partNo' },
        { displayName: 'Unit cost', field: 'unitCost', type: 'money' },
        { displayName: 'In stock', field: 'qtyAvailable', type: 'numeric' },
        { displayName: 'Reorder', field: 'reorderBool', type: 'boolean' },
      ]),
    ],
    [T.counter]: Object.values(COUNTERS).map((c) => number(c.field, `Last ${c.prefix} number`)),

    ...lookupTemplates(),
  };
}

/** Admin pages for each lookup kind: its fields plus a list of every value. */
function lookupTemplates() {
  const statusKinds = Object.keys(STATUSES);
  const extra = {
    assetType: [
      dropDown('iconKind', 'Icon', [...ASSET_KINDS]),
      dropDown('assetClass', 'Asset class (IPWEA)', ['Light Vehicle', 'Heavy Vehicle', 'Plant', 'Yellow Plant', 'Attachment']),
      dropDown('primaryMeter', 'Primary meter', ['km', 'hours']),
      text('requiredLicence', 'Licence or ticket needed'),
      lookup('checkSheetRel', 'Daily Driver check sheet', 'checkSheet', { filter: lookupFilter('checkSheet') }),
      lookup('servicePlanRel', 'Service plan', 'servicePlan', { filter: lookupFilter('servicePlan') }),
      number('maxBookingHours', 'Max. booking duration (hrs)'),
      number('hireRateHourly', 'Hourly hire rate ($)'),
      number('hireRateDaily', 'Daily hire rate ($)'),
      lookup('fuelTypeRel', 'Fuel type', 'fuelType'),
      number('tankCapacityL', 'Tank capacity (L)'),
      number('rangeKm', 'Range (km)'),
    ],
    pool: [dropDown('poolType', 'Pool type', ['General', 'Commuter Use'])],
    licence: [],
  };
  const out = {};
  for (const [kind, names] of Object.entries(LOOKUPS)) {
    const isStatus = statusKinds.includes(kind);
    out[T[`lookup_${kind}`]] = [
      tags(kind),
      text('nameId', names.name, { mandatory: true }),
      number('indexNum', 'Order'),
      ...(isStatus
        ? [
            { componentName: 'sc-text-box', name: 'color', label: 'Colour (CSS)' },
            dropDown('statusCategory', 'Category', ['todo', 'inprogress', 'done']),
          ]
        : []),
      ...(extra[kind] ?? []),
      check('inactiveBool', 'Inactive'),
      table('allDocsDt', names.plural, query(fleetDocs(kind)), [
        { displayName: 'Name', field: 'nameId', link: true },
        ...(isStatus ? [{ displayName: 'Colour', field: 'color', type: 'color' }] : []),
        ...(kind === 'assetType' ? [{ displayName: 'Class', field: 'assetClass' }, { displayName: 'Meter', field: 'primaryMeter' }, { displayName: 'Licence', field: 'requiredLicence' }] : []),
        { displayName: 'Order', field: 'indexNum', type: 'numeric', sort: { direction: 'asc' } },
        { displayName: 'Inactive', field: 'inactiveBool', type: 'boolean' },
      ], { rowsPerPage: 25 }),
    ];
  }
  return out;
}

/** Menus by account type. */
export function menuFor(type, { menuItem, menuGroup }) {
  const form = (id) => `/form/${id}`;
  const lookups = (names) => names.map((kind) => menuItem(LOOKUPS[kind].plural, form(T[`lookup_${kind}`])));
  const driving = [
    menuItem('Booking calendar', form(T.calendar)),
    menuItem('Bookings', form(T.bookings)),
    menuItem('New booking', form(T.booking)),
    menuItem('Daily Driver', form(T.dailyDriver)),
    menuItem('Fuel receipt', form(T.fuelReceipt)),
    menuItem('Report a fault', form(T.request)),
    menuItem('Asset map', form(T.map)),
  ];
  const workshop = menuGroup('Workshop', [
    menuItem('Workshop dashboard', form(T.workshop)),
    menuItem('New request', form(T.request)),
    menuItem('New work order', form(T.workOrder)),
    menuItem('Daily Drivers', form(T.dailyDrivers)),
    menuItem('Materials', form(T.material)),
  ]);
  const assets = menuGroup('Assets', [
    menuItem('Asset register', form(T.assets)),
    menuItem('Asset map', form(T.map)),
    menuItem('New asset', form(T.asset)),
    menuItem('Fuel receipts', form(T.fuelReceipts)),
  ]);
  const setup = menuGroup('Set-up', [
    menuItem('Locations', form(T.location)),
    menuItem('Check sheets', form(T.checkSheet)),
    menuItem('Service plans', form(T.servicePlan)),
    menuItem('Materials', form(T.material)),
    ...lookups(['assetType', 'pool', 'licence', 'department', 'fuelType', 'bookingReason', 'cancelReason', 'requestType', 'requestPriority', 'requestReason', 'closeReason', 'workOrderType', 'disposedBy']),
    ...lookups(Object.keys(STATUSES)),
  ]);
  const admin = menuGroup('Admin', [
    menuItem('Asset template', `${form(T.asset)}/${TEMPLATE_EDITOR_ID}`),
    menuItem('Booking template', `${form(T.booking)}/${TEMPLATE_EDITOR_ID}`),
    menuItem('Rulesets', `/form/${SYSTEM.ruleSet}`),
    menuItem('Configuration', `${form(CONFIG_ID)}/${TEMPLATE_EDITOR_ID}`),
  ]);
  switch (type) {
    case 'Administrator':
      return [menuItem('Fleet overview', form(T.overview)), menuGroup('Bookings', driving), workshop, assets, setup, admin];
    case 'Asset Manager':
      return [menuItem('Fleet overview', form(T.overview)), menuGroup('Bookings', driving), assets, workshop, setup];
    case 'Supervisor':
    case 'Technician':
      return [menuItem('Workshop dashboard', form(T.workshop)), workshop, assets, menuGroup('Bookings', driving)];
    case 'Operator':
      return [menuItem('Daily Driver', form(T.dailyDriver)), menuItem('Report a fault', form(T.request)), menuItem('Booking calendar', form(T.calendar)), menuItem('Asset map', form(T.map)), menuItem('Fuel receipt', form(T.fuelReceipt))];
    default:
      return [menuItem('Booking calendar', form(T.calendar)), ...driving.slice(1)];
  }
}

/** Where each account type starts. */
export const HOME_BY_TYPE = {
  Administrator: T.overview,
  'Asset Manager': T.overview,
  Supervisor: T.workshop,
  Technician: T.workshop,
  Operator: T.dailyDriver,
  Driver: T.calendar,
};

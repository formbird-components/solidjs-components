// What the fleet demo is made of: statuses and lookups (in Formbird FLEET's vocabulary), people,
// sites, pools, asset types, check sheets, service plans, materials and the assets themselves.
// The company and its people are fictional; sites are placed at suburb centres around Sydney.

/** Status lookups: name, colour, category (to do / in progress / done). */
export const STATUSES = {
  assetStatus: [
    ['Commission', '#8e4ec6', 'todo'],
    ['Active', '#2f9e5b', 'inprogress'],
    ['Decommission', '#d97706', 'inprogress'],
    ['Awaiting Disposal', '#e5484d', 'inprogress'],
    ['Disposed', '#8b8d98', 'done'],
  ],
  hireStatus: [
    ['Available For Hire', '#2f9e5b', 'todo'],
    ['On Hire', '#3e63dd', 'inprogress'],
    ['Unavailable For Hire', '#d1361f', 'done'],
  ],
  bookingStatus: [
    ['Asset Reserved', '#7c5cff', 'todo'],
    ['Hire Commenced', '#0b8fb3', 'inprogress'],
    ['Closed', '#8b8d98', 'done'],
    ['Cancelled', '#b0b0bc', 'done'],
  ],
  requestStatus: [
    ['Pending', '#a35bd1', 'todo'],
    ['Open', '#3e63dd', 'todo'],
    ['Drop Off', '#0b8fb3', 'inprogress'],
    ['In Progress', '#d97706', 'inprogress'],
    ['Work Complete', '#12a594', 'inprogress'],
    ['Pick Up', '#46a758', 'inprogress'],
    ['Closed', '#8b8d98', 'done'],
    ['Cancelled', '#b0b0bc', 'done'],
  ],
  workOrderStatus: [
    ['New', '#7c7f8f', 'todo'],
    ['In Progress', '#d97706', 'inprogress'],
    ['On Hold', '#e5484d', 'inprogress'],
    ['Complete', '#2f9e5b', 'done'],
  ],
};

/** Allowed moves, by status name (solid-status `transitions`). */
export const TRANSITIONS = {
  assetStatus: {
    Commission: ['Active'],
    Active: ['Decommission'],
    Decommission: ['Active', 'Awaiting Disposal'],
    'Awaiting Disposal': ['Active', 'Disposed'],
  },
  bookingStatus: {
    'Asset Reserved': ['Hire Commenced', 'Cancelled'],
    'Hire Commenced': ['Closed'],
  },
  requestStatus: {
    Pending: ['Open', 'Cancelled'],
    Open: ['Drop Off', 'In Progress', 'Cancelled'],
    'Drop Off': ['In Progress', 'Open'],
    'In Progress': ['Work Complete', 'Open'],
    'Work Complete': ['Pick Up', 'Closed', 'In Progress'],
    'Pick Up': ['Closed'],
    Cancelled: ['Pending'],
  },
  workOrderStatus: {
    New: ['In Progress'],
    'In Progress': ['On Hold', 'Complete'],
    'On Hold': ['In Progress'],
    Complete: ['In Progress'],
  },
};

/** Request statuses during which the asset is in the workshop (Unavailable For Hire). */
export const IN_WORKSHOP = ['Drop Off', 'In Progress', 'Work Complete'];

/** Simple lookups: names in order. */
export const LOOKUP_VALUES = {
  bookingReason: ['Client site visit', 'Field work', 'Delivery run', 'Training', 'Maintenance', 'Commuter Use'],
  cancelReason: ['No longer required', 'Booked in error', 'Asset unavailable', 'Weather', 'Duplicate'],
  requestType: ['Repair/General Request', 'Service Request', 'Daily Driver Defect', 'Accident Damage', 'Registration and Insurance'],
  requestPriority: ['Urgent – Asset Out of Service', 'Non-Urgent – Asset Operational'],
  requestReason: ['Breakdown', 'Scheduled Maintenance', 'Driver Defect', 'Damage', 'Modification', 'Compliance'],
  closeReason: ['Duplicate', 'Outside Of Workshop Responsibility', 'Not required'],
  workOrderType: ['PM Service', 'Repair', 'Diagnose', 'Tyres', 'Pre/Post Hire Inspection', 'Accident Data Collection'],
  disposedBy: ['Auction', 'Insurance Write Off', 'Lost/Stolen', 'Wrecked For Parts', 'Traded', 'Lease Return'],
  fuelType: ['Diesel', 'Unleaded 91', 'Premium Unleaded 95', 'Electric'],
  department: ['Field Services', 'Logistics', 'Facilities', 'Corporate'],
};

/** Vehicle hire pools and who books from them. */
export const POOLS = [
  { key: 'field', name: 'Field Services pool' },
  { key: 'corporate', name: 'Corporate pool' },
  { key: 'logistics', name: 'Logistics pool' },
  { key: 'plant', name: 'Plant pool' },
];

/** Sites (suburb centres). Workshops repair; depots and the office keep pool assets. */
export const LOCATIONS = [
  { key: 'alexandria', name: 'Alexandria Depot', type: 'Depot', code: 'ALX', suburb: 'Alexandria', postcode: '2015', at: [151.196, -33.9105] },
  { key: 'alexandria-ws', name: 'Alexandria Workshop', type: 'Workshop', code: 'ALW', suburb: 'Alexandria', postcode: '2015', at: [151.1918, -33.9082] },
  { key: 'parramatta', name: 'Parramatta Depot', type: 'Depot', code: 'PAR', suburb: 'Parramatta', postcode: '2150', at: [151.0011, -33.815] },
  { key: 'wetherill', name: 'Wetherill Park Workshop', type: 'Workshop', code: 'WPW', suburb: 'Wetherill Park', postcode: '2164', at: [150.905, -33.846] },
  { key: 'macquarie', name: 'Macquarie Park Office', type: 'Office', code: 'MQP', suburb: 'Macquarie Park', postcode: '2113', at: [151.124, -33.7763] },
];

/** Where vehicles go: suburb centres for booking destinations and positions on the road. */
export const DESTINATIONS = [
  ['Chatswood', 151.1823, -33.7969], ['Bondi Junction', 151.2502, -33.8916], ['Hurstville', 151.1022, -33.9673],
  ['Liverpool', 150.9233, -33.9213], ['Penrith', 150.6943, -33.7507], ['Blacktown', 150.9063, -33.7709],
  ['Manly', 151.2846, -33.7969], ['Sutherland', 151.0576, -34.0311], ['Campbelltown', 150.8144, -34.0651],
  ['Ryde', 151.1046, -33.8149], ['Burwood', 151.1036, -33.8775], ['Bankstown', 151.0345, -33.9171],
  ['Mascot', 151.1937, -33.9257], ['North Sydney', 151.2073, -33.8389], ['Castle Hill', 151.0029, -33.7314],
];

/**
 * People and their roles (Formbird FLEET account types). `keys` are access keys by name (see
 * model.mjs KEYS); licences are what they may drive or operate.
 */
export const PEOPLE = [
  { key: 'olivia', first: 'Olivia', last: 'Bennett', title: 'Fleet Administrator', type: 'Administrator', keys: ['admin', 'manager', 'workshop', 'supervisor'], pools: ['field', 'corporate', 'logistics', 'plant'], licences: ['C', 'MR', 'LF'], department: 'Corporate', home: 'alexandria' },
  { key: 'marcus', first: 'Marcus', last: 'Reid', title: 'Asset Manager', type: 'Asset Manager', keys: ['manager'], pools: ['field', 'corporate', 'logistics', 'plant'], licences: ['C', 'LR'], department: 'Corporate', home: 'macquarie' },
  { key: 'priya', first: 'Priya', last: 'Shah', title: 'Workshop Supervisor', type: 'Supervisor', keys: ['workshop', 'supervisor'], pools: ['field', 'logistics'], licences: ['C', 'HR', 'LF'], department: 'Facilities', home: 'alexandria-ws' },
  { key: 'tom', first: 'Tom', last: 'Nguyen', title: 'Mechanic', type: 'Technician', keys: ['workshop'], pools: ['field'], licences: ['C', 'MR'], department: 'Facilities', home: 'alexandria-ws' },
  { key: 'jack', first: 'Jack', last: "O'Connor", title: 'Heavy Vehicle Mechanic', type: 'Technician', keys: ['workshop'], pools: ['logistics'], licences: ['C', 'HR'], department: 'Facilities', home: 'wetherill' },
  { key: 'sofia', first: 'Sofia', last: 'Russo', title: 'Field Technician', type: 'Driver', keys: [], pools: ['field'], licences: ['C'], department: 'Field Services', home: 'alexandria' },
  { key: 'liam', first: 'Liam', last: 'Walsh', title: 'Field Technician', type: 'Driver', keys: [], pools: ['field', 'logistics'], licences: ['C', 'LR'], department: 'Field Services', home: 'alexandria' },
  { key: 'grace', first: 'Grace', last: 'Kim', title: 'Plant Operator', type: 'Operator', keys: [], pools: ['plant', 'logistics'], licences: ['C', 'MR', 'LF', 'EWP', 'EX'], department: 'Field Services', home: 'parramatta' },
  { key: 'daniel', first: 'Daniel', last: 'Moore', title: 'Logistics Coordinator', type: 'Driver', keys: [], pools: ['logistics', 'corporate'], licences: ['C', 'MR'], department: 'Logistics', home: 'alexandria' },
  { key: 'ava', first: 'Ava', last: 'Thompson', title: 'Account Manager', type: 'Driver', keys: [], pools: ['corporate'], licences: ['C'], department: 'Corporate', home: 'macquarie' },
  { key: 'noah', first: 'Noah', last: 'Patel', title: 'Facilities Officer', type: 'Driver', keys: [], pools: ['field', 'corporate'], licences: ['C'], department: 'Facilities', home: 'parramatta' },
];

/** Check sheets (Daily Driver pre-starts): [question, category, mandatory, instruction]. */
export const CHECK_SHEETS = {
  light: {
    name: 'Light Vehicle Daily Driver',
    items: [
      ['Tyres: tread, pressure and damage', 'Exterior', true, 'At least 1.5 mm of tread; no cuts, bulges or exposed cords.'],
      ['Lights, indicators and hazards', 'Exterior', true],
      ['Windscreen and mirrors', 'Exterior', true],
      ['Body damage', 'Exterior', false, 'Note any new dents or scratches so they are not blamed on the next driver.'],
      ['Engine oil level', 'Under the bonnet', true],
      ['Coolant level', 'Under the bonnet', false],
      ['Washer fluid', 'Under the bonnet', false],
      ['Brakes and handbrake', 'Cabin', true],
      ['Seatbelts', 'Cabin', true],
      ['Horn and wipers', 'Cabin', false],
      ['Dashboard warning lights', 'Cabin', true],
      ['First aid kit and fire extinguisher', 'Safety equipment', false],
    ],
  },
  heavy: {
    name: 'Heavy Vehicle Daily Driver',
    items: [
      ['Tyres and wheel nuts', 'Exterior', true],
      ['Lights, reflectors and beacons', 'Exterior', true],
      ['Mirrors and windscreen', 'Exterior', true],
      ['Body, tray and tailgate', 'Exterior', false],
      ['Load restraints (straps, chains, gates)', 'Load', true, 'Check rated straps for cuts and frayed stitching.'],
      ['Load within GVM', 'Load', true],
      ['Engine oil and coolant', 'Engine', true],
      ['Fuel and AdBlue', 'Engine', true],
      ['Leaks under the vehicle', 'Engine', true],
      ['Service and park brakes', 'Cabin', true],
      ['Air pressure builds normally', 'Cabin', false],
      ['Seatbelt and seat', 'Cabin', true],
      ['Dashboard warning lights', 'Cabin', true],
      ['Reversing alarm and camera', 'Safety equipment', true],
      ['Fire extinguisher', 'Safety equipment', true],
      ['Wheel chocks and triangles', 'Safety equipment', false],
    ],
  },
  plant: {
    name: 'Plant Pre-Operational Check',
    items: [
      ['Hydraulic hoses and fittings: no leaks', 'Hydraulics', true],
      ['Hydraulic oil level', 'Hydraulics', true],
      ['Forks, chains or bucket: no cracks or wear', 'Attachments', true],
      ['Tyres or tracks', 'Attachments', true],
      ['Guards and covers in place', 'Structure', true],
      ['Data plate readable', 'Structure', false],
      ['Horn, lights and beacon', 'Controls', true],
      ['Emergency stop works', 'Controls', true, 'Press the emergency stop: all motion must stop.'],
      ['Seatbelt or harness point', 'Controls', true],
      ['Fluid leaks under the machine', 'Controls', false],
    ],
  },
  trailer: {
    name: 'Trailer Check',
    items: [
      ['Coupling and safety chains', 'Coupling', true],
      ['Electrical plug and lights', 'Coupling', true],
      ['Tyres and wheel bearings', 'Running gear', true],
      ['Brakes (if fitted)', 'Running gear', false],
      ['Load secured and covered', 'Load', true],
      ['Registration plate and label', 'Load', false],
    ],
  },
};

/** Service plans (Service Definitions): intervals and lead for "Due Soon", and the service checks. */
export const SERVICE_PLANS = {
  light: {
    name: 'Light Vehicle Service', weeks: 26, meter: 10000, leadWeeks: 4, leadMeter: 1000,
    tasks: ['Change engine oil and filter', 'Replace air filter (every second service)', 'Check brakes and pads', 'Rotate tyres and set pressures', 'Check steering and suspension', 'Check battery and charging', 'Top up fluids', 'Road test'],
  },
  ev: {
    name: 'Electric Vehicle Service', weeks: 52, meter: 25000, leadWeeks: 4, leadMeter: 2000,
    tasks: ['Replace cabin filter', 'Check brakes (regenerative wear)', 'Rotate tyres and set pressures', 'Check high-voltage system warnings', 'Check 12 V battery', 'Road test'],
  },
  heavy: {
    name: 'Heavy Vehicle Service', weeks: 13, meter: 15000, leadWeeks: 2, leadMeter: 1500,
    tasks: ['Change engine oil and filters', 'Drain fuel water separator', 'Check air system and brakes', 'Grease chassis', 'Check suspension and U-bolts', 'Check lights and reflectors', 'Check load restraint anchor points', 'Road test'],
  },
  plant: {
    name: 'Plant Service', weeks: 26, meter: 250, leadWeeks: 4, leadMeter: 25,
    tasks: ['Change engine or gearbox oil', 'Check hydraulic hoses and oil', 'Grease pivot points', 'Check forks, chains or bucket wear', 'Test safety interlocks and emergency stop', 'Check tyres or tracks'],
  },
  trailer: {
    name: 'Trailer Service', weeks: 52, meter: 0, leadWeeks: 4, leadMeter: 0,
    tasks: ['Repack wheel bearings', 'Check coupling and chains', 'Check lights and wiring', 'Check tyres'],
  },
};

/**
 * Asset types: icon, class (IPWEA), meter, licence needed, check sheet, service plan, booking limits
 * and hire rates per hour and per day.
 */
export const ASSET_TYPES = [
  { key: 'car', name: 'Passenger Car', kind: 'car', cls: 'Light Vehicle', meter: 'km', licence: 'C', sheet: 'light', plan: 'light', maxHours: 72, hourly: 12, daily: 75, fuel: 'Unleaded 91', tank: 50, range: 750 },
  { key: 'ev', name: 'Electric Car', kind: 'car', cls: 'Light Vehicle', meter: 'km', licence: 'C', sheet: 'light', plan: 'ev', maxHours: 72, hourly: 10, daily: 60, fuel: 'Electric', tank: 0, range: 420 },
  { key: 'van', name: 'Panel Van', kind: 'van', cls: 'Light Vehicle', meter: 'km', licence: 'C', sheet: 'light', plan: 'light', maxHours: 48, hourly: 16, daily: 95, fuel: 'Diesel', tank: 70, range: 800 },
  { key: 'ute', name: 'Dual Cab Ute', kind: 'ute', cls: 'Light Vehicle', meter: 'km', licence: 'C', sheet: 'light', plan: 'light', maxHours: 48, hourly: 18, daily: 110, fuel: 'Diesel', tank: 80, range: 900 },
  { key: 'light-truck', name: 'Light Truck 4.5 t', kind: 'truck', cls: 'Heavy Vehicle', meter: 'km', licence: 'LR', sheet: 'heavy', plan: 'heavy', maxHours: 24, hourly: 40, daily: 260, fuel: 'Diesel', tank: 100, range: 800 },
  { key: 'rigid', name: 'Medium Rigid Truck', kind: 'truck', cls: 'Heavy Vehicle', meter: 'km', licence: 'MR', sheet: 'heavy', plan: 'heavy', maxHours: 24, hourly: 55, daily: 340, fuel: 'Diesel', tank: 200, range: 1000 },
  { key: 'trailer', name: 'Box Trailer', kind: 'trailer', cls: 'Attachment', meter: 'km', licence: 'C', sheet: 'trailer', plan: 'trailer', maxHours: 72, hourly: 5, daily: 30, fuel: '', tank: 0, range: 0 },
  { key: 'forklift', name: 'Forklift', kind: 'forklift', cls: 'Plant', meter: 'hours', licence: 'LF', sheet: 'plant', plan: 'plant', maxHours: 12, hourly: 30, daily: 180, fuel: 'Diesel', tank: 60, range: 0 },
  { key: 'lift', name: 'Elevating Work Platform', kind: 'lift', cls: 'Plant', meter: 'hours', licence: 'EWP', sheet: 'plant', plan: 'plant', maxHours: 12, hourly: 35, daily: 200, fuel: '', tank: 0, range: 0 },
  { key: 'excavator', name: 'Mini Excavator', kind: 'excavator', cls: 'Yellow Plant', meter: 'hours', licence: 'EX', sheet: 'plant', plan: 'plant', maxHours: 12, hourly: 60, daily: 380, fuel: 'Diesel', tank: 40, range: 0 },
  { key: 'generator', name: 'Generator', kind: 'generator', cls: 'Plant', meter: 'hours', licence: '', sheet: 'plant', plan: 'plant', maxHours: 72, hourly: 15, daily: 90, fuel: 'Diesel', tank: 120, range: 0 },
];

/**
 * Parts and consumables in the workshop stores: [name, part number, unit, unit cost, quantity,
 * reorder threshold, store].
 */
export const MATERIALS = [
  ['Oil filter (light vehicle)', 'OF-LV-90915', 'ea', 18.5, 22, 6, 'alexandria-ws'],
  ['Engine oil 5W-30', 'OIL-5W30', 'L', 12, 140, 40, 'alexandria-ws'],
  ['Diesel engine oil 15W-40', 'OIL-15W40', 'L', 9.5, 220, 60, 'wetherill'],
  ['Air filter (light vehicle)', 'AF-LV-17801', 'ea', 34, 9, 4, 'alexandria-ws'],
  ['Cabin filter', 'CF-87139', 'ea', 26, 12, 4, 'alexandria-ws'],
  ['Brake pads, front (van)', 'BP-VAN-F', 'set', 96, 3, 2, 'alexandria-ws'],
  ['Brake pads, rear (ute)', 'BP-UTE-R', 'set', 88, 4, 2, 'alexandria-ws'],
  ['Wiper blades (pair)', 'WB-600-450', 'pair', 32, 10, 4, 'alexandria-ws'],
  ['Coolant, long life', 'COOL-LL', 'L', 7.5, 60, 20, 'alexandria-ws'],
  ['AdBlue', 'ADBLUE-10', 'L', 1.6, 180, 50, 'wetherill'],
  ['Tyre 215/70R16 (van)', 'TY-2157016', 'ea', 210, 6, 4, 'alexandria-ws'],
  ['Tyre 265/65R17 (ute)', 'TY-2656517', 'ea', 245, 3, 4, 'alexandria-ws'],
  ['Hydraulic oil ISO 46', 'HYD-46', 'L', 6.8, 90, 30, 'wetherill'],
  ['Trailer bearing kit', 'TB-KIT-LM', 'ea', 42, 5, 2, 'wetherill'],
  ['Truck oil filter', 'OF-HV-1R0739', 'ea', 64, 8, 4, 'wetherill'],
  ['Fuel filter (truck)', 'FF-HV-326', 'ea', 58, 2, 3, 'wetherill'],
];

/**
 * The fleet: [ID, type, make, model, year, rego, home site, pool, lifecycle, km or hours].
 * Lifecycle is Active unless given.
 */
export const ASSETS = [
  ['V-201', 'van', 'Toyota', 'HiAce LWB', 2023, 'CX45LM', 'alexandria', 'field', 'Active', 38420],
  ['V-202', 'van', 'Toyota', 'HiAce LWB', 2022, 'DE18QA', 'alexandria', 'field', 'Active', 61870],
  ['V-203', 'van', 'Ford', 'Transit Custom', 2023, 'DF12QR', 'alexandria', 'field', 'Active', 29110],
  ['V-204', 'van', 'Renault', 'Trafic', 2021, 'CW07HT', 'alexandria', 'logistics', 'Active', 88340],
  ['V-205', 'van', 'Hyundai', 'Staria Load', 2024, 'EB33NP', 'alexandria', 'logistics', 'Active', 9450],
  ['V-206', 'van', 'Toyota', 'HiAce', 2020, 'BZ62KD', 'parramatta', 'field', 'Active', 112400],
  ['U-301', 'ute', 'Toyota', 'HiLux SR', 2023, 'DG41MX', 'alexandria', 'field', 'Active', 42230],
  ['U-302', 'ute', 'Ford', 'Ranger XL', 2022, 'DA90LS', 'alexandria', 'field', 'Active', 57760],
  ['U-303', 'ute', 'Isuzu', 'D-Max SX', 2021, 'CU55RB', 'alexandria', 'field', 'Active', 79310],
  ['U-304', 'ute', 'Mitsubishi', 'Triton GLX', 2022, 'DB27YT', 'parramatta', 'field', 'Active', 50120],
  ['U-305', 'ute', 'Toyota', 'HiLux Workmate', 2020, 'BX19FW', 'parramatta', 'field', 'Active', 103900],
  ['C-101', 'car', 'Toyota', 'Corolla Hybrid', 2023, 'DH55PL', 'parramatta', 'corporate', 'Active', 24150],
  ['C-102', 'car', 'Toyota', 'Camry Hybrid', 2022, 'DC72GK', 'parramatta', 'corporate', 'Active', 46380],
  ['C-103', 'car', 'Toyota', 'Corolla Hybrid', 2024, 'EC10TR', 'macquarie', 'corporate', 'Active', 8830],
  ['C-104', 'car', 'Mazda', 'CX-5 Maxx', 2019, 'BN84VJ', 'macquarie', 'corporate', 'Decommission', 131200],
  ['E-151', 'ev', 'Tesla', 'Model 3', 2023, 'EV23TM', 'macquarie', 'corporate', 'Active', 31560],
  ['E-152', 'ev', 'MG', 'ZS EV', 2024, 'EV41MG', 'macquarie', 'corporate', 'Active', 12090],
  ['E-153', 'ev', 'BYD', 'Atto 3', 2025, 'EV07BY', 'macquarie', 'corporate', 'Commission', 120],
  ['T-401', 'light-truck', 'Isuzu', 'NPR 45-155', 2020, 'XQ41TK', 'alexandria', 'logistics', 'Active', 142300],
  ['T-402', 'light-truck', 'Hino', '300 Series 616', 2022, 'XR08HN', 'alexandria', 'logistics', 'Active', 68800],
  ['T-403', 'rigid', 'Isuzu', 'FRR 110-240', 2019, 'XN77IS', 'wetherill', 'logistics', 'Active', 188450],
  ['T-404', 'rigid', 'Isuzu', 'FRR 110-260', 2021, 'XT30IS', 'wetherill', 'logistics', 'Active', 121700],
  ['T-405', 'rigid', 'Hino', '500 FC 1124', 2015, 'XK19HN', 'wetherill', 'logistics', 'Awaiting Disposal', 402100],
  ['TR-501', 'trailer', 'Brentwood', 'Box Trailer 8x5', 2018, 'TD42AB', 'alexandria', 'field', 'Active', 0],
  ['TR-502', 'trailer', 'Sureweld', 'Plant Trailer 2.7 t', 2019, 'TE88PL', 'parramatta', 'plant', 'Active', 0],
  ['F-601', 'forklift', 'Toyota', '8FG25', 2019, '', 'alexandria', 'plant', 'Active', 4123],
  ['F-602', 'forklift', 'Toyota', '8FG18', 2017, '', 'parramatta', 'plant', 'Active', 7740],
  ['F-603', 'forklift', 'Toyota', '8FD30', 2020, '', 'wetherill', 'plant', 'Active', 3310],
  ['L-651', 'lift', 'Genie', 'GS-1930 Scissor Lift', 2021, '', 'alexandria', 'plant', 'Active', 612],
  ['L-652', 'lift', 'JLG', '450AJ Boom Lift', 2019, '', 'wetherill', 'plant', 'Active', 1845],
  ['X-701', 'excavator', 'Kubota', 'U17-3', 2021, '', 'parramatta', 'plant', 'Active', 1288],
  ['X-702', 'excavator', 'Kubota', 'KX040-4', 2020, '', 'wetherill', 'plant', 'Active', 2410],
  ['G-801', 'generator', 'Atlas Copco', 'QAS 20', 2020, '', 'alexandria', 'plant', 'Active', 2980],
  ['G-802', 'generator', 'Cummins', 'C60 D5', 2021, '', 'wetherill', 'plant', 'Active', 1410],
];

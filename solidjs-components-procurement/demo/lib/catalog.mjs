// What the procurement demo is made of: Ironbark Engineering's people and reporting lines, cost
// centres and their budgets, suppliers and their catalogues, the delegations of authority, and the
// story the seed tells about this week's purchasing.

/** Request statuses: [name, colour, category]. */
export const STATUSES = {
  requestStatus: [
    ['Draft', '#7c7f8f', 'todo'],
    ['Submitted', '#d97706', 'inprogress'],
    ['Approved', '#3e63dd', 'inprogress'],
    ['Ordered', '#8e4ec6', 'inprogress'],
    ['Received', '#0b8fb3', 'inprogress'],
    ['Closed', '#2e9d5b', 'done'],
    ['Rejected', '#d33a3a', 'done'],
    ['Cancelled', '#8b8d98', 'done'],
  ],
};

/**
 * Status moves people make by hand. Submitted → Approved or Rejected happens through the approval
 * chain (the rules move it); a submitted request can be withdrawn to Draft, a rejected one revised.
 */
export const TRANSITIONS = {
  requestStatus: {
    Draft: ['Submitted', 'Cancelled'],
    Submitted: ['Draft', 'Cancelled'],
    Approved: ['Ordered', 'Cancelled'],
    Ordered: ['Received', 'Cancelled'],
    Received: ['Closed'],
    Closed: [],
    Rejected: ['Draft'],
    Cancelled: [],
  },
};

/** Moves only some people make (the status picker hides them from others; the rules enforce them). */
export const TRANSITION_KEYS = { requestStatus: { Ordered: ['procurement'], Closed: ['finance'] } };

export const CATEGORIES = ['IT equipment', 'Tools and equipment', 'PPE and safety', 'Facilities and maintenance', 'Equipment hire', 'Professional services', 'Marketing', 'Vehicles and tyres'];

/** Cost centres: code, name, owner, this year's budget, and how much was spent outside requests. */
export const COST_CENTRES = [
  { key: 'exe', code: '110', name: 'Executive and administration', owner: 'robert', budget: 60000, spent: 0.3 },
  { key: 'fin', code: '120', name: 'Finance', owner: 'anjali', budget: 40000, spent: 0.32 },
  { key: 'pro', code: '130', name: 'Procurement', owner: 'claire', budget: 15000, spent: 0.25 },
  { key: 'wsh', code: '210', name: 'Workshop', owner: 'tom', budget: 180000, spent: 0.28 },
  { key: 'fop', code: '220', name: 'Field operations', owner: 'jess', budget: 240000, spent: 0.3 },
  { key: 'its', code: '310', name: 'IT', owner: 'daniel', budget: 120000, remainingForLaptops: 37780 },
  { key: 'fac', code: '320', name: 'Facilities', owner: 'hannah', budget: 90000, spent: 0.36 },
  { key: 'hse', code: '330', name: 'Health, safety and environment', owner: 'amir', budget: 70000, spent: 0.3 },
  { key: 'mkt', code: '410', name: 'Marketing', owner: 'sophie', budget: 50000, spent: 0.42 },
];

/** The people: account type, title, cost centre, manager; `override`: approves going over budget. */
export const PEOPLE = [
  { key: 'robert', first: 'Robert', last: 'Hayes', type: 'Executive', title: 'Chief Executive', cc: 'exe', manager: null },
  { key: 'anjali', first: 'Anjali', last: 'Desai', type: 'Executive', title: 'Chief Financial Officer', cc: 'fin', manager: 'robert' },
  { key: 'greg', first: 'Greg', last: 'Mason', type: 'Executive', title: 'General Manager, Operations', cc: 'exe', manager: 'robert' },
  { key: 'claire', first: 'Claire', last: 'Donovan', type: 'Administrator', title: 'Procurement Manager', cc: 'pro', manager: 'anjali' },
  { key: 'marco', first: 'Marco', last: 'Ruiz', type: 'Procurement', title: 'Buyer', cc: 'pro', manager: 'claire' },
  { key: 'lachlan', first: 'Lachlan', last: 'Ward', type: 'Finance', title: 'Finance Manager', cc: 'fin', manager: 'anjali', override: true },
  { key: 'mia', first: 'Mia', last: 'Foster', type: 'Finance', title: 'Accounts Payable Officer', cc: 'fin', manager: 'lachlan' },
  { key: 'tom', first: 'Tom', last: 'Harris', type: 'Manager', title: 'Workshop Manager', cc: 'wsh', manager: 'greg' },
  { key: 'jess', first: 'Jess', last: 'Nguyen', type: 'Manager', title: 'Field Operations Manager', cc: 'fop', manager: 'greg' },
  { key: 'daniel', first: 'Daniel', last: 'Brooks', type: 'Manager', title: 'IT Manager', cc: 'its', manager: 'anjali' },
  { key: 'hannah', first: 'Hannah', last: 'Lee', type: 'Manager', title: 'Facilities Manager', cc: 'fac', manager: 'greg' },
  { key: 'amir', first: 'Amir', last: 'Haddad', type: 'Manager', title: 'HSE Manager', cc: 'hse', manager: 'greg' },
  { key: 'sophie', first: 'Sophie', last: 'Turner', type: 'Manager', title: 'Marketing Manager', cc: 'mkt', manager: 'robert' },
  { key: 'kai', first: 'Kai', last: 'Robinson', type: 'Employee', title: 'Heavy Diesel Fitter', cc: 'wsh', manager: 'tom' },
  { key: 'ella', first: 'Ella', last: 'Morris', type: 'Employee', title: 'Site Supervisor', cc: 'fop', manager: 'jess' },
  { key: 'noah', first: 'Noah', last: 'Kim', type: 'Employee', title: 'IT Support Engineer', cc: 'its', manager: 'daniel' },
  { key: 'ruby', first: 'Ruby', last: 'Clarke', type: 'Employee', title: 'Office Coordinator', cc: 'fac', manager: 'hannah' },
];

/** Suppliers: [key, name, category, approved, blocked, terms]. */
export const SUPPLIERS = [
  ['hydraulics', 'Hunter Hydraulics', 'Tools and equipment', true, false, '30 days'],
  ['tools', 'Sydney Tool Supply', 'Tools and equipment', true, false, '30 days'],
  ['tyres', 'Hunter Tyre and Wheel', 'Vehicles and tyres', true, false, '14 days'],
  ['ppe', 'Coastline PPE', 'PPE and safety', true, false, '30 days'],
  ['safegear', 'SafeGear Australia', 'PPE and safety', true, false, '30 days'],
  ['pinnacle', 'Pinnacle IT Solutions', 'IT equipment', true, false, '30 days'],
  ['datacore', 'DataCore Systems', 'IT equipment', true, false, '45 days'],
  ['northern', 'Northern Tech Distributors', 'IT equipment', true, false, '30 days'],
  ['powergen', 'PowerGen Hire and Sales', 'Equipment hire', true, false, '30 days'],
  ['ridgeway', 'Ridgeway Equipment', 'Equipment hire', true, false, '30 days'],
  ['survey', 'Precision Survey Rentals', 'Equipment hire', true, false, '14 days'],
  ['fitouts', 'Newcastle Fitouts', 'Facilities and maintenance', true, false, '30 days'],
  ['heritage', 'Heritage Joinery Co', 'Facilities and maintenance', false, false, '7 days'],
  ['signs', 'Brightside Signs and Print', 'Marketing', true, false, '30 days'],
  ['expo', 'ExpoWorks Displays', 'Marketing', true, false, '30 days'],
  ['freight', 'QuickFreight Couriers', 'Vehicles and tyres', true, false, '14 days'],
  ['cheap', 'Discount Imports Direct', 'Tools and equipment', false, true, 'Prepaid'],
];

/** Catalogue items: [supplier, name, part no, unit, unit cost ex GST]. */
export const ITEMS = [
  ['hydraulics', 'Hydraulic hose crimper, 1/4"–2"', 'HH-CR200', 'ea', 3480],
  ['hydraulics', 'Hydraulic hose, 1/2" 2-wire (per metre)', 'HH-H12-2W', 'm', 18.5],
  ['hydraulics', 'Hose fittings kit', 'HH-FK-60', 'kit', 245],
  ['tools', 'Impact wrench set, 1/2" cordless', 'STS-IW-12', 'set', 689],
  ['tools', 'Torque wrench 40–200 Nm', 'STS-TW-200', 'ea', 312],
  ['tools', 'Socket set, 3/4" drive', 'STS-SS-34', 'set', 425],
  ['tyres', 'Truck tyre 295/80R22.5', 'HTW-29580', 'ea', 740],
  ['tyres', 'Ute tyre 265/65R17 all terrain', 'HTW-26565', 'ea', 289],
  ['ppe', 'Nitrile work gloves (box of 100)', 'CP-GL-100', 'box', 38],
  ['ppe', 'Safety glasses, clear', 'CP-SG-C', 'ea', 6.5],
  ['ppe', 'Hi-vis vest, day/night', 'CP-HV-DN', 'ea', 14.9],
  ['safegear', 'Hard hat, vented', 'SG-HH-V', 'ea', 32],
  ['safegear', 'Fall arrest harness', 'SG-FA-H1', 'ea', 289],
  ['pinnacle', 'Engineering laptop, 32 GB, 1 TB, 3-year warranty', 'PIT-ENG-LT', 'ea', 2310],
  ['pinnacle', 'USB-C dock', 'PIT-DOCK', 'ea', 219],
  ['datacore', '27" monitor', 'DC-MON-27', 'ea', 389],
  ['northern', 'Rugged tablet', 'NTD-RT-10', 'ea', 1450],
  ['powergen', 'Generator 20 kVA, trailer mounted', 'PG-20KVA', 'ea', 9450],
  ['ridgeway', 'Generator 20 kVA', 'RE-G20', 'ea', 9125],
  ['survey', 'Robotic total station hire (per week)', 'PSR-RTS-W', 'week', 2400],
  ['fitouts', 'Partition wall (per metre)', 'NF-PW-M', 'm', 420],
  ['heritage', 'Heritage sash window restoration', 'HJ-SASH', 'ea', 1575],
  ['signs', 'Branded softshell jacket', 'BS-JKT', 'ea', 105],
  ['signs', 'Pull-up banner', 'BS-PUB', 'ea', 189],
  ['expo', 'Trade show stand 3 × 3 m, built and installed', 'EW-STAND-9', 'ea', 7800],
  ['freight', 'Freight, metro (per consignment)', 'QF-METRO', 'ea', 65],
];

/** Delegations of authority, by amount ex GST. */
export const TIERS = [
  { id: 'manager', label: 'Cost centre manager', fromAmount: 0, rule: 'owner' },
  { id: 'senior', label: 'Senior manager', fromAmount: 5000, rule: 'ownerManager' },
  { id: 'cfo', label: 'Chief Financial Officer', fromAmount: 25000, rule: 'people', approvers: ['anjali'] },
  { id: 'ceo', label: 'Chief Executive', fromAmount: 100000, rule: 'people', approvers: ['robert'] },
];

/**
 * This week's requests. `lines`: [catalogue part no or description, qty, unit cost (for free text),
 * kind]; `quotes`: [supplier, amount ex GST, valid days ahead (negative: expired), lead time days];
 * `chosen`: the chosen quote's supplier; `approved`: steps already approved (`step:rejected` rejects);
 * `asked` days ago.
 */
export const STORY = [
  {
    key: 'crimper', who: 'kai', cc: 'wsh', category: 'Tools and equipment', title: 'Hydraulic hose crimper for the workshop', status: 'Submitted', asked: 1,
    lines: [['HH-CR200', 1]], quotes: [['hydraulics', 3480, 25, 5]], chosen: 'hydraulics', approved: [],
    justification: 'We send hoses out to be made up, at about $90 a hose and two days each time. With our own crimper we make them on the spot.',
  },
  {
    key: 'generators', who: 'ella', cc: 'fop', category: 'Equipment hire', title: 'Two 20 kVA generators for the Maitland site', status: 'Submitted', asked: 3,
    lines: [['PG-20KVA', 2]], quotes: [['powergen', 18900, 20, 7], ['ridgeway', 18250, 30, 42], ['survey', 19980, 15, 10]], chosen: 'powergen',
    notCheapestReason: 'Ridgeway can’t deliver for six weeks, after the shutdown starts.', approved: ['manager'],
    justification: 'The Maitland pump station has no mains power during the upgrade. Hiring for the six months would cost more than buying.',
  },
  {
    key: 'laptops', who: 'noah', cc: 'its', category: 'IT equipment', title: 'Laptop refresh: 20 engineering laptops', status: 'Submitted', asked: 4,
    lines: [['PIT-ENG-LT', 20]], quotes: [['pinnacle', 46200, 28, 10], ['datacore', 48900, 28, 14], ['northern', 47350, 21, 12]], chosen: 'pinnacle', approved: ['manager'],
    justification: 'The design team’s laptops are five years old and out of warranty; three failed last month. CAD needs the 32 GB models.',
  },
  {
    key: 'windows', who: 'ruby', cc: 'fac', category: 'Facilities and maintenance', title: 'Restore the heritage windows, Hunter Street office', status: 'Submitted', asked: 2,
    lines: [['HJ-SASH', 8]], quotes: [['heritage', 12600, 40, 21]], chosen: 'heritage', approved: ['manager'],
    soleSupplierReason: 'The building is heritage listed: council requires a registered heritage joiner, and Heritage Joinery Co is the only one in the Hunter.',
    justification: 'Four sashes are rotten and two won’t close; water is getting into the boardroom.',
  },
  {
    key: 'stand', who: 'sophie', cc: 'mkt', category: 'Marketing', title: 'Trade show stand for the Mining Expo', status: 'Draft', asked: 1,
    lines: [['EW-STAND-9', 1]], quotes: [['expo', 7800, 30, 21], ['signs', 8450, 30, 28]], chosen: 'expo', approved: [],
    justification: 'Mining Expo in March: our first stand since 2019.',
  },
  {
    key: 'ppe', who: 'amir', cc: 'hse', category: 'PPE and safety', title: 'PPE restock for the field crews', status: 'Approved', asked: 3,
    lines: [['CP-GL-100', 30], ['CP-SG-C', 150], ['CP-HV-DN', 120], ['SG-HH-V', 40], ['QF-METRO', 2]], quotes: [['ppe', 5313, 30, 3]], chosen: 'ppe', approved: ['manager'],
    justification: 'Quarterly restock, and the new starters in January.',
  },
  {
    key: 'tyres', who: 'tom', cc: 'wsh', category: 'Vehicles and tyres', title: 'Eight drive tyres for the Kenworth fleet', status: 'Ordered', asked: 16, orderedAgo: 12, expectedAgo: 3,
    lines: [['HTW-29580', 8]], quotes: [['tyres', 5920, 20, 5]], chosen: 'tyres', approved: ['manager', 'senior'],
    justification: 'Three trucks are at the legal limit on their drive tyres.',
  },
  {
    key: 'survey', who: 'jess', cc: 'fop', category: 'Equipment hire', title: 'Robotic total station hire, four weeks', status: 'Received', asked: 40, orderedAgo: 36, receivedAgo: 6,
    lines: [['PSR-RTS-W', 4]], quotes: [['survey', 9600, 30, 2]], chosen: 'survey', approved: ['manager', 'senior'], invoice: { number: 'PSR-30418', amount: 11616 },
    justification: 'Set-out for the Raymond Terrace subdivision.',
  },
  {
    key: 'jackets', who: 'sophie', cc: 'mkt', category: 'Marketing', title: 'Branded jackets for the field team', status: 'Rejected', asked: 9,
    lines: [['BS-JKT', 60]], quotes: [['signs', 6300, 30, 14]], chosen: 'signs', approved: ['manager:rejected'],
    rejectComment: 'Not this year: the Mining Expo stand comes first. Let’s look again in July.',
    justification: 'Branded jackets for the field team before winter.',
  },
  {
    key: 'wrench', who: 'kai', cc: 'wsh', category: 'Tools and equipment', title: 'Cordless impact wrench set', status: 'Cancelled', asked: 20,
    lines: [['STS-IW-12', 1]], quotes: [], approved: [], cancelReason: 'Found one in the Cessnock workshop.',
    justification: 'Ours died.',
  },
];

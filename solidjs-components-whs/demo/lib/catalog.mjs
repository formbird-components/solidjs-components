// What the safety demo knows about Brightwater Group: workflows, lookups, people, sites, inspection
// checklists, and the incidents and hazards its seed draws from. demo/lib/build.mjs turns these
// into documents around "now".

import { CAUSE_CATEGORIES } from '../../packages/whs-kit/src/logic/rootcause.ts';
import { CONTROL_LEVELS } from '../../packages/whs-kit/src/logic/actions.ts';
import { TREATMENTS } from '../../packages/whs-kit/src/logic/incident.ts';
import { RATING_COLORS, RATINGS } from '../../packages/whs-kit/src/logic/risk.ts';

// ------------------------------------------------------------------------------------------------
// Workflows
// ------------------------------------------------------------------------------------------------

/** Statuses by kind: [name, colour, category]. */
export const STATUSES = {
  incidentStatus: [
    ['Reported', '#3e63dd', 'todo'],
    ['Under Review', '#d97706', 'inprogress'],
    ['Investigating', '#7c5cff', 'inprogress'],
    ['Actions Pending', '#0b8fb3', 'inprogress'],
    ['Closed', '#2e9d5b', 'done'],
    ['Rejected', '#8b8d98', 'done'],
  ],
  hazardStatus: [
    ['Reported', '#3e63dd', 'todo'],
    ['Assessed', '#7c5cff', 'inprogress'],
    ['Controls Pending', '#d97706', 'inprogress'],
    ['Controlled', '#2e9d5b', 'done'],
    ['Closed', '#8b8d98', 'done'],
    ['Rejected', '#8b8d98', 'done'],
  ],
  actionStatus: [
    ['Open', '#3e63dd', 'todo'],
    ['In Progress', '#d97706', 'inprogress'],
    ['Completed', '#0b8fb3', 'inprogress'],
    ['Verified', '#2e9d5b', 'done'],
    ['Cancelled', '#8b8d98', 'done'],
  ],
  inspectionStatus: [
    ['Scheduled', '#3e63dd', 'todo'],
    ['In Progress', '#d97706', 'inprogress'],
    ['Completed', '#2e9d5b', 'done'],
    ['Cancelled', '#8b8d98', 'done'],
  ],
};

/** Allowed status moves by kind (the status pickers offer these; the server rules enforce them). */
export const TRANSITIONS = {
  incidentStatus: {
    Reported: ['Under Review', 'Rejected'],
    'Under Review': ['Investigating', 'Actions Pending', 'Rejected'],
    Investigating: ['Actions Pending', 'Under Review'],
    'Actions Pending': ['Closed', 'Investigating'],
    Closed: ['Investigating'],
    Rejected: ['Under Review'],
  },
  hazardStatus: {
    Reported: ['Assessed', 'Rejected'],
    Assessed: ['Controls Pending', 'Controlled', 'Closed'],
    'Controls Pending': ['Controlled', 'Assessed'],
    Controlled: ['Controls Pending', 'Closed'],
    Closed: ['Assessed'],
    Rejected: ['Assessed'],
  },
  actionStatus: {
    Open: ['In Progress', 'Completed', 'Cancelled'],
    'In Progress': ['Completed', 'Open', 'Cancelled'],
    Completed: ['Verified', 'In Progress'],
    Verified: ['In Progress'],
    Cancelled: ['Open'],
  },
  inspectionStatus: {
    Scheduled: ['In Progress', 'Cancelled'],
    'In Progress': ['Completed', 'Scheduled'],
    Completed: ['In Progress'],
    Cancelled: ['Scheduled'],
  },
};

/** Who may move a record into a status, by kind (key names from model.mjs KEYS). */
export const TRANSITION_KEYS = {
  incidentStatus: {
    'Under Review': ['supervisor', 'whs', 'manager'],
    Investigating: ['whs'],
    'Actions Pending': ['whs'],
    Closed: ['whs', 'manager', 'executive'],
    Rejected: ['whs'],
  },
  hazardStatus: {
    Assessed: ['supervisor', 'whs', 'manager'],
    'Controls Pending': ['supervisor', 'whs', 'manager'],
    Controlled: ['whs', 'manager'],
    Closed: ['whs', 'manager'],
    Rejected: ['whs'],
  },
  actionStatus: {
    Verified: ['whs', 'manager'],
    Cancelled: ['whs', 'manager'],
  },
  inspectionStatus: {
    Cancelled: ['whs', 'manager'],
  },
};

// ------------------------------------------------------------------------------------------------
// Lookups
// ------------------------------------------------------------------------------------------------

export const RISK_RATINGS = RATINGS.map((name) => ({ name, color: RATING_COLORS[name] }));

export const INCIDENT_TYPES = ['Injury', 'Illness', 'Near miss', 'Property damage', 'Environmental', 'Dangerous incident', 'Vehicle incident'];

/** Natures of injury; `serious` ones make an incident notifiable (WHS Act s 36). */
export const INJURY_NATURES = [
  ['Sprain or strain'], ['Laceration'], ['Bruise or contusion'], ['Fracture'], ['Burn'], ['Foreign body in eye'], ['Crush injury'], ['Puncture wound'],
  ['Dislocation'], ['Concussion'], ['Dermatitis'], ['Hearing loss'], ['Heat stress'], ['Psychological injury'],
  ['Amputation', true], ['Serious head injury', true], ['Serious eye injury', true], ['Serious burn', true], ['Spinal injury', true],
  ['Degloving or scalping', true], ['Loss of bodily function', true], ['Serious laceration', true],
].map(([name, serious]) => ({ name, serious: !!serious }));

export const MECHANISMS = [
  'Fall from height', 'Slip, trip or fall on the same level', 'Lifting, carrying or pushing', 'Repetitive movement', 'Struck by a moving object',
  'Struck by a falling object', 'Hit by a vehicle or mobile plant', 'Caught in or between', 'Contact with a sharp object', 'Contact with heat or fire',
  'Contact with chemicals', 'Contact with electricity', 'Exposure to noise', 'Exposure to heat', 'Mental stress or harassment', 'Vehicle collision',
];

export { TREATMENTS };

/** Dangerous incidents (WHS Act s 37). */
export const DANGEROUS_KINDS = [
  'Uncontrolled escape, spillage or leakage of a substance',
  'Uncontrolled implosion, explosion or fire',
  'Uncontrolled escape of gas or steam',
  'Uncontrolled escape of a pressurised substance',
  'Electric shock',
  'Fall or release from height of plant, a substance or a thing',
  'Collapse, overturning or failure of plant that must be registered',
  'Collapse or partial collapse of a structure',
  'Collapse or failure of an excavation or its shoring',
  'Inrush of water, mud or gas',
];

export const PERSON_TYPES = ['Employee', 'Contractor', 'Labour hire worker', 'Visitor', 'Member of the public'];

export const HAZARD_CATEGORIES = [
  'Slips, trips and falls', 'Working at height', 'Manual handling', 'Plant and machinery', 'Electrical', 'Hazardous chemicals', 'Noise',
  'Traffic and mobile plant', 'Ergonomics', 'Psychosocial', 'Fire and emergency', 'Confined spaces', 'Heat and weather', 'Excavation',
];

export { CONTROL_LEVELS, CAUSE_CATEGORIES };

/** Pin kinds on the body map, and their colours. */
export const PIN_KINDS = [
  { name: 'Cut', color: '#d33a3a' },
  { name: 'Bruise', color: '#7c5cff' },
  { name: 'Burn', color: '#e5711a' },
  { name: 'Fracture', color: '#1f2937' },
  { name: 'Sprain or strain', color: '#0b8fb3' },
  { name: 'Crush', color: '#9d174d' },
  { name: 'Pain', color: '#c99700' },
  { name: 'Other', color: '#6b7280' },
];

// ------------------------------------------------------------------------------------------------
// People and sites
// ------------------------------------------------------------------------------------------------

/** People: account type sets their access keys (model.mjs ROLES), menu and home page. */
export const PEOPLE = [
  { key: 'priya', first: 'Priya', last: 'Raman', type: 'Administrator', title: 'Group WHS Manager', site: 'nsy' },
  { key: 'marcus', first: 'Marcus', last: 'Webb', type: 'Executive', title: 'General Manager, Operations', site: 'nsy' },
  { key: 'hannah', first: 'Hannah', last: 'Cole', type: 'WHS Advisor', title: 'WHS Advisor', site: 'wpk' },
  { key: 'tom', first: 'Tom', last: 'Nguyen', type: 'WHS Advisor', title: 'WHS Advisor, Projects', site: 'pru' },
  { key: 'daniel', first: 'Daniel', last: 'Okafor', type: 'Site Manager', title: 'Site Manager, Wetherill Park DC', site: 'wpk' },
  { key: 'sophie', first: 'Sophie', last: 'Laurent', type: 'Site Manager', title: 'Plant Manager, Botany', site: 'bot' },
  { key: 'ravi', first: 'Ravi', last: 'Patel', type: 'Site Manager', title: 'Project Manager, Parramatta Road Upgrade', site: 'pru' },
  { key: 'liam', first: 'Liam', last: 'Murphy', type: 'Supervisor', title: 'Warehouse Supervisor', site: 'wpk' },
  { key: 'grace', first: 'Grace', last: 'Kim', type: 'Supervisor', title: 'Shift Supervisor', site: 'bot' },
  { key: 'josh', first: 'Josh', last: 'Taylor', type: 'Supervisor', title: 'Site Foreman', site: 'pru' },
  { key: 'aisha', first: 'Aisha', last: 'Rahman', type: 'Worker', title: 'Forklift Operator', site: 'wpk' },
  { key: 'ben', first: 'Ben', last: 'Carter', type: 'Worker', title: 'Process Operator', site: 'bot' },
  { key: 'chloe', first: 'Chloe', last: 'Martin', type: 'Worker', title: 'Process Operator and Health and Safety Representative', site: 'bot' },
  { key: 'jack', first: 'Jack', last: 'Thompson', type: 'Worker', title: 'Civil Labourer', site: 'pru' },
  { key: 'mia', first: 'Mia', last: 'Wilson', type: 'Worker', title: 'Office Coordinator', site: 'nsy' },
];

/** Sites: where things happen, who runs them, how often they're inspected and with what. */
export const SITES = [
  {
    key: 'wpk', name: 'Wetherill Park Distribution Centre', code: 'WPK', type: 'Warehouse', at: [150.9003, -33.8478], suburb: 'Wetherill Park', postcode: '2164',
    manager: 'daniel', supervisor: 'liam', advisor: 'hannah', headcount: 120, hoursPerMonth: 19_000, inspectionWeeks: 4, sheet: 'warehouse',
    areas: ['Dock 3', 'Dock 7', 'Aisle 12', 'Aisle 4', 'Battery charging bay', 'Pick face, zone B', 'Dispatch counter', 'Wash bay', 'Car park'],
  },
  {
    key: 'bot', name: 'Botany Manufacturing Plant', code: 'BOT', type: 'Manufacturing', at: [151.2135, -33.9612], suburb: 'Banksmeadow', postcode: '2019',
    manager: 'sophie', supervisor: 'grace', advisor: 'hannah', headcount: 85, hoursPerMonth: 13_500, inspectionWeeks: 4, sheet: 'plant',
    areas: ['Line 2 conveyor', 'Line 1 filler', 'Chemical store', 'Refrigeration plant room', 'Maintenance workshop', 'Boiler house', 'Loading dock', 'Lunch room'],
  },
  {
    key: 'pru', name: 'Parramatta Road Upgrade', code: 'PRU', type: 'Construction project', at: [151.0418, -33.8602], suburb: 'Granville', postcode: '2142',
    manager: 'ravi', supervisor: 'josh', advisor: 'tom', headcount: 60, hoursPerMonth: 10_000, inspectionWeeks: 2, sheet: 'construction',
    areas: ['Bridge abutment, east', 'Trench, chainage 340', 'Scaffold, level 2', 'Laydown yard', 'Site compound', 'Traffic switch, Good St', 'Crane pad'],
  },
  {
    key: 'nsy', name: 'North Sydney Head Office', code: 'NSY', type: 'Office', at: [151.2073, -33.8399], suburb: 'North Sydney', postcode: '2060',
    manager: 'marcus', supervisor: 'priya', advisor: 'priya', headcount: 40, hoursPerMonth: 6_400, inspectionWeeks: 13, sheet: 'office',
    areas: ['Level 3 open plan', 'Kitchen, level 3', 'Stairwell B', 'Reception', 'Server room', 'Basement car park'],
  },
];

// ------------------------------------------------------------------------------------------------
// Inspection checklists: [question, category, mandatory]
// ------------------------------------------------------------------------------------------------

export const CHECK_SHEETS = {
  warehouse: {
    name: 'Warehouse inspection',
    items: [
      ['Racking free of damage (uprights, beams, base plates)', 'Racking', true],
      ['Rack load signs displayed and loads within them', 'Racking', true],
      ['Pedestrian walkways marked, clear and separated from forklifts', 'Traffic management', true],
      ['Forklift speed limits signed; mirrors and warning lights working', 'Traffic management', true],
      ['Forklift pre-start checks done this shift', 'Traffic management', true],
      ['Aisles and exits clear of stock and waste', 'Housekeeping', true],
      ['Floors clean, dry and in good repair', 'Housekeeping', false],
      ['Battery charging bay ventilated; eyewash tested this week', 'Plant', true],
      ['Dock levellers and restraints working', 'Plant', false],
      ['Mechanical lifting aids available and used', 'Manual handling', false],
      ['Heavy items stored between knee and shoulder height', 'Manual handling', false],
      ['Fire extinguishers tagged, accessible and signed', 'Fire and emergency', true],
      ['Emergency exits clear, signed and lit', 'Fire and emergency', true],
      ['First aid kit stocked; first aiders listed', 'Fire and emergency', false],
    ],
  },
  plant: {
    name: 'Manufacturing plant inspection',
    items: [
      ['Machine guards in place and interlocks working', 'Machine guarding', true],
      ['Conveyor nip points guarded; emergency stops tested', 'Machine guarding', true],
      ['Isolation points labelled; lockout kits available', 'Lockout and isolation', true],
      ['Safety data sheets current and available', 'Hazardous chemicals', true],
      ['Containers labelled; incompatible chemicals segregated', 'Hazardous chemicals', true],
      ['Bunding intact and free of spills', 'Hazardous chemicals', false],
      ['Eyewash stations and safety showers tested', 'Hazardous chemicals', true],
      ['Hearing protection zones signed; protection worn', 'Noise', false],
      ['Electrical equipment tested and tagged; leads undamaged', 'Electrical', true],
      ['Floors and walkways clean, dry and clear', 'Housekeeping', false],
      ['PPE available and worn as signed', 'PPE', true],
      ['Fire extinguishers and hose reels tagged and accessible', 'Fire and emergency', true],
      ['Ammonia detectors tested this month', 'Fire and emergency', true],
    ],
  },
  construction: {
    name: 'Construction site inspection',
    items: [
      ['Everyone on site inducted and signed in', 'Site access', true],
      ['Perimeter fencing secure; public excluded', 'Site access', true],
      ['Edge protection in place at every open edge', 'Working at height', true],
      ['Scaffold tags current and scaffolds unaltered', 'Working at height', true],
      ['Harnesses and anchor points inspected', 'Working at height', false],
      ['Excavations barricaded; shoring or benching in place', 'Excavation', true],
      ['Underground services located and marked before digging', 'Excavation', true],
      ['Mobile plant exclusion zones set up; spotters used', 'Plant', true],
      ['Traffic guidance scheme in place and followed', 'Traffic control', true],
      ['Electrical leads off the ground; RCDs tested', 'Electrical', true],
      ['Housekeeping: materials stacked, rubbish removed', 'Housekeeping', false],
      ['Shade, water and rest breaks provided in heat', 'Heat and weather', false],
      ['First aid kit and first aider on site', 'Emergency', true],
    ],
  },
  office: {
    name: 'Office inspection',
    items: [
      ['Workstations adjustable and set up for their users', 'Ergonomics', false],
      ['Electrical equipment tested and tagged', 'Electrical', true],
      ['No trailing cables or loose floor coverings', 'Slips and trips', true],
      ['Stairwells clear and handrails secure', 'Slips and trips', true],
      ['Kitchen appliances safe; hot water signed', 'Kitchen', false],
      ['Fire extinguishers tagged; exits clear and lit', 'Fire and emergency', true],
      ['Evacuation diagrams current; wardens listed', 'Fire and emergency', true],
      ['First aid kit stocked; first aiders listed', 'Fire and emergency', false],
      ['Server room door closed; no storage in front of switchboards', 'Electrical', false],
    ],
  },
};

/** The hazard category a failed check raises its hazard in, by the check's category. */
export const CHECK_CATEGORY_HAZARD = {
  Racking: 'Plant and machinery', 'Traffic management': 'Traffic and mobile plant', Housekeeping: 'Slips, trips and falls', Plant: 'Plant and machinery',
  'Manual handling': 'Manual handling', 'Fire and emergency': 'Fire and emergency', 'Machine guarding': 'Plant and machinery', 'Lockout and isolation': 'Plant and machinery',
  'Hazardous chemicals': 'Hazardous chemicals', Noise: 'Noise', Electrical: 'Electrical', PPE: 'Plant and machinery', 'Site access': 'Traffic and mobile plant',
  'Working at height': 'Working at height', Excavation: 'Excavation', 'Traffic control': 'Traffic and mobile plant', 'Heat and weather': 'Heat and weather',
  Emergency: 'Fire and emergency', Ergonomics: 'Ergonomics', 'Slips and trips': 'Slips, trips and falls', Kitchen: 'Slips, trips and falls', 'Added checks': 'Slips, trips and falls',
};

// ------------------------------------------------------------------------------------------------
// Incidents
// ------------------------------------------------------------------------------------------------

/**
 * Incident scenarios. `l` and `c` rate the worst credible outcome; `pins` are [view, region, kind]
 * on the body map; `why` is a five-whys chain (each a child of the one before), the last a root cause
 * in category `rootCategory`; `actions` are [title, control level].
 */
export const INCIDENT_SCENARIOS = [
  {
    key: 'carton-strain', sites: ['wpk'], area: 'Pick face, zone B', type: 'Injury', person: 'Employee', mechanism: 'Lifting, carrying or pushing',
    natures: ['Sprain or strain'], treatment: 'Medical treatment', pins: [['back', 'Lower back', 'Sprain or strain']], l: 4, c: 2,
    title: 'Lower back strain lifting cartons',
    description: 'Lifting 18 kg cartons from the bottom shelf onto a trolley. Felt a sharp pain in the lower back on the fourth lift.',
    immediate: 'Stopped picking, cold pack applied, referred to the clinic. Moved to light duties for the rest of the shift.',
    why: ['Heavy cartons were stored on the bottom shelf', 'The pick face is slotted by sales velocity, not weight', 'Slotting rules never considered manual handling'], rootCategory: 'Procedure',
    actions: [['Re-slot items over 15 kg between knee and shoulder height', 'Engineering'], ['Manual handling refresher for zone B pickers', 'Administrative']],
  },
  {
    key: 'strapping-cut', sites: ['wpk', 'bot'], area: 'Dock 7', type: 'Injury', person: 'Employee', mechanism: 'Contact with a sharp object',
    natures: ['Laceration'], treatment: 'First aid', pins: [['front', 'Left hand', 'Cut']], l: 3, c: 1,
    title: 'Cut finger cutting pallet strapping',
    description: 'Cutting steel strapping with a utility knife; the strap sprang back and cut the left index finger.',
    immediate: 'First aid: cleaned and dressed. Strapping cutters handed out to the dock team.',
    why: ['A utility knife was used instead of strapping cutters', 'Strapping cutters were not kept at the dock'], rootCategory: 'Plant and equipment',
    actions: [['Mount strapping cutters at every dock', 'Substitute'], ['Cut-resistant gloves for unstrapping', 'PPE']],
  },
  {
    key: 'wet-floor-slip', sites: ['wpk', 'bot', 'nsy'], area: 'Wash bay', type: 'Injury', person: 'Employee', mechanism: 'Slip, trip or fall on the same level',
    natures: ['Bruise or contusion'], treatment: 'First aid', pins: [['back', 'Right buttock', 'Bruise'], ['front', 'Right hand', 'Pain']], l: 3, c: 2,
    title: 'Slipped on a wet floor near the wash bay',
    description: 'Walked through the wash bay exit while the floor was being hosed; slipped and landed on the right side.',
    immediate: 'First aid, ice pack. Wet-floor signs put out; hosing paused while people pass.',
    why: ['The floor was wet across the walkway', 'Hosing drains across the exit route', 'The floor has no fall to the drain'], rootCategory: 'Environment',
    actions: [['Regrade the wash bay floor to fall to the drain', 'Engineering'], ['Anti-slip coating on the exit walkway', 'Engineering'], ['Wet-floor signs at both doors during cleaning', 'Administrative']],
  },
  {
    key: 'pallet-fall-near-miss', sites: ['wpk'], area: 'Aisle 4', type: 'Near miss', person: 'Employee', mechanism: 'Struck by a falling object', l: 3, c: 4,
    title: 'Carton fell from the top rack beside a picker',
    description: 'A carton fell from the top beam while a reach truck put away a pallet in the next bay. It landed a metre from a picker.',
    immediate: 'Aisle closed until the pallet was restacked and wrapped. Picker checked: not injured.',
    why: ['The pallet was not stretch-wrapped above the second layer', 'Inbound pallets are not checked before put-away', 'No standard for load stability at receipt'], rootCategory: 'Procedure',
    actions: [['Inbound pallet stability check at receipt', 'Administrative'], ['Anti-collapse mesh on top beams in aisle 4', 'Isolate']],
  },
  {
    key: 'forklift-pedestrian', sites: ['wpk'], area: 'Dock 3', type: 'Near miss', person: 'Employee', mechanism: 'Hit by a vehicle or mobile plant', l: 3, c: 5,
    title: 'Forklift reversed close to a pedestrian at dock 3',
    description: 'A forklift reversing out of a trailer passed within half a metre of a driver walking to the dock office.',
    immediate: 'Forklift stopped; driver escorted to the office. Toolbox talk at the next shift start.',
    why: ['The driver walked through the forklift operating area', 'There is no marked walkway from the trailers to the office', 'Dock layout was designed before the office moved'], rootCategory: 'Environment',
    actions: [['Fenced pedestrian walkway from the dock to the office', 'Isolate'], ['Blue-light reversing spotters on all forklifts', 'Engineering'], ['Visiting driver induction covers dock rules', 'Administrative']],
  },
  {
    key: 'conveyor-pinch', sites: ['bot'], area: 'Line 2 conveyor', type: 'Injury', person: 'Employee', mechanism: 'Caught in or between',
    natures: ['Crush injury', 'Laceration'], treatment: 'Lost time', pins: [['front', 'Right hand', 'Crush']], l: 3, c: 3, daysLost: 5,
    title: 'Hand caught in a conveyor nip point',
    description: 'Clearing a jammed bottle at the Line 2 transfer, the operator reached past the guard and the right hand was drawn into the nip point.',
    immediate: 'E-stop pressed by a co-worker. First aid, then ambulance to hospital (treated and released). Line isolated and locked out.',
    why: ['The operator reached into the transfer while the line was running', 'Clearing jams under power was normal practice', 'Isolating the line takes 15 minutes and costs output', 'The guard has a gap at the transfer'], rootCategory: 'Plant and equipment',
    actions: [['Fixed guard over the Line 2 transfer, with an interlocked access door', 'Isolate'], ['Jam-clearing tool and procedure, without reaching in', 'Engineering'], ['Lockout training for all line operators', 'Administrative']],
  },
  {
    key: 'chemical-splash', sites: ['bot'], area: 'Chemical store', type: 'Injury', person: 'Employee', mechanism: 'Contact with chemicals',
    natures: ['Burn', 'Foreign body in eye'], treatment: 'Medical treatment', pins: [['front', 'Face', 'Burn']], l: 2, c: 3,
    title: 'Caustic splash decanting cleaner',
    description: 'Decanting caustic cleaner from a 200 L drum into a bucket. It splashed onto the face; safety glasses were worn but not a face shield.',
    immediate: 'Eyes and face flushed at the eyewash for 15 minutes. Taken to the GP; mild burn to the cheek.',
    why: ['Cleaner was decanted by tipping the drum', 'There is no drum pump at the store', 'Decanting was never risk assessed'], rootCategory: 'Plant and equipment',
    actions: [['Drum pumps for all 200 L chemicals', 'Engineering'], ['Switch to pre-diluted cleaner in 20 L containers', 'Substitute'], ['Face shields at the decanting point', 'PPE']],
  },
  {
    key: 'ammonia-leak', sites: ['bot'], area: 'Refrigeration plant room', type: 'Dangerous incident', person: 'Employee', dangerous: 'Uncontrolled escape of gas or steam', l: 2, c: 5,
    title: 'Ammonia leak from a refrigeration valve',
    description: 'Ammonia detectors alarmed in the plant room. A packing gland on a valve was leaking. The building was evacuated; no-one was exposed.',
    immediate: 'Evacuated. Fire brigade attended; contractor isolated and repaired the valve. Area ventilated and gas-tested before re-entry.',
    why: ['A valve gland packing failed', 'The valve was overdue for its six-monthly service', 'Plant room maintenance is not in the maintenance system'], rootCategory: 'Organisation',
    actions: [['Add all refrigeration plant to the maintenance system', 'Administrative'], ['Replace the valve packing on all ammonia valves', 'Engineering']],
  },
  {
    key: 'scaffold-fall', sites: ['pru'], area: 'Scaffold, level 2', type: 'Injury', person: 'Contractor', mechanism: 'Fall from height',
    natures: ['Fracture', 'Serious head injury'], treatment: 'Hospitalised (in-patient)', pins: [['front', 'Left wrist', 'Fracture'], ['back', 'Back of head', 'Other']], l: 2, c: 5, daysLost: 21,
    title: 'Fell from scaffold level 2 through a removed handrail',
    description: 'A formwork contractor fell about 2.4 m from scaffold level 2 where a handrail had been removed to pass materials up. Landed on the laydown area.',
    immediate: 'First aid and ambulance; admitted to Westmead Hospital overnight. Area barricaded and left undisturbed for SafeWork NSW. Scaffold tagged out.',
    why: ['A handrail was removed to pass materials up', 'There was no loading bay on that lift', 'The scaffold design did not plan for material handling', 'Scaffold design is approved without the formwork sequence'], rootCategory: 'Procedure',
    actions: [['Install a gated loading bay on every scaffold lift used for materials', 'Engineering'], ['Scaffold alterations only by the scaffolder, with a new tag', 'Administrative'], ['Formwork sequence reviewed with every scaffold design', 'Administrative']],
  },
  {
    key: 'trench-wall', sites: ['pru'], area: 'Trench, chainage 340', type: 'Dangerous incident', person: 'Employee', dangerous: 'Collapse or failure of an excavation or its shoring', l: 2, c: 5,
    title: 'Trench wall slumped at chainage 340',
    description: 'A section of unshored trench wall about 1.6 m deep slumped overnight after rain. No-one was in the trench.',
    immediate: 'Trench barricaded; work stopped. Geotechnical engineer called to inspect.',
    why: ['The trench was left unshored overnight', 'Shoring boxes were all in use elsewhere', 'Excavation planning assumes dry weather'], rootCategory: 'Procedure',
    actions: [['Batter or shore every trench over 1.5 m before leaving it', 'Engineering'], ['Hire two more shoring boxes for the drainage works', 'Engineering']],
  },
  {
    key: 'heat-stress', sites: ['pru'], area: 'Traffic switch, Good St', type: 'Illness', person: 'Employee', mechanism: 'Exposure to heat',
    natures: ['Heat stress'], treatment: 'First aid', l: 3, c: 3,
    title: 'Traffic controller felt faint in the heat',
    description: 'A traffic controller felt dizzy and nauseous at 2 pm on a 38 °C day.',
    immediate: 'Moved into the air-conditioned site office, given water and electrolytes, sent home with a colleague.',
    why: ['Traffic controllers stood in the sun for long periods', 'No shade at the traffic switch', 'Heat plan does not cover traffic control'], rootCategory: 'Organisation',
    actions: [['Shade umbrellas at fixed traffic control points', 'Engineering'], ['Rotate traffic controllers every 45 minutes above 35 °C', 'Administrative']],
  },
  {
    key: 'ute-bollard', sites: ['pru', 'wpk'], area: 'Car park', type: 'Vehicle incident', person: 'Employee', mechanism: 'Vehicle collision', l: 3, c: 1,
    title: 'Ute reversed into a bollard',
    description: 'Reversing out of a bay, a site ute struck a steel bollard. Rear bumper damaged; no-one hurt.',
    immediate: 'Vehicle photographed and booked in for repair.',
    why: ['The driver did not see the bollard', 'The ute has no reversing camera'], rootCategory: 'Plant and equipment',
    actions: [['Fit reversing cameras to the remaining site utes', 'Engineering']],
  },
  {
    key: 'diesel-spill', sites: ['pru', 'wpk'], area: 'Laydown yard', type: 'Environmental', person: 'Contractor', l: 3, c: 2,
    title: 'Diesel spill while refuelling an excavator',
    description: 'About 40 L of diesel spilled on the ground when the refuelling nozzle was left unattended.',
    immediate: 'Spill kit used; contaminated soil bagged for disposal. Stormwater pit covered.',
    why: ['The nozzle was left unattended', 'The auto shut-off on the nozzle was broken', 'Refuelling equipment is not inspected'], rootCategory: 'Plant and equipment',
    actions: [['Replace the refuelling nozzle and add it to the pre-start', 'Engineering'], ['Refuel only on the bunded refuelling pad', 'Isolate']],
  },
  {
    key: 'customer-abuse', sites: ['wpk'], area: 'Dispatch counter', type: 'Illness', person: 'Employee', mechanism: 'Mental stress or harassment',
    natures: ['Psychological injury'], treatment: 'No treatment', l: 3, c: 2,
    title: 'Verbal abuse from a customer at the dispatch counter',
    description: 'A customer collecting an order shouted and swore at the counter clerk over a missing carton and refused to leave for 10 minutes.',
    immediate: 'Supervisor attended and asked the customer to leave. Employee offered the EAP and a break.',
    why: ['The customer was angry about a missing carton', 'Counter staff work alone with no way to call for help', 'The counter was not considered in the psychosocial risk assessment'], rootCategory: 'Organisation',
    actions: [['Duress button at the dispatch counter', 'Engineering'], ['Customer aggression procedure and training', 'Administrative']],
  },
  {
    key: 'carpet-trip', sites: ['nsy'], area: 'Level 3 open plan', type: 'Injury', person: 'Employee', mechanism: 'Slip, trip or fall on the same level',
    natures: ['Bruise or contusion'], treatment: 'First aid', pins: [['front', 'Right knee', 'Bruise']], l: 2, c: 1,
    title: 'Tripped on a lifted carpet tile',
    description: 'Tripped on the raised edge of a carpet tile near the printer and fell onto the right knee.',
    immediate: 'Ice pack. Tile taped down and building management asked to replace it.',
    why: ['A carpet tile edge had lifted', 'Building maintenance requests are not followed up'], rootCategory: 'Organisation',
    actions: [['Replace lifted carpet tiles on level 3', 'Eliminate']],
  },
  {
    key: 'eye-dust', sites: ['pru', 'bot'], area: 'Maintenance workshop', type: 'Injury', person: 'Employee', mechanism: 'Struck by a moving object',
    natures: ['Foreign body in eye'], treatment: 'Medical treatment', pins: [['front', 'Face', 'Other']], l: 3, c: 2,
    title: 'Metal fragment in the eye while grinding',
    description: 'Grinding a weld; a fragment got behind the safety glasses into the right eye.',
    immediate: 'Eye flushed; fragment removed at the medical centre.',
    why: ['Safety glasses left a gap at the side', 'Wraparound glasses were not stocked'], rootCategory: 'Plant and equipment',
    actions: [['Grinding only in the screened bay with extraction', 'Isolate'], ['Wraparound glasses and face shields for grinding', 'PPE']],
  },
  {
    key: 'electric-tingle', sites: ['bot', 'pru'], area: 'Maintenance workshop', type: 'Dangerous incident', person: 'Employee', dangerous: 'Electric shock', mechanism: 'Contact with electricity', l: 2, c: 4,
    title: 'Electric shock from a damaged extension lead',
    description: 'Felt a shock through the hand when picking up a power tool. The extension lead had a cut in its sheath.',
    immediate: 'Lead isolated and destroyed. Worker checked by the medical centre; ECG normal.',
    why: ['The lead had a cut sheath', 'Leads are only checked at test-and-tag every three months', 'No pre-use check of leads'], rootCategory: 'Procedure',
    actions: [['Pre-use visual check of leads and tools on the pre-start', 'Administrative'], ['RCD protection on every outlet in the workshop', 'Engineering']],
  },
  {
    key: 'shoulder-overreach', sites: ['wpk', 'bot'], area: 'Pick face, zone B', type: 'Injury', person: 'Labour hire worker', mechanism: 'Repetitive movement',
    natures: ['Sprain or strain'], treatment: 'Restricted duties', pins: [['front', 'Right shoulder', 'Sprain or strain']], l: 3, c: 2,
    title: 'Shoulder strain from repetitive overhead picking',
    description: 'A labour hire picker reported right shoulder pain after a week picking from the top shelf.',
    immediate: 'Moved to packing; GP certificate for restricted duties for two weeks.',
    why: ['Fast-moving items were slotted on the top shelf', 'Slotting is reviewed once a year'], rootCategory: 'Procedure',
    actions: [['Monthly slotting review including reach heights', 'Administrative'], ['Step platforms on every pick face', 'Engineering']],
  },
  {
    key: 'boiler-burn', sites: ['bot'], area: 'Boiler house', type: 'Injury', person: 'Employee', mechanism: 'Contact with heat or fire',
    natures: ['Burn'], treatment: 'Medical treatment', pins: [['front', 'Left forearm', 'Burn']], l: 2, c: 3,
    title: 'Burn to the forearm from an uninsulated steam pipe',
    description: 'Reaching past a steam line to read a gauge, the left forearm touched an uninsulated section of pipe.',
    immediate: 'Cooled under running water for 20 minutes; dressed at the medical centre.',
    why: ['A section of pipe had no lagging', 'Lagging removed for a repair was never replaced', 'No sign-off of reinstatement after repairs'], rootCategory: 'Procedure',
    actions: [['Re-lag the steam line in the boiler house', 'Isolate'], ['Reinstatement check on maintenance work orders', 'Administrative']],
  },
  {
    key: 'falling-tool', sites: ['pru'], area: 'Bridge abutment, east', type: 'Near miss', person: 'Contractor', mechanism: 'Struck by a falling object', l: 3, c: 4,
    title: 'Spanner dropped from the bridge deck',
    description: 'A spanner fell about 6 m from the deck edge into the exclusion zone below, near a labourer stacking materials.',
    immediate: 'Work at the deck edge stopped until toe boards were fitted.',
    why: ['There were no toe boards at the deck edge', 'Tools were not tethered', 'The exclusion zone below was not enforced'], rootCategory: 'Procedure',
    actions: [['Toe boards and mesh along the deck edge', 'Isolate'], ['Tool lanyards for all work at height', 'Engineering'], ['Spotter enforces the exclusion zone below', 'Administrative']],
  },
  {
    key: 'office-ergonomics', sites: ['nsy'], area: 'Level 3 open plan', type: 'Injury', person: 'Employee', mechanism: 'Repetitive movement',
    natures: ['Sprain or strain'], treatment: 'Medical treatment', pins: [['front', 'Right wrist', 'Pain'], ['back', 'Back of neck', 'Pain']], l: 3, c: 2,
    title: 'Wrist and neck pain from a laptop-only workstation',
    description: 'Reported ongoing right wrist and neck pain after months working from a laptop at a hot desk.',
    immediate: 'Ergonomic assessment booked; physiotherapy through the GP.',
    why: ['Hot desks have no monitors or keyboards', 'The hot-desk rollout skipped the ergonomic standard'], rootCategory: 'Organisation',
    actions: [['Monitor arms, keyboards and mice at every hot desk', 'Engineering'], ['Workstation set-up guide at each desk', 'Administrative']],
  },
  {
    key: 'battery-acid', sites: ['wpk'], area: 'Battery charging bay', type: 'Near miss', person: 'Employee', mechanism: 'Contact with chemicals', l: 2, c: 3,
    title: 'Battery acid spray while topping up',
    description: 'Topping up a forklift battery, electrolyte sprayed from an overfilled cell onto the operator\'s glasses.',
    immediate: 'Glasses and face rinsed at the eyewash; no injury.',
    why: ['Cells were filled by eye from a jug', 'Single-point watering system was broken'], rootCategory: 'Plant and equipment',
    actions: [['Repair the single-point watering system', 'Engineering']],
  },
  {
    key: 'noise', sites: ['bot'], area: 'Line 1 filler', type: 'Illness', person: 'Employee', mechanism: 'Exposure to noise',
    natures: ['Hearing loss'], treatment: 'Medical treatment', l: 4, c: 2,
    title: 'Hearing loss found at an annual audiometry test',
    description: 'Annual hearing test found a shift in hearing in both ears for a Line 1 operator.',
    immediate: 'Referred to an audiologist; moved off Line 1 pending results.',
    why: ['Line 1 noise is 94 dB(A) at the filler', 'Earmuffs are often not worn', 'Noise was never engineered down'], rootCategory: 'Plant and equipment',
    actions: [['Acoustic enclosure around the Line 1 filler', 'Engineering'], ['Hearing protection zone enforcement', 'Administrative']],
  },
];

/**
 * The incidents the demo tells its story with, `days` ago (fractions are hours), and where each is
 * now. Everything else is drawn from the scenarios over the last year.
 */
export const STORY_INCIDENTS = [
  { scenario: 'pallet-fall-near-miss', site: 'wpk', days: 0.12, status: 'Reported', reporter: 'aisha', involved: 'aisha' },
  { scenario: 'ammonia-leak', site: 'bot', days: 1.3, status: 'Under Review', reporter: 'grace', involved: 'ben', regulator: false },
  { scenario: 'customer-abuse', site: 'wpk', days: 2.2, status: 'Under Review', reporter: 'liam', involved: 'aisha' },
  { scenario: 'forklift-pedestrian', site: 'wpk', days: 6.4, status: 'Investigating', reporter: 'liam', involved: 'aisha', investigator: 'hannah', partialWhys: 2 },
  { scenario: 'scaffold-fall', site: 'pru', days: 9.2, status: 'Investigating', reporter: 'josh', involved: null, investigator: 'tom', regulator: true, partialWhys: 3, actionsOpen: true },
  { scenario: 'chemical-splash', site: 'bot', days: 16.5, status: 'Actions Pending', reporter: 'grace', involved: 'ben', investigator: 'hannah' },
  { scenario: 'ute-bollard', site: 'pru', days: 12.1, status: 'Actions Pending', reporter: 'josh', involved: 'jack', investigator: 'tom' },
  { scenario: 'conveyor-pinch', site: 'bot', days: 23.3, status: 'Closed', reporter: 'grace', involved: 'chloe', investigator: 'hannah', signedOff: 'sophie' },
  { scenario: 'carpet-trip', site: 'nsy', days: 31.2, status: 'Closed', reporter: 'mia', involved: 'mia', investigator: 'priya' },
  { scenario: 'trench-wall', site: 'pru', days: 148.4, status: 'Closed', reporter: 'josh', investigator: 'tom', signedOff: 'marcus' },
  { scenario: 'electric-tingle', site: 'bot', days: 203.3, status: 'Closed', reporter: 'grace', involved: 'ben', investigator: 'hannah', signedOff: 'marcus' },
];

/** How the background incidents' types are spread (weights). */
export const BACKGROUND_COUNT = 64;

// ------------------------------------------------------------------------------------------------
// Hazards: [title, category, description, inherent [l, c], residual [l, c] | null, controls [[title, level, state]], status]
// state: 'done' (in place), 'open' (planned)
// ------------------------------------------------------------------------------------------------

export const HAZARDS = {
  wpk: [
    ['Pedestrians crossing the forklift aisle at dock 3', 'Traffic and mobile plant', 'Drivers and staff walk across the forklift operating area between the trailers and the dock office.', [4, 5], [2, 5],
      [['Fenced pedestrian walkway from the dock to the office', 'Isolate', 'open'], ['Blue-light reversing spotters on all forklifts', 'Engineering', 'done'], ['Dock rules in the visiting driver induction', 'Administrative', 'done']], 'Controls Pending'],
    ['Damaged racking uprights in aisle 12', 'Plant and machinery', 'Two uprights have impact damage at the base; one is beyond the manufacturer\'s tolerance.', [3, 4], [1, 4],
      [['Replace the damaged uprights', 'Eliminate', 'done'], ['Column guards on every aisle-end upright', 'Isolate', 'done'], ['Monthly racking inspection by a competent person', 'Administrative', 'done']], 'Controlled'],
    ['Manual handling of 25 kg cartons at the pick face', 'Manual handling', 'Pickers lift cartons up to 25 kg from the bottom shelf, hundreds of times a shift.', [5, 2], [3, 2],
      [['Re-slot items over 15 kg between knee and shoulder height', 'Engineering', 'open'], ['Vacuum lifter for the heaviest SKUs', 'Engineering', 'open'], ['Team lifting over 20 kg', 'Administrative', 'done']], 'Controls Pending'],
    ['Battery charging bay: hydrogen and acid', 'Hazardous chemicals', 'Lead-acid batteries give off hydrogen while charging; electrolyte can spray when topping up.', [2, 5], [1, 4],
      [['Mechanical extraction in the charging bay', 'Engineering', 'done'], ['Single-point watering system', 'Engineering', 'done'], ['Face shield and gloves at the bay', 'PPE', 'done']], 'Controlled'],
    ['Wet floor at the wash bay exit', 'Slips, trips and falls', 'Hosing water drains across the walkway out of the wash bay.', [4, 2], [2, 2],
      [['Regrade the floor to fall to the drain', 'Engineering', 'open'], ['Anti-slip coating on the walkway', 'Engineering', 'done']], 'Controls Pending'],
    ['Customer aggression at the dispatch counter', 'Psychosocial', 'Counter staff work alone and deal with frustrated customers.', [3, 3], [2, 2],
      [['Duress button at the counter', 'Engineering', 'open'], ['Aggression procedure and training', 'Administrative', 'open']], 'Assessed'],
    ['Loading dock edge falls', 'Working at height', 'A 1.2 m drop at open dock doors when no trailer is present.', [3, 4], [1, 4],
      [['Dock doors interlocked with trailer restraints', 'Engineering', 'done']], 'Controlled'],
    ['Trailer creep during loading', 'Traffic and mobile plant', 'Trailers can move away from the dock while a forklift is driving in.', [2, 5], null, [], 'Reported'],
  ],
  bot: [
    ['Unguarded nip point at the Line 2 transfer', 'Plant and machinery', 'A gap in the guarding at the Line 2 transfer lets a hand reach the conveyor nip point.', [3, 4], [1, 4],
      [['Fixed guard with an interlocked access door', 'Isolate', 'done'], ['Jam-clearing tool and procedure', 'Engineering', 'done'], ['Lockout training for line operators', 'Administrative', 'done']], 'Controlled'],
    ['Ammonia refrigeration plant', 'Hazardous chemicals', 'The plant room holds 1.2 t of ammonia; a leak is toxic and can be flammable.', [2, 5], [1, 5],
      [['Gas detection linked to alarms and extraction', 'Engineering', 'done'], ['Valves serviced six-monthly in the maintenance system', 'Administrative', 'open'], ['Emergency plan and drills for an ammonia release', 'Administrative', 'done']], 'Controls Pending'],
    ['Decanting caustic cleaner from drums', 'Hazardous chemicals', 'Cleaner is tipped from 200 L drums into buckets.', [3, 3], [1, 2],
      [['Pre-diluted cleaner in 20 L containers', 'Substitute', 'done'], ['Drum pumps for the remaining 200 L chemicals', 'Engineering', 'done'], ['Face shields at the decanting point', 'PPE', 'done']], 'Controlled'],
    ['Noise at the Line 1 filler', 'Noise', 'Noise at the filler is 94 dB(A), above the exposure standard.', [4, 2], [3, 2],
      [['Acoustic enclosure around the filler', 'Engineering', 'open'], ['Hearing protection zone, enforced', 'Administrative', 'done'], ['Earmuffs and fitted plugs', 'PPE', 'done']], 'Controls Pending'],
    ['Uninsulated steam pipe in the boiler house', 'Fire and emergency', 'Lagging is missing on a section of steam pipe at hand height.', [2, 3], [1, 2],
      [['Re-lag the steam line', 'Isolate', 'done']], 'Controlled'],
    ['Forklift and pedestrians at the loading dock', 'Traffic and mobile plant', 'Pedestrians cross the dock apron to reach the lunch room.', [3, 4], [2, 4],
      [['Painted walkway with bollards', 'Isolate', 'done'], ['Forklift speed limiters at 8 km/h', 'Engineering', 'done']], 'Controlled'],
    ['Confined space: the effluent pit', 'Confined spaces', 'The effluent pit needs entry for cleaning twice a year.', [2, 5], [1, 5],
      [['Pit cleaned by vacuum truck without entry', 'Eliminate', 'done']], 'Controlled'],
    ['Electrical leads in the maintenance workshop', 'Electrical', 'Leads and tools are checked only at three-monthly test and tag.', [3, 4], [2, 3],
      [['RCD protection on every outlet', 'Engineering', 'open'], ['Pre-use check of leads on the pre-start', 'Administrative', 'done']], 'Controls Pending'],
  ],
  pru: [
    ['Falls from scaffold where handrails are removed', 'Working at height', 'Handrails are removed to pass materials up between lifts.', [3, 5], [1, 5],
      [['Gated loading bays on every lift used for materials', 'Engineering', 'open'], ['Alterations only by the scaffolder, with a new tag', 'Administrative', 'open']], 'Controls Pending'],
    ['Trench collapse in the drainage works', 'Excavation', 'Trenches up to 2.2 m deep in clay that softens after rain.', [3, 5], [1, 5],
      [['Shore or batter every trench over 1.5 m', 'Engineering', 'done'], ['Daily excavation inspection after rain', 'Administrative', 'done']], 'Controlled'],
    ['Heat exposure for traffic controllers', 'Heat and weather', 'Fixed traffic control points have no shade; summer days reach 40 °C.', [4, 3], [2, 3],
      [['Shade at fixed control points', 'Engineering', 'done'], ['Rotation every 45 minutes above 35 °C', 'Administrative', 'done'], ['Cooling vests and electrolytes', 'PPE', 'done']], 'Controlled'],
    ['Mobile plant and workers in the laydown yard', 'Traffic and mobile plant', 'Excavators, a franna crane and trucks share the yard with labourers.', [4, 5], [2, 5],
      [['Exclusion zones with spotters for every lift', 'Isolate', 'done'], ['Proximity warning on the excavators', 'Engineering', 'open'], ['Traffic management plan for the yard', 'Administrative', 'done']], 'Controls Pending'],
    ['Falling objects from the bridge deck', 'Working at height', 'Tools and materials at the deck edge above the work zone.', [3, 4], [1, 4],
      [['Toe boards and mesh at the deck edge', 'Isolate', 'done'], ['Tool lanyards', 'Engineering', 'done'], ['Exclusion zone below, enforced', 'Administrative', 'done']], 'Controlled'],
    ['Live traffic beside the work zone', 'Traffic and mobile plant', 'Workers set out cones within a metre of 60 km/h traffic.', [3, 5], null, [], 'Reported'],
    ['Underground services strikes', 'Excavation', 'Gas and electricity services run under the work zone; drawings are unreliable.', [2, 5], [1, 5],
      [['Pot-hole and mark services before digging', 'Administrative', 'done'], ['Ground-penetrating radar survey', 'Engineering', 'done']], 'Controlled'],
    ['Silica dust from cutting concrete', 'Hazardous chemicals', 'Cutting kerbs and slabs releases respirable crystalline silica.', [4, 4], [2, 3],
      [['Water suppression on all saws', 'Engineering', 'done'], ['P2 respirators, fit tested', 'PPE', 'done']], 'Controlled'],
  ],
  nsy: [
    ['Hot-desk workstations without monitors', 'Ergonomics', 'Staff work long hours on laptops at hot desks.', [4, 2], [2, 2],
      [['Monitor arms, keyboards and mice at every hot desk', 'Engineering', 'open'], ['Set-up guide at each desk', 'Administrative', 'done']], 'Controls Pending'],
    ['Lifted carpet tiles on level 3', 'Slips, trips and falls', 'Several carpet tiles near the printer have lifted edges.', [3, 2], [1, 1],
      [['Replace the lifted tiles', 'Eliminate', 'done']], 'Closed'],
    ['Workload and after-hours email', 'Psychosocial', 'Staff survey shows high workload and after-hours contact during month end.', [3, 3], null, [], 'Assessed'],
    ['Storage in front of the level 3 switchboard', 'Electrical', 'Boxes stored in front of the switchboard block access in an emergency.', [2, 3], [1, 2],
      [['Clear and line-mark the area in front of the switchboard', 'Eliminate', 'done']], 'Controlled'],
  ],
};

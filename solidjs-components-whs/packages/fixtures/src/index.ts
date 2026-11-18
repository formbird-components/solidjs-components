// A small safety data set in the demo's data model (demo/lib), for the preview gallery and the
// browser test: people, a site, the lookups the elements read (risk ratings, action statuses,
// control levels, cause categories), an incident under investigation with its corrective actions,
// hazards across the risk matrix, and a lost time injury three weeks ago. Times are relative to
// when the page loads.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
/** An ISO time `days` from now (negative: in the past). */
export const daysFromNow = (days: number) => new Date(now + days * DAY).toISOString();

type Doc = Record<string, unknown> & { documentId: string };
export type ComponentDef = Record<string, unknown> & { componentName: string; name: string };

const header = (summaryName: string, templateId: string, systemType = 'document', extra: Record<string, unknown> = {}) => ({
  systemType,
  summaryName,
  templateId,
  versionId: `v-${summaryName}`,
  ...extra,
});
const rel = (doc: Doc, fields: Record<string, unknown> = {}) => ({ documentId: doc.documentId, name: (doc.systemHeader as { summaryName: string }).summaryName, ...fields });
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ------------------------------------------------------------------------------------- people
const account = (key: string, first: string, last: string, accountType: string, title: string): Doc => ({
  documentId: `account-${key}`,
  systemHeader: header(`${first} ${last}`, 'template-account', 'account'),
  email: `${first}.${last}`.toLowerCase() + '@example.com',
  accountType,
  jobTitle: title,
});
export const people = {
  hannah: account('hannah', 'Hannah', 'Cole', 'WHS Advisor', 'WHS Advisor'),
  daniel: account('daniel', 'Daniel', 'Okafor', 'Site Manager', 'Site Manager, Wetherill Park DC'),
  liam: account('liam', 'Liam', 'Murphy', 'Supervisor', 'Warehouse Supervisor'),
  aisha: account('aisha', 'Aisha', 'Rahman', 'Worker', 'Forklift Operator'),
};
/** The signed-in account: the WHS advisor. */
export const CURRENT_ACCOUNT_ID = people.hannah.documentId;
const person = (doc: Doc) => rel(doc, { email: doc.email, accountType: doc.accountType });

// ------------------------------------------------------------------------------------ lookups
const lookup = (kind: string, name: string, extra: Record<string, unknown> = {}): Doc => ({
  documentId: `${kind}-${slug(name)}`,
  systemHeader: header(name, `template-${kind}`),
  appTags: ['whs', kind],
  nameId: name,
  inactiveBool: false,
  ...extra,
});

export const ratings = {
  Low: lookup('riskRating', 'Low', { color: '#2e9d5b', indexNum: 10 }),
  Medium: lookup('riskRating', 'Medium', { color: '#c99700', indexNum: 20 }),
  High: lookup('riskRating', 'High', { color: '#e5711a', indexNum: 30 }),
  Extreme: lookup('riskRating', 'Extreme', { color: '#d33a3a', indexNum: 40 }),
};
const ratingValue = (name: keyof typeof ratings) => rel(ratings[name], { color: ratings[name].color });

export const actionStatuses = {
  Open: lookup('actionStatus', 'Open', { color: '#3e63dd', statusCategory: 'todo', indexNum: 10 }),
  'In Progress': lookup('actionStatus', 'In Progress', { color: '#d97706', statusCategory: 'inprogress', indexNum: 20 }),
  Completed: lookup('actionStatus', 'Completed', { color: '#0b8fb3', statusCategory: 'inprogress', indexNum: 30 }),
  Verified: lookup('actionStatus', 'Verified', { color: '#2e9d5b', statusCategory: 'done', indexNum: 40 }),
  Cancelled: lookup('actionStatus', 'Cancelled', { color: '#8b8d98', statusCategory: 'done', indexNum: 50 }),
};
const statusValue = (doc: Doc) => rel(doc, { color: doc.color, statusCategory: doc.statusCategory, indexNum: doc.indexNum });

export const controlLevels = Object.fromEntries(
  [
    ['Eliminate', 'Remove the hazard altogether'],
    ['Substitute', 'Replace it with something safer'],
    ['Isolate', 'Separate people from it (barriers, guarding, exclusion zones)'],
    ['Engineering', 'Change the plant or process (extraction, interlocks, mechanical aids)'],
    ['Administrative', 'Procedures, training, signage, rosters'],
    ['PPE', 'Personal protective equipment'],
  ].map(([name, hint], i) => [name, lookup('controlLevel', name, { rank: i + 1, description: hint, indexNum: (i + 1) * 10 })]),
) as Record<string, Doc>;
const controlValue = (name: string) => rel(controlLevels[name], { rank: controlLevels[name].rank, indexNum: controlLevels[name].indexNum });

export const causeCategories = ['People', 'Procedure', 'Plant and equipment', 'Environment', 'Organisation'].map((name, i) =>
  lookup('causeCategory', name, { indexNum: (i + 1) * 10 }),
);

export const incidentStatuses = {
  Investigating: lookup('incidentStatus', 'Investigating', { color: '#7c5cff', statusCategory: 'inprogress', indexNum: 30 }),
  Closed: lookup('incidentStatus', 'Closed', { color: '#2e9d5b', statusCategory: 'done', indexNum: 50 }),
};
export const hazardStatuses = {
  'Controls Pending': lookup('hazardStatus', 'Controls Pending', { color: '#d97706', statusCategory: 'inprogress', indexNum: 30 }),
  Controlled: lookup('hazardStatus', 'Controlled', { color: '#2e9d5b', statusCategory: 'inprogress', indexNum: 40 }),
};
export const treatments = {
  firstAid: lookup('treatment', 'First aid', { indexNum: 20 }),
  lostTime: lookup('treatment', 'Lost time', { indexNum: 50 }),
};

// --------------------------------------------------------------------------------------- site
export const site: Doc = {
  ...lookup('site', 'Wetherill Park Distribution Centre', { code: 'WPK' }),
  addressGeo: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [150.9003, -33.8478] }, properties: {} }] },
  siteManagerRel: [person(people.daniel)],
};
const siteValue = rel(site, { code: 'WPK' });

// ---------------------------------------------------------------------------------- incidents
const risk = (likelihood: number, consequence: number, score: number, rating: keyof typeof ratings) => ({ likelihood, consequence, score, rating });

/** An incident under investigation: a forklift struck a racking upright. */
export const incident: Doc = {
  documentId: 'incident-12',
  systemHeader: header('INC-12: Forklift struck racking upright', 'template-incident', 'document', { createdDate: daysFromNow(-6), serverCreatedDate: daysFromNow(-6) }),
  appTags: ['whs', 'incident'],
  incidentRef: 'INC-12',
  title: 'Forklift struck racking upright',
  incidentStatusRel: [statusValue(incidentStatuses.Investigating)],
  occurredDate: daysFromNow(-6),
  reportedDate: daysFromNow(-6),
  reportedByRel: [person(people.liam)],
  siteRel: [siteValue],
  exactLocation: 'Aisle 12, bay 4',
  riskAssessment: risk(4, 4, 16, 'High'),
  riskRating: 'High',
  riskRatingRel: [ratingValue('High')],
  rootCauseTree: {
    problem: 'Forklift struck racking upright',
    nodes: [
      {
        id: 'w1',
        text: 'The operator could not see the upright while reversing',
        children: [{ id: 'w2', text: 'The load was stacked above eye level', children: [] }],
      },
    ],
  },
};

/** A new incident, not saved yet. */
export const newIncident: Doc = {
  documentId: 'incident-new',
  systemHeader: header('', 'template-incident'),
  appTags: ['whs', 'incident'],
  title: 'Chemical splash in the wash bay',
};

/** A lost time injury three weeks ago, and a first aid injury since. */
export const lostTimeInjury: Doc = {
  documentId: 'incident-5',
  systemHeader: header('INC-5: Back strain lifting cartons', 'template-incident', 'document', { createdDate: daysFromNow(-21) }),
  appTags: ['whs', 'incident'],
  incidentRef: 'INC-5',
  title: 'Back strain lifting cartons',
  incidentStatusRel: [statusValue(incidentStatuses.Closed)],
  occurredDate: daysFromNow(-21),
  treatmentRel: [rel(treatments.lostTime)],
  injuryClass: 'LTI',
  lostTimeBool: true,
  recordableBool: true,
  siteRel: [siteValue],
  riskRating: 'Medium',
  riskRatingRel: [ratingValue('Medium')],
  riskAssessment: risk(3, 3, 9, 'Medium'),
};
export const firstAidInjury: Doc = {
  documentId: 'incident-9',
  systemHeader: header('INC-9: Cut finger on strapping', 'template-incident', 'document', { createdDate: daysFromNow(-9) }),
  appTags: ['whs', 'incident'],
  incidentRef: 'INC-9',
  title: 'Cut finger on strapping',
  incidentStatusRel: [statusValue(incidentStatuses.Closed)],
  occurredDate: daysFromNow(-9),
  treatmentRel: [rel(treatments.firstAid)],
  injuryClass: 'FAI',
  lostTimeBool: false,
  recordableBool: false,
  siteRel: [siteValue],
  riskRating: 'Low',
  riskRatingRel: [ratingValue('Low')],
  riskAssessment: risk(2, 2, 4, 'Low'),
};

// ------------------------------------------------------------------------------------ hazards
const hazard = (n: number, title: string, inherent: ReturnType<typeof risk>, residual: ReturnType<typeof risk> | null, status: keyof typeof hazardStatuses): Doc => ({
  documentId: `hazard-${n}`,
  systemHeader: header(`HAZ-${n}: ${title}`, 'template-hazard', 'document', { createdDate: daysFromNow(-30 - n) }),
  appTags: ['whs', 'hazard'],
  hazardRef: `HAZ-${n}`,
  title,
  hazardStatusRel: [statusValue(hazardStatuses[status])],
  siteRel: [siteValue],
  inherentRisk: inherent,
  inherentRating: inherent.rating,
  inherentRatingRel: [ratingValue(inherent.rating)],
  ...(residual ? { residualRisk: residual, residualRating: residual.rating, residualRatingRel: [ratingValue(residual.rating)] } : {}),
});
export const hazards = [
  hazard(7, 'Pedestrians crossing the forklift aisle at dock 3', risk(4, 4, 16, 'High'), risk(2, 4, 8, 'Medium'), 'Controls Pending'),
  hazard(8, 'Damaged pallet racking, aisle 12', risk(3, 4, 12, 'High'), risk(2, 4, 8, 'Medium'), 'Controlled'),
  hazard(9, 'Wet floor at the wash bay', risk(4, 2, 8, 'Medium'), risk(2, 2, 4, 'Low'), 'Controlled'),
  hazard(10, 'Manual handling of 25 kg cartons', risk(5, 2, 10, 'High'), risk(4, 2, 8, 'Medium'), 'Controls Pending'),
  hazard(11, 'Battery charging bay ventilation', risk(2, 5, 10, 'High'), risk(1, 5, 5, 'High'), 'Controlled'),
  hazard(12, 'Unguarded conveyor nip point', risk(3, 4, 12, 'High'), null, 'Controls Pending'),
];
export const pedestrianHazard = hazards[0];

// ------------------------------------------------------------------------------------ actions
const sourceOf = (doc: Doc, kind: string) =>
  rel(doc, { ref: doc.incidentRef ?? doc.hazardRef, kind, riskRating: doc.riskRating ?? doc.residualRating ?? doc.inherentRating });
const action = (
  n: number,
  title: string,
  source: Doc,
  kind: string,
  o: { status: keyof typeof actionStatuses; level: string; owner: Doc; due: number; completed?: number },
): Doc => ({
  documentId: `action-${n}`,
  systemHeader: header(`ACT-${n}: ${title}`, 'template-action', 'document', { createdDate: daysFromNow(-5) }),
  appTags: ['whs', 'action'],
  actionRef: `ACT-${n}`,
  title,
  actionStatusRel: [statusValue(actionStatuses[o.status])],
  controlLevelRel: [controlValue(o.level)],
  ownerRel: [person(o.owner)],
  dueDate: daysFromNow(o.due),
  raisedDate: daysFromNow(-5),
  sourceRel: [sourceOf(source, kind)],
  ...(o.completed !== undefined ? { completedDate: daysFromNow(o.completed) } : {}),
});
export const actions = [
  action(31, 'Install convex mirrors at the aisle 12 intersections', incident, 'incident', { status: 'Open', level: 'Engineering', owner: people.daniel, due: -1 }),
  action(32, 'Limit load height on reach trucks to 1.8 m', incident, 'incident', { status: 'Completed', level: 'Administrative', owner: people.liam, due: 2, completed: -1 }),
  action(33, 'Replace the damaged upright in bay 4', incident, 'incident', { status: 'Verified', level: 'Engineering', owner: people.daniel, due: -2, completed: -3 }),
  action(34, 'Cancelled duplicate', incident, 'incident', { status: 'Cancelled', level: 'PPE', owner: people.liam, due: 5 }),
  action(41, 'Mark a pedestrian walkway with bollards at dock 3', pedestrianHazard, 'hazard', { status: 'In Progress', level: 'Isolate', owner: people.daniel, due: 10 }),
];

// ------------------------------------------------------------------------------------- forms
/** The dashboard page (fields belong to page elements only). */
export const dashboard: Doc = { documentId: 'page-dashboard', systemHeader: header('Safety overview', 'template-dashboard') };

export const template = { documentId: 'template-incident', name: 'Incident' };

export const forms: Doc[] = [incident, newIncident, pedestrianHazard, dashboard];

/** Template of corrective actions (new ones are created with it). */
export const ACTION_TEMPLATE_ID = 'template-action';

export const documents: Doc[] = [
  ...Object.values(people),
  ...Object.values(ratings),
  ...Object.values(actionStatuses),
  ...Object.values(controlLevels),
  ...causeCategories,
  ...Object.values(incidentStatuses),
  ...Object.values(hazardStatuses),
  ...Object.values(treatments),
  site,
  incident,
  lostTimeInjury,
  firstAidInjury,
  ...hazards,
  ...actions,
];

/** Action status values by name, as `statusValues` lists them for <solid-corrective-actions>. */
export const statusValues = Object.fromEntries(Object.entries(actionStatuses).map(([name, doc]) => [name, statusValue(doc)]));
/** Control level values, most effective first, as `controlLevels` lists them. */
export const controlLevelValues = Object.keys(controlLevels).map(controlValue);

const ACCOUNTS = "{'sort':[{'systemHeader.summaryName':'asc'}],'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'account'}}]}}}";
const incidentActions = {
  componentName: 'solid-corrective-actions',
  name: 'correctiveActions',
  label: 'Corrective actions',
  disableSave: true,
  fullWidth: true,
  templateId: ACTION_TEMPLATE_ID,
  sourceKind: 'incident',
  refField: 'incidentRef',
  ratingField: 'riskRating',
  statusValues,
  controlLevels: controlLevelValues,
  people: ACCOUNTS,
};
const rootCause = {
  componentName: 'solid-root-cause',
  name: 'rootCauseTree',
  label: 'Why did it happen?',
  fullWidth: true,
  problemField: 'title',
  minDepth: 3,
};

/**
 * Component definitions by role, as the demo's templates write them. Each element adds its own:
 * the browser test and the preview create one element per role.
 */
export const definitions: Record<string, ComponentDef> = {
  /** The incident's risk assessment (rules derive riskRating and riskRatingRel from it). */
  matrix: {
    componentName: 'solid-risk-matrix',
    name: 'riskAssessment',
    label: 'Risk assessment',
    mandatory: true,
  },
  /** A hazard's residual risk, against its inherent risk. */
  residual: {
    componentName: 'solid-risk-matrix',
    name: 'residualRisk',
    label: 'Residual risk (after controls)',
    compareField: 'inherentRisk',
    compareLabel: 'Before controls',
  },
  /** Dashboard: hazards per cell of the matrix, by residual risk. */
  heatmap: {
    componentName: 'solid-risk-matrix',
    name: 'hazardHeatmap',
    label: 'Hazards by residual risk',
    mode: 'heatmap',
    disableSave: true,
    filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'whs'}},{'term':{'appTags':'hazard'}}]}}}",
    riskField: 'residualRisk',
    noun: 'hazard',
  },
  /** The incident's five whys. */
  rootCause,
  /** The same, on a new incident: the problem comes from its title. */
  rootCauseNew: rootCause,
  /** The incident's corrective actions. */
  actions: incidentActions,
  /** The same, on an incident that hasn't been saved. */
  actionsNew: incidentActions,
  /** A hazard's actions: its residual rating, else its inherent rating, sets the due date. */
  hazardActions: {
    ...incidentActions,
    name: 'hazardActions',
    label: 'Controls to put in place',
    sourceKind: 'hazard',
    refField: 'hazardRef',
    ratingField: ['residualRating', 'inherentRating'],
    addLabel: 'Add control',
  },
  /** Safety overview tiles: days since the last lost time injury, and counts. */
  tiles: {
    componentName: 'solid-stat-tiles',
    name: 'safetyTiles',
    label: 'At a glance',
    disableSave: true,
    tiles: [
      {
        label: 'Days since a lost time injury',
        measure: 'daysSince',
        dateField: 'occurredDate',
        filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'incident'}},{'term':{'lostTimeBool':true}}]}}}",
        zeroTone: 'bad',
        goodFrom: 30,
        tone: 'warn',
      },
      {
        label: 'Days since an injury of any kind',
        measure: 'daysSince',
        dateField: 'occurredDate',
        filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'incident'}},{'term':{'injuryClass':'NOPE'}}]}}}",
        goodFrom: 30,
      },
      {
        label: 'Open High hazards',
        filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'hazard'}},{'term':{'inherentRating':'High'}}]}}}",
        tone: 'bad',
        zeroTone: 'good',
      },
    ],
  },
};

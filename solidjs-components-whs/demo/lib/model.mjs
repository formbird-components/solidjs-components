// Identifiers and constants shared by every part of the safety demo seed.

import { idFactory } from '@solidjs-components/platform/documents';

/** Stable id for a demo object, so re-seeding keeps links and bookmarks working. */
export const whsId = idFactory('whs');

/** Everyone in the demo signs in with this password. */
export const DEMO_PASSWORD = 'Safety1234!';

/** The company's time zone: reporting deadlines, due dates, "today" on the dashboard. */
export const TIME_ZONE = 'Australia/Sydney';

/** The demo company. */
export const COMPANY = 'Brightwater Group';

/**
 * Access keys. Password hashes and access documents need ADMIN; the others gate workflow moves
 * (the status pickers hide moves a person can't make, and the PreSaveServer rules enforce them).
 */
export const KEYS = {
  admin: whsId('key', 'admin'),
  /** WHS advisors: triage, investigate, verify actions, close Low and Medium incidents. */
  whs: whsId('key', 'whs'),
  /** Site managers and executives: sign off High incidents, extend action due dates. */
  manager: whsId('key', 'manager'),
  /** Executives: sign off Extreme and notifiable incidents. */
  executive: whsId('key', 'executive'),
  /** Supervisors (and site managers): triage reports, assess hazards. */
  supervisor: whsId('key', 'supervisor'),
};

/** Account types, and what each may do (mirrors KEYS for the browser rules). */
export const ROLES = {
  Administrator: ['admin', 'whs', 'manager', 'executive', 'supervisor'],
  Executive: ['manager', 'executive'],
  'WHS Advisor': ['whs'],
  'Site Manager': ['manager', 'supervisor'],
  Supervisor: ['supervisor'],
  Worker: [],
};

/** Templates (forms and pages). */
export const T = {
  overview: whsId('template', 'Safety overview'),
  mySafety: whsId('template', 'My safety'),
  incidents: whsId('template', 'Incident register'),
  hazards: whsId('template', 'Hazard register'),
  actions: whsId('template', 'Corrective actions'),
  inspections: whsId('template', 'Inspections'),
  map: whsId('template', 'Safety map'),
  incident: whsId('template', 'Incident'),
  hazard: whsId('template', 'Hazard'),
  action: whsId('template', 'Corrective action'),
  inspection: whsId('template', 'Inspection'),
  site: whsId('template', 'Site'),
  checkSheet: whsId('template', 'Inspection checklist'),
  counter: whsId('template', 'Counter'),
};

/** Lookup kinds: one admin template each, documents tagged ['whs', kind]. */
export const LOOKUPS = {
  incidentStatus: { name: 'Incident status', plural: 'Incident statuses' },
  hazardStatus: { name: 'Hazard status', plural: 'Hazard statuses' },
  actionStatus: { name: 'Action status', plural: 'Action statuses' },
  inspectionStatus: { name: 'Inspection status', plural: 'Inspection statuses' },
  riskRating: { name: 'Risk rating', plural: 'Risk ratings' },
  incidentType: { name: 'Incident type', plural: 'Incident types' },
  injuryNature: { name: 'Nature of injury', plural: 'Natures of injury' },
  mechanism: { name: 'Mechanism of injury', plural: 'Mechanisms of injury' },
  treatment: { name: 'Treatment', plural: 'Treatments' },
  dangerousKind: { name: 'Kind of dangerous incident', plural: 'Kinds of dangerous incident' },
  personType: { name: 'Person type', plural: 'Person types' },
  hazardCategory: { name: 'Hazard category', plural: 'Hazard categories' },
  controlLevel: { name: 'Control level', plural: 'Control levels' },
  causeCategory: { name: 'Cause category', plural: 'Cause categories' },
};
for (const kind of Object.keys(LOOKUPS)) T[`lookup_${kind}`] = whsId('template', `lookup:${kind}`);

/** Kinds whose values are statuses (colour and category). */
export const STATUS_KINDS = ['incidentStatus', 'hazardStatus', 'actionStatus', 'inspectionStatus'];

/**
 * Reference number counters ("INC-#"). fieldtec-web's Reference No preprocessor replaces YY, MM and
 * DD in the format with the date, so prefixes must avoid those letters in pairs.
 */
export const COUNTERS = {
  incident: { id: whsId('counter', 'incident'), field: 'incidentCounter', prefix: 'INC' },
  hazard: { id: whsId('counter', 'hazard'), field: 'hazardCounter', prefix: 'HAZ' },
  action: { id: whsId('counter', 'action'), field: 'actionCounter', prefix: 'ACT' },
  inspection: { id: whsId('counter', 'inspection'), field: 'inspectionCounter', prefix: 'INS' },
};

/** Ruleset ids. */
export const RULESETS = Object.fromEntries(
  ['incidentClient', 'incidentServer', 'incidentPost', 'hazardClient', 'hazardServer', 'actionClient', 'actionServer', 'actionPost', 'inspectionClient', 'inspectionServer', 'inspectionPost'].map((name) => [
    name,
    whsId('ruleset', name),
  ]),
);

/** What records store about their site (the site pickers' relatedFields): who hears about what happens there. */
export const SITE_VALUE_FIELDS = {
  code: 'code',
  siteManagerRel: 'siteManagerRel',
  supervisorRel: 'supervisorRel',
  whsAdvisorRel: 'whsAdvisorRel',
  checkSheetRel: 'checkSheetRel',
  inspectionWeeksNum: 'inspectionWeeksNum',
  indexNum: 'indexNum',
};

/** A report counts as late after this many hours (most WHS policies: by the end of the shift). */
export const LATE_REPORT_HOURS = 24;

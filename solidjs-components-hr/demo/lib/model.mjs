// Identifiers and constants shared by every part of the HR demo seed.

import { idFactory } from '@solidjs-components/platform/documents';

/** Stable id for a demo object, so re-seeding keeps links and bookmarks working. */
export const hrId = idFactory('hr');

/** Everyone in the demo signs in with this password. */
export const DEMO_PASSWORD = 'People1234!';

/** The company's time zone: leave days, "today", certificate expiry. */
export const TIME_ZONE = 'Australia/Sydney';

/** The demo company. */
export const COMPANY = 'Bluegum Community Health';

/** Days ahead a certificate counts as expiring, and its holder and their manager are told. */
export const EXPIRY_WARN_DAYS = 30;

/**
 * Access keys. Password hashes and access documents need ADMIN; the others gate what the rules let
 * people do (the status pickers hide moves a person can't make, and the PreSaveServer rules enforce them).
 */
export const KEYS = {
  admin: hrId('key', 'admin'),
  /** People & Culture: everyone's leave, certificates and onboarding; unpaid leave approvals. */
  hr: hrId('key', 'hr'),
  /** Managers: their team's leave and onboarding. */
  manager: hrId('key', 'manager'),
  /** Executives: second approvals across the organisation. */
  executive: hrId('key', 'executive'),
};

/** Account types, and what each may do (mirrors KEYS for the browser rules). */
export const ROLES = {
  Administrator: ['admin', 'hr', 'manager', 'executive'],
  'People & Culture': ['hr'],
  Executive: ['manager', 'executive'],
  Manager: ['manager'],
  Employee: [],
};

/** Templates (forms and pages). */
export const T = {
  overview: hrId('template', 'People overview'),
  myHr: hrId('template', 'My HR'),
  myTeam: hrId('template', 'My team'),
  calendar: hrId('template', 'Leave calendar'),
  leaveRegister: hrId('template', 'Leave register'),
  matrix: hrId('template', 'Skills matrix'),
  certificates: hrId('template', 'Certificates'),
  orgChart: hrId('template', 'Org chart'),
  onboardingList: hrId('template', 'Onboarding'),
  directory: hrId('template', 'People'),
  leave: hrId('template', 'Leave request'),
  certificate: hrId('template', 'Certificate'),
  onboarding: hrId('template', 'Onboarding plan for a starter'),
  expiryCheck: hrId('template', 'Certificate expiry check'),
  team: hrId('template', 'Team'),
  position: hrId('template', 'Position'),
  plan: hrId('template', 'Onboarding checklist'),
  counter: hrId('template', 'Counter'),
};

/** Lookup kinds: one admin template each, documents tagged ['hr', kind]. */
export const LOOKUPS = {
  leaveStatus: { name: 'Leave status', plural: 'Leave statuses' },
  onboardingStatus: { name: 'Onboarding status', plural: 'Onboarding statuses' },
  certState: { name: 'Certificate state', plural: 'Certificate states' },
  leaveType: { name: 'Leave type', plural: 'Leave types' },
  certType: { name: 'Certificate type', plural: 'Certificate types' },
};
for (const kind of Object.keys(LOOKUPS)) T[`lookup_${kind}`] = hrId('template', `lookup:${kind}`);

/** Kinds whose values are statuses (colour and category). */
export const STATUS_KINDS = ['leaveStatus', 'onboardingStatus', 'certState'];

/**
 * Reference number counters ("LV-#"). fieldtec-web's Reference No preprocessor replaces YY, MM and
 * DD in the format with the date, so prefixes must avoid those letters in pairs.
 */
export const COUNTERS = {
  leave: { id: hrId('counter', 'leave'), field: 'leaveCounter', prefix: 'LV' },
  certificate: { id: hrId('counter', 'certificate'), field: 'certificateCounter', prefix: 'CRT' },
  onboarding: { id: hrId('counter', 'onboarding'), field: 'onboardingCounter', prefix: 'ONB' },
  expiryCheck: { id: hrId('counter', 'expiryCheck'), field: 'expiryCheckCounter', prefix: 'EXP' },
};

/** Ruleset ids. */
export const RULESETS = Object.fromEntries(
  ['leaveClient', 'leaveServer', 'leavePost', 'certClient', 'certServer', 'onboardingClient', 'onboardingServer', 'onboardingPost', 'expiryServer', 'expiryPost'].map((name) => [name, hrId('ruleset', name)]),
);

/** What records store about a team (the team pickers' relatedFields). */
export const TEAM_VALUE_FIELDS = { code: 'code', color: 'color', minOnDutyNum: 'minOnDutyNum', site: 'site', indexNum: 'indexNum' };

/** What records store about a position: the certificates it requires (ids and names) and its onboarding checklist. */
export const POSITION_VALUE_FIELDS = { requiredCertsRel: 'requiredCertsRel', planRel: 'planRel', indexNum: 'indexNum' };

/** What a leave type value stores: its colour, the balance it uses and its accrual, evidence and approval rules. */
export const LEAVE_TYPE_FIELDS = {
  color: 'color',
  balanceKey: 'balanceKey',
  accrualDaysNum: 'accrualDaysNum',
  evidenceAfterDaysNum: 'evidenceAfterDaysNum',
  needsReasonBool: 'needsReasonBool',
  needsHrBool: 'needsHrBool',
  maxDaysNum: 'maxDaysNum',
  indexNum: 'indexNum',
};

/** What a certificate type value stores. */
export const CERT_TYPE_FIELDS = { validityMonthsNum: 'validityMonthsNum', shortName: 'shortName', indexNum: 'indexNum' };

/** What an employee value stores (leave, certificates, onboarding): who they are and who manages them. */
export const EMPLOYEE_FIELDS = {
  email: 'email', accountType: 'accountType', jobTitle: 'jobTitle', teamRel: 'teamRel', managerRel: 'managerRel', employeeNo: 'employeeNo', positionRel: 'positionRel', employmentStartDate: 'employmentStartDate',
};

/** Fields on an account that hold leave balances' opening values, by balance key. */
export const OPENING_FIELDS = { annual: 'annualOpeningNum', personal: 'personalOpeningNum', longService: 'longServiceOpeningNum' };

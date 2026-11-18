// Identifiers and constants shared by every part of the procurement demo seed.

import { idFactory } from '@solidjs-components/platform/documents';

/** Stable id for a demo object, so re-seeding keeps links and bookmarks working. */
export const procId = idFactory('proc');

/** Everyone in the demo signs in with this password. */
export const DEMO_PASSWORD = 'Purchase1234!';

/** The company's time zone: "today", the financial year, delivery dates. */
export const TIME_ZONE = 'Australia/Sydney';

/** The demo company. */
export const COMPANY = 'Ironbark Engineering';

/** GST on every line; budgets, approvals and quotes count amounts ex GST. */
export const GST_RATE = 0.1;

/** How many written quotes a purchase needs, by amount (ex GST, above `fromAmount`). */
export const QUOTE_RULES = [
  { fromAmount: 2000, quotes: 1 },
  { fromAmount: 10000, quotes: 3 },
];

/** An invoice more than this far over the approved total (both) needs a reason before closing. */
export const INVOICE_TOLERANCE = { tolerancePct: 5, toleranceAmount: 100 };

/**
 * Access keys. Password hashes and access documents need ADMIN; the others gate what the rules let
 * people do (the status pickers hide moves a person can't make, and the PreSaveServer rules enforce them).
 */
export const KEYS = {
  admin: procId('key', 'admin'),
  /** Procurement: suppliers, quotes, raising orders, sole-supplier approvals. */
  procurement: procId('key', 'procurement'),
  /** Finance: budget overrides, invoices, closing requests. */
  finance: procId('key', 'finance'),
  /** Executives: the higher delegations. */
  executive: procId('key', 'executive'),
  /** Managers: their cost centres' requests. */
  manager: procId('key', 'manager'),
};

/** Account types, and what each may do (mirrors KEYS for the browser rules). */
export const ROLES = {
  Administrator: ['admin', 'procurement', 'finance', 'executive', 'manager'],
  Executive: ['executive', 'manager'],
  Finance: ['finance', 'manager'],
  Procurement: ['procurement'],
  Manager: ['manager'],
  Employee: [],
};

/** Templates (forms and pages). */
export const T = {
  overview: procId('template', 'Purchasing overview'),
  myRequests: procId('template', 'My requests'),
  approvals: procId('template', 'My approvals'),
  register: procId('template', 'Purchase requests'),
  orders: procId('template', 'Orders'),
  budgets: procId('template', 'Budgets'),
  request: procId('template', 'Purchase request'),
  quote: procId('template', 'Quote'),
  supplier: procId('template', 'Supplier'),
  costCentre: procId('template', 'Cost centre'),
  item: procId('template', 'Catalogue item'),
  tier: procId('template', 'Approval tier'),
  counter: procId('template', 'Counter'),
};

/** Lookup kinds: one admin template each, documents tagged ['proc', kind]. */
export const LOOKUPS = {
  requestStatus: { name: 'Request status', plural: 'Request statuses' },
  category: { name: 'Category', plural: 'Categories' },
};
for (const kind of Object.keys(LOOKUPS)) T[`lookup_${kind}`] = procId('template', `lookup:${kind}`);

/** Kinds whose values are statuses (colour and category). */
export const STATUS_KINDS = ['requestStatus'];

/**
 * Reference number counters ("PR-#"). fieldtec-web's Reference No preprocessor replaces YY, MM and
 * DD in the format with the date, so prefixes must avoid those letters in pairs.
 */
export const COUNTERS = {
  request: { id: procId('counter', 'request'), field: 'requestCounter', prefix: 'PR' },
  quote: { id: procId('counter', 'quote'), field: 'quoteCounter', prefix: 'QT' },
};

/** Ruleset ids. */
export const RULESETS = Object.fromEntries(['requestClient', 'requestServer', 'requestPost', 'quoteServer', 'quotePost'].map((name) => [name, procId('ruleset', name)]));

/** What records store about a cost centre (the pickers' relatedFields). */
export const COST_CENTRE_FIELDS = { code: 'code', ownerRel: 'ownerRel', indexNum: 'indexNum' };

/** What records store about a supplier. */
export const SUPPLIER_FIELDS = { approvedBool: 'approvedBool', blockedBool: 'blockedBool', abn: 'abn', paymentTerms: 'paymentTerms' };

/** What a requester value stores. */
export const PERSON_VALUE_FIELDS = { email: 'email', accountType: 'accountType', jobTitle: 'jobTitle', costCentreRel: 'costCentreRel', managerRel: 'managerRel' };

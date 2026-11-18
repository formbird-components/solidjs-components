// A small procurement data set in the demo's data model (demo/lib), for the preview gallery and the
// browser test: two cost centres with budgets and this year's requests, suppliers (one not approved),
// a catalogue, a draft request with three quotes (one expired), an IT request that would go over
// budget, and attachments. Dates are relative to when the page loads.

const DAY = 86_400_000;
const now = Date.now();
const iso = (days: number) => new Date(now + days * DAY).toISOString();
const fyOf = (time: number) => {
  const d = new Date(time);
  const start = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `FY${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
export const FY = fyOf(now);

type Doc = Record<string, unknown> & { documentId: string };
export type ComponentDef = Record<string, unknown> & { componentName: string; name: string };

const header = (summaryName: string, templateId: string, systemType = 'document', extra: Record<string, unknown> = {}) => ({ systemType, summaryName, templateId, versionId: `v-${summaryName}`, ...extra });
const rel = (doc: Doc, fields: Record<string, unknown> = {}) => ({ documentId: doc.documentId, name: (doc.systemHeader as { summaryName: string }).summaryName, ...fields });
const tagged = (kind: string, id: string, name: string, extra: Record<string, unknown>): Doc => ({ documentId: id, systemHeader: header(name, `template-${kind}`), appTags: ['proc', kind], nameId: name, ...extra });

// -------------------------------------------------------------------------------------- people
const account = (key: string, first: string, last: string, accountType: string): Doc => ({
  documentId: `account-${key}`,
  systemHeader: header(`${first} ${last}`, 'template-account', 'account'),
  email: `${first}.${last}`.toLowerCase() + '@example.com',
  accountType,
});
export const people = { kai: account('kai', 'Kai', 'Robinson', 'Employee'), tom: account('tom', 'Tom', 'Harris', 'Manager'), daniel: account('daniel', 'Daniel', 'Brooks', 'Manager') };
/** The signed-in account: Kai, raising the draft request. */
export const CURRENT_ACCOUNT_ID = people.kai.documentId;

// ------------------------------------------------------------------------------- cost centres
export const centres = {
  workshop: tagged('costCentre', 'cc-workshop', 'Workshop', { code: '210', ownerRel: [rel(people.tom)], budgetNum: 100000, baseSpentNum: 40000, fyKey: FY }),
  it: tagged('costCentre', 'cc-it', 'IT', { code: '310', ownerRel: [rel(people.daniel)], budgetNum: 50000, baseSpentNum: 30000, fyKey: FY }),
};
const centreValue = (doc: Doc) => rel(doc, { code: doc.code, ownerRel: doc.ownerRel });

// --------------------------------------------------------------------------------- suppliers
export const suppliers = {
  powergen: tagged('supplier', 'sup-powergen', 'PowerGen Hire and Sales', { approvedBool: true, blockedBool: false }),
  ridgeway: tagged('supplier', 'sup-ridgeway', 'Ridgeway Equipment', { approvedBool: true, blockedBool: false }),
  survey: tagged('supplier', 'sup-survey', 'Precision Survey Rentals', { approvedBool: true, blockedBool: false }),
  heritage: tagged('supplier', 'sup-heritage', 'Heritage Joinery Co', { approvedBool: false, blockedBool: false }),
};
const supplierValue = (doc: Doc) => rel(doc, { approvedBool: doc.approvedBool, blockedBool: doc.blockedBool });

export const items = [
  tagged('item', 'item-gen', 'Generator 20 kVA, trailer mounted', { partNo: 'PG-20KVA', unit: 'ea', unitCostNum: 9450, supplierRel: [supplierValue(suppliers.powergen)] }),
  tagged('item', 'item-hose', 'Hydraulic hose, 1/2" (per metre)', { partNo: 'HH-H12-2W', unit: 'm', unitCostNum: 18.5 }),
  tagged('item', 'item-gloves', 'Nitrile work gloves (box of 100)', { partNo: 'CP-GL-100', unit: 'box', unitCostNum: 38 }),
];

// ---------------------------------------------------------------------------------- requests
const request = (id: string, centre: Doc, status: string, subtotal: number, extra: Record<string, unknown> = {}): Doc => ({
  documentId: id,
  systemHeader: header(id.toUpperCase(), 'template-request', 'document', { serverCreatedDate: iso(-20) }),
  appTags: ['proc', 'request'],
  requestRef: id.toUpperCase(),
  costCentreRel: [centreValue(centre)],
  requestStatusRel: [{ documentId: `status-${status}`, name: status }],
  subtotalNum: subtotal,
  fyKey: FY,
  ...extra,
});
export const history = [
  request('pr-1', centres.workshop, 'Closed', 10000, { invoiceExGstNum: 10500 }),
  request('pr-2', centres.workshop, 'Approved', 5000),
  request('pr-3', centres.workshop, 'Submitted', 3000),
  request('pr-4', centres.it, 'Ordered', 2000),
];
const line = (id: string, kind: string, description: string, qty: number, unitCost: number, partNo?: string) => ({ id, kind, description, qty, unit: 'ea', unitCost, ...(partNo ? { materialRel: [{ documentId: `item-${id}`, name: description, partNo }] } : {}) });

/** Kai's draft: two generators, $18,900 ex GST, on the workshop's budget; three quotes, none chosen yet. */
export const draft: Doc = {
  ...request('pr-10', centres.workshop, 'Draft', 0),
  systemHeader: header('PR-10: Two generators', 'template-request', 'document', { serverCreatedDate: iso(-1) }),
  title: 'Two generators',
  requesterRel: [rel(people.kai)],
  lineItemsArr: [line('l1', 'goods', 'Generator 20 kVA, trailer mounted', 2, 9450, 'PG-20KVA')],
  attachmentsArr: [
    { fileNo: 'file-spec', fileName: 'generator-spec.pdf', fileType: 'pdf', kind: 'Specification', takenDate: iso(-1), takenByRel: [rel(people.kai)] },
    { fileNo: 'file-site', fileName: 'site-photo.jpg', fileType: 'jpg', kind: 'Other', caption: 'Where they go', takenDate: iso(-1), takenByRel: [rel(people.kai)] },
  ],
};
/** An IT request of $25,000 against $18,000 left (an order of $2,000 is committed): over by $7,000. */
export const itRequest: Doc = {
  ...request('pr-11', centres.it, 'Draft', 0),
  title: 'Servers',
  lineItemsArr: [line('l1', 'goods', 'Server', 2, 12500)],
};
export const quotes = [
  tagged('quote', 'qt-1', 'QT-1: PowerGen', { quoteRef: 'QT-1', requestRel: [rel(draft)], supplierRel: [supplierValue(suppliers.powergen)], amountNum: 18900, validUntilDate: iso(20), leadTimeDaysNum: 7, attachmentsArr: [{ fileNo: 'file-q1', fileName: 'powergen-quote.pdf' }] }),
  tagged('quote', 'qt-2', 'QT-2: Ridgeway', { quoteRef: 'QT-2', requestRel: [rel(draft)], supplierRel: [supplierValue(suppliers.ridgeway)], amountNum: 18250, validUntilDate: iso(30), leadTimeDaysNum: 42 }),
  tagged('quote', 'qt-3', 'QT-3: Precision', { quoteRef: 'QT-3', requestRel: [rel(draft)], supplierRel: [supplierValue(suppliers.survey)], amountNum: 19980, validUntilDate: iso(-5), leadTimeDaysNum: 10 }),
];

export const dashboard: Doc = { documentId: 'page-proc', systemHeader: header('Purchasing overview', 'template-page', 'document', { serverCreatedDate: iso(-100) }) };
export const template = { documentId: 'template-proc', components: [] as ComponentDef[] };

export const documents: Doc[] = [...Object.values(people), ...Object.values(centres), ...Object.values(suppliers), ...items, ...history, ...quotes];
export const forms: Doc[] = [dashboard, draft, itRequest];

export const QUOTE_RULES = [
  { fromAmount: 2000, quotes: 1 },
  { fromAmount: 10000, quotes: 3 },
];

/** One definition per element on the page. */
export const definitions: Record<string, ComponentDef> = {
  lines: {
    componentName: 'solid-line-items', name: 'lineItemsArr', label: 'What is being bought',
    kinds: [
      { value: 'goods', label: 'Goods', alwaysTotal: true, add: 'Add an item' },
      { value: 'service', label: 'Service', total: 'Services', add: 'Add a service', subtle: true },
      { value: 'freight', label: 'Freight', add: 'Freight', subtle: true },
    ],
    materialFilter: "{'query':{'bool':{'filter':[{'term':{'appTags':'item'}}]}},'sort':[{'systemHeader.summaryName':'asc'}]}",
    materialFields: { partNo: 'partNo', unitCost: 'unitCostNum', unit: 'unit' },
    catalogKind: 'goods', catalogLabel: 'From a catalogue', catalogNoun: 'catalogue items', costLabel: 'Unit price, ex GST',
    emptyText: 'Nothing yet.', noteText: 'Approvals and the budget count the subtotal, ex GST.',
  },
  budget: { componentName: 'solid-budget-check', name: 'budgetView', label: 'Budget', mode: 'request', disableSave: true, remainingField: 'budgetRemainingNum' },
  budgetOver: { componentName: 'solid-budget-check', name: 'budgetView', label: 'Budget', mode: 'request', disableSave: true },
  budgets: { componentName: 'solid-budget-check', name: 'budgets', label: 'Budgets this year', mode: 'summary', disableSave: true },
  budgetsNone: {
    componentName: 'solid-budget-check', name: 'myBudgets', label: 'My cost centres', mode: 'summary', disableSave: true, emptyText: 'You don’t look after a cost centre.',
    costCentreFilter: "{'query':{'bool':{'filter':[{'term':{'appTags':'costCentre'}},{'term':{'ownerRel.documentId':'account-nobody'}}]}}}",
  },
  quotes: {
    componentName: 'solid-quote-compare', name: 'quotes', label: 'Quotes', disableSave: true, templateId: 'template-quote', rules: QUOTE_RULES, countField: 'quotesValidNum',
    suppliers: "{'query':{'bool':{'filter':[{'term':{'appTags':'supplier'}}]}},'sort':[{'systemHeader.summaryName':'asc'}]}",
  },
  docs: {
    componentName: 'solid-photo-capture', name: 'attachmentsArr', label: 'Documents', layout: 'list', allowFiles: true, accept: '.pdf,image/*', kinds: ['Quote', 'Specification', 'Invoice', 'Other'].map((value) => ({ value, label: value })),
  },
};

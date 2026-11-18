// Component lists of every procurement template: the forms (purchase request, quote, supplier, cost
// centre, catalogue item, approval tier), the pages (purchasing overview, my requests, my approvals,
// the request register, orders, budgets) and the admin lookups; and the menus.

import { CONFIG_ID, SYSTEM, TEMPLATE_EDITOR_ID } from '@solidjs-components/platform/documents';
import {
  accountsOfType, appParts, button, check, comments, date, dropDown, html, inPanel, markdown, ME, number, pageTitle, person, q, query, range, referenceField, searchBox, table, term, terms, text, THIS,
} from '@solidjs-components/platform/form-parts';
import { CATEGORIES, TRANSITION_KEYS, TRANSITIONS } from './catalog.mjs';
import { COMPANY, COST_CENTRE_FIELDS, COUNTERS, GST_RATE, KEYS, LOOKUPS, PERSON_VALUE_FIELDS, QUOTE_RULES, ROLES, STATUS_KINDS, SUPPLIER_FIELDS, T, TIME_ZONE } from './model.mjs';

const { docs: procDocs, lookupFilter, tags, lookup, status: statusPicker } = appParts('proc', { transitions: TRANSITIONS });
export { q, lookupFilter };

const status = (name, label, kind, extra = {}) =>
  statusPicker(name, label, kind, {
    transitionKeys: Object.fromEntries(Object.entries(TRANSITION_KEYS[kind] ?? {}).map(([to, keys]) => [to, keys.map((k) => KEYS[k])])),
    ...extra,
  });
const reference = (kind, label) => referenceField(`${kind}Ref`, COUNTERS[kind], label);
const money = (name, label, extra = {}) => number(name, label, extra);
/** Photo capture's document types as { value, label }: the request template also has line items, whose `kinds` are objects. */
const docKinds = (...names) => names.map((value) => ({ value, label: value }));
const attachments = (name, label, extra = {}) => ({
  componentName: 'solid-photo-capture', name, label, fullWidth: true, layout: 'list', allowFiles: true, accept: '.pdf,image/*,.docx,.xlsx', captions: true, ...extra,
});
const SUPPLIERS = q(query(procDocs('supplier'), { mustNot: [term('inactiveBool', true)], sort: [{ 'systemHeader.summaryName.lcase': 'asc' }] }));
const ACTIVE_SUPPLIERS = q(query(procDocs('supplier'), { mustNot: [term('inactiveBool', true), term('blockedBool', true)], sort: [{ 'systemHeader.summaryName.lcase': 'asc' }] }));
const MANAGERS = accountsOfType(['Administrator', 'Executive', 'Finance', 'Manager']);
const IN_FLIGHT = terms('requestStatusRel.name', ['Submitted', 'Approved', 'Ordered', 'Received']);

// ------------------------------------------------------------------------------------------------
// Columns reused across pages
// ------------------------------------------------------------------------------------------------

const requestColumns = ({ wide = false, sortBy = 'systemHeader.createdDate', direction = 'desc' } = {}) => [
  { displayName: 'Request', field: 'requestRef', type: 'key', sortField: 'systemHeader.createdDate', ...(sortBy === 'systemHeader.createdDate' ? { sort: { direction, precedence: 1 } } : {}) },
  { displayName: 'What', field: 'title', link: true },
  { displayName: 'Amount', field: 'subtotalNum', type: 'money' },
  { displayName: 'Cost centre', field: 'costCentreRel', type: 'labels', responsive: { xs: 0 } },
  { displayName: 'Status', field: 'requestStatusRel', type: 'status' },
  { displayName: 'Waiting for', field: 'nextApproverRel', type: 'labels', responsive: { xs: 0, sm: 0 }, emptyText: '' },
  ...(wide
    ? [
        { displayName: 'Requester', field: 'requesterRel', type: 'user', responsive: { xs: 0, sm: 0 } },
        { displayName: 'Supplier', field: 'supplierRel', type: 'labels', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Quotes', field: 'quotesNum', type: 'numeric', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Over budget by', field: 'overBudgetByNum', type: 'money', emptyText: '', responsive: { xs: 0, sm: 0, md: 0 } },
      ]
    : []),
];
const orderColumns = (dateField, dateLabel, extra = {}) => [
  { displayName: 'Request', field: 'requestRef', type: 'key', sortField: 'systemHeader.createdDate' },
  { displayName: 'What', field: 'title', link: true },
  { displayName: 'Supplier', field: 'supplierRel', type: 'labels' },
  { displayName: 'PO', field: 'poNumber', responsive: { xs: 0 } },
  { displayName: 'Amount', field: 'totalNum', type: 'money', responsive: { xs: 0 } },
  { displayName: dateLabel, field: dateField, type: 'due', warnDays: 2, sort: { direction: 'asc', precedence: 1 }, ...extra },
  { displayName: 'Requester', field: 'requesterRel', type: 'user', responsive: { xs: 0, sm: 0 } },
];

/**
 * Component lists by template id.
 * @param {{ statuses: Record<string, Record<string, object>>, values: Record<string, Record<string, object>> }} o
 */
export function templateComponents({ statuses }) {
  const budgets = (name, label, extra = {}) => ({ componentName: 'solid-budget-check', name, label, mode: 'summary', fullWidth: true, disableSave: true, timeZone: TIME_ZONE, ...extra });
  void statuses;

  return {
    // -------------------------------------------------------------------------------- pages
    [T.overview]: [
      pageTitle('overviewTitle', 'Purchasing overview', `${COMPANY} · every cost centre`, [
        button(`/form/${T.request}`, '+ New request', true),
        button(`/form/${T.orders}`, 'Orders'),
        button(`/form/${T.budgets}`, 'Budgets'),
      ]),
      {
        componentName: 'solid-stat-tiles', name: 'procTiles', label: 'Today', fullWidth: true, disableSave: true, refreshSeconds: 120,
        tiles: [
          { label: 'Waiting for approval', filter: q(query(procDocs('request', term('requestStatusRel.name', 'Submitted')))), tone: 'warn', zeroTone: 'good', link: T.register, icon: 'clock' },
          { label: 'Over budget', filter: q(query(procDocs('request', term('requestStatusRel.name', 'Submitted'), term('overBudgetBool', true)))), tone: 'bad', zeroTone: 'good', link: T.register, hint: 'Need a Finance override' },
          { label: 'Ready to order', filter: q(query(procDocs('request', term('requestStatusRel.name', 'Approved')))), tone: 'info', link: T.orders },
          { label: 'Deliveries overdue', filter: q(query(procDocs('request', term('requestStatusRel.name', 'Ordered'), range('expectedDeliveryDate', { lt: 'now/d' })))), tone: 'bad', zeroTone: 'good', link: T.orders },
          { label: 'Waiting for the invoice', filter: q(query(procDocs('request', term('requestStatusRel.name', 'Received')))), tone: 'accent', link: T.orders },
          { label: 'Closed this month', filter: q(query(procDocs('request', term('requestStatusRel.name', 'Closed'), range('closedDate', { gte: 'now/M' })))), tone: 'good' },
        ],
      },
      budgets('overviewBudgets', 'Budgets this financial year'),
      table('pendingDt', 'Waiting for approval', query(procDocs('request', term('requestStatusRel.name', 'Submitted'))), requestColumns({ wide: true }), { rowsPerPage: 6 }),
      table('readyDt', 'Ready to order', query(procDocs('request', term('requestStatusRel.name', 'Approved'))), orderColumns('neededByDate', 'Needed by'), { rowsPerPage: 6 }),
    ],
    [T.myRequests]: [
      pageTitle('myRequestsTitle', 'My requests', 'Ask for what you need. Quotes, approvals, the order and the invoice all happen on the request.', [button(`/form/${T.request}`, '+ New request', true)]),
      table('myRequestsDt', 'My requests', query(procDocs('request', term('requesterRel.documentId', ME))), requestColumns(), { rowsPerPage: 10 }),
      budgets('myBudget', 'My cost centre', { costCentreFilter: q(query([...procDocs('costCentre'), term('documentId', '{{account.costCentreRel.0.documentId}}')])), emptyText: 'Your account has no cost centre yet: ask Procurement to set it.' }),
      table('myDeliveriesDt', 'On order for me', query(procDocs('request', term('requesterRel.documentId', ME), term('requestStatusRel.name', 'Ordered'))), orderColumns('expectedDeliveryDate', 'Expected'), { rowsPerPage: 5, emptyText: 'Nothing on order.' }),
    ],
    [T.approvals]: [
      pageTitle('approvalsTitle', 'My approvals', 'Requests waiting for your decision, and the budgets you look after.', [button(`/form/${T.request}`, '+ New request', true)]),
      table('myApprovalsDt', 'Waiting for my approval', query(procDocs('request', term('requestStatusRel.name', 'Submitted'), term('nextApproverIds', ME))), requestColumns({ wide: true }), { rowsPerPage: 8, emptyText: 'Nothing waiting for you.' }),
      budgets('myBudgets', 'My cost centres', { costCentreFilter: q(query([...procDocs('costCentre'), term('ownerRel.documentId', ME)])), emptyText: 'You don’t look after a cost centre.' }),
      table('myCentresDt', 'Requests on my cost centres', query(procDocs('request', term('costCentreRel.ownerRel.documentId', ME), IN_FLIGHT)), requestColumns({ wide: true }), { rowsPerPage: 8 }),
    ],
    [T.register]: [
      pageTitle('registerTitle', 'Purchase requests', 'Every request, newest first.', [button(`/form/${T.request}`, '+ New request', true)]),
      table('allRequestsDt', 'Requests', query(procDocs('request')), requestColumns({ wide: true }), { rowsPerPage: 15, showSearch: true, searchBoxFilter: searchBox('title', 'requestRef', 'supplierName', 'poNumber'), exportTypes: ['CSV'] }),
    ],
    [T.orders]: [
      pageTitle('ordersTitle', 'Orders', 'Approved requests to order, deliveries to chase, invoices to match.'),
      table('toOrderDt', 'Ready to order', query(procDocs('request', term('requestStatusRel.name', 'Approved'))), orderColumns('neededByDate', 'Needed by'), { rowsPerPage: 8, emptyText: 'Nothing to order.' }),
      table('onOrderDt', 'On order', query(procDocs('request', term('requestStatusRel.name', 'Ordered'))), orderColumns('expectedDeliveryDate', 'Expected'), { rowsPerPage: 8 }),
      table('toCloseDt', 'Received, waiting for the invoice', query(procDocs('request', term('requestStatusRel.name', 'Received'))), orderColumns('receivedDate', 'Received', { type: 'date' }), { rowsPerPage: 8 }),
    ],
    [T.budgets]: [
      pageTitle('budgetsTitle', 'Budgets', 'Each cost centre this financial year: spent, committed (approved and on order), waiting for approval, and what is left.'),
      budgets('allBudgets', 'Budgets', { hideLabel: true }),
      table('centresDt', 'Cost centres', query(procDocs('costCentre')), [
        { displayName: 'Code', field: 'code', sort: { direction: 'asc' } },
        { displayName: 'Cost centre', field: 'nameId', link: true },
        { displayName: 'Manager', field: 'ownerRel', type: 'user' },
        { displayName: 'Budget', field: 'budgetNum', type: 'money' },
        { displayName: 'Spent', field: 'spentNum', type: 'money' },
        { displayName: 'Committed', field: 'committedNum', type: 'money', responsive: { xs: 0 } },
        { displayName: 'Left', field: 'remainingNum', type: 'money' },
      ], { rowsPerPage: 20, exportTypes: ['CSV'] }),
    ],

    // -------------------------------------------------------------------------------- forms
    [T.request]: [
      tags('request'),
      reference('request', 'Request'),
      status('requestStatusRel', 'Status', 'requestStatus'),
      text('title', 'What is being bought', { mandatory: true, fullWidth: true, maxLength: 140 }),
      person('requesterRel', 'Requested by', { mandatory: true, relatedFields: PERSON_VALUE_FIELDS }),
      lookup('costCentreRel', 'Cost centre', 'costCentre', { mandatory: true, relatedFields: COST_CENTRE_FIELDS, filter: q(query(procDocs('costCentre'), { mustNot: [term('inactiveBool', true)], sort: [{ code: 'asc' }] })) }),
      lookup('categoryRel', 'Category', 'category', { mandatory: true }),
      date('neededByDate', 'Needed by', { mandatory: true }),
      { componentName: 'solid-lookup-picker', name: 'supplierRel', label: 'Supplier', singleSelection: true, showDropDown: true, iconSet: 'none', filter: ACTIVE_SUPPLIERS, relatedFields: SUPPLIER_FIELDS },
      text('justification', 'Why it is needed', { fullWidth: true, maxLength: 600 }),
      {
        componentName: 'solid-line-items', name: 'lineItemsArr', label: 'What is being bought', fullWidth: true, mandatory: true,
        kinds: [
          { value: 'goods', label: 'Goods', alwaysTotal: true, add: 'Add an item' },
          { value: 'service', label: 'Service', total: 'Services', add: 'Add a service', subtle: true },
          { value: 'freight', label: 'Freight', add: 'Freight', subtle: true },
        ],
        materialFilter: q(query(procDocs('item'), { mustNot: [term('inactiveBool', true)], sort: [{ 'systemHeader.summaryName.lcase': 'asc' }] })),
        materialFields: { partNo: 'partNo', unitCost: 'unitCostNum', unit: 'unit' },
        catalogKind: 'goods', catalogLabel: 'From a catalogue', catalogNoun: 'catalogue items', costLabel: 'Unit price, ex GST', taxRate: GST_RATE,
        emptyText: 'Nothing yet: add items from a supplier catalogue, or describe them.', noteText: 'Approvals and the budget count the subtotal, ex GST.',
      },
      ...inPanel('budgetPanel', 'Budget', [
        { componentName: 'solid-budget-check', name: 'budgetView', label: 'Budget', hideLabel: true, mode: 'request', fullWidth: true, disableSave: true, remainingField: 'budgetRemainingNum', taxRate: GST_RATE, timeZone: TIME_ZONE },
      ]),
      ...inPanel('quotesPanel', 'Quotes', [
        {
          componentName: 'solid-quote-compare', name: 'quotes', label: 'Quotes', hideLabel: true, fullWidth: true, disableSave: true, templateId: T.quote, rules: QUOTE_RULES, countField: 'quotesValidNum',
          suppliers: ACTIVE_SUPPLIERS, supplierFields: SUPPLIER_FIELDS, taxRate: GST_RATE,
        },
        text('notCheapestReason', 'Why not the cheapest quote (if not)', { fullWidth: true }),
        text('soleSupplierReason', 'Why there is only one supplier (if fewer quotes than needed)', { fullWidth: true }),
      ]),
      ...inPanel('approvalPanel', 'Approval', [
        { componentName: 'solid-approval-chain', name: 'approvalChain', label: 'Approval', hideLabel: true, fullWidth: true, noun: 'request', people: MANAGERS, emptyText: 'Approvers are chosen by the amount when the request is submitted.' },
      ]),
      ...inPanel('orderPanel', 'Order', [
        text('poNumber', 'Purchase order', { enabled: false }),
        date('orderedDate', 'Ordered', { enabled: false }),
        date('expectedDeliveryDate', 'Expected delivery'),
      ]),
      ...inPanel('receiptPanel', 'Delivery', [
        date('receivedDate', 'Received', { enabled: false }),
        person('receivedByRel', 'Received by', { enabled: false }),
        text('receiptNotes', 'Notes on the delivery', { fullWidth: true }),
      ]),
      ...inPanel('invoicePanel', 'Invoice', [
        text('invoiceNumber', 'Invoice number'),
        date('invoiceDate', 'Invoice date'),
        money('invoiceAmountNum', 'Invoice amount, inc GST'),
        text('matchResult', 'Match', { enabled: false }),
        text('varianceReason', 'Why the invoice is more than approved', { fullWidth: true, visible: false }),
      ]),
      attachments('attachmentsArr', 'Documents', { kinds: docKinds('Quote', 'Specification', 'Delivery docket', 'Invoice', 'Other') }),
      text('cancelReason', 'Why it was cancelled', { fullWidth: true, visible: false }),
      comments(),
    ],
    [T.quote]: [
      tags('quote'),
      reference('quote', 'Quote'),
      { componentName: 'solid-lookup-picker', name: 'requestRel', label: 'For request', singleSelection: true, enabled: false, iconSet: 'none', filter: q(query(procDocs('request'))) },
      { componentName: 'solid-lookup-picker', name: 'supplierRel', label: 'Supplier', mandatory: true, singleSelection: true, showDropDown: true, iconSet: 'none', filter: ACTIVE_SUPPLIERS, relatedFields: SUPPLIER_FIELDS },
      money('amountNum', 'Amount, ex GST', { mandatory: true }),
      date('validUntilDate', 'Valid until'),
      number('leadTimeDaysNum', 'Lead time (days)'),
      text('notes', 'Notes', { fullWidth: true }),
      attachments('attachmentsArr', 'Quote document', { kinds: docKinds('Quote', 'Other'), maxPhotos: 5 }),
    ],
    [T.supplier]: [
      tags('supplier'),
      text('nameId', 'Supplier', { mandatory: true }),
      text('abn', 'ABN'),
      lookup('categoryRel', 'Category', 'category'),
      text('email', 'Email'),
      text('phone', 'Phone'),
      dropDown('paymentTerms', 'Payment terms', ['7 days', '14 days', '30 days', '45 days', 'Prepaid']),
      check('approvedBool', 'Approved supplier'),
      check('blockedBool', 'Blocked'),
      text('blockReason', 'Why it is blocked', { fullWidth: true }),
      check('inactiveBool', 'Inactive'),
      table('supplierItemsDt', 'Catalogue', query(procDocs('item', term('supplierRel.documentId', THIS))), [
        { displayName: 'Item', field: 'nameId', link: true },
        { displayName: 'Part no.', field: 'partNo' },
        { displayName: 'Unit', field: 'unit' },
        { displayName: 'Price ex GST', field: 'unitCostNum', type: 'money' },
      ], { rowsPerPage: 10 }),
      table('supplierRequestsDt', 'Requests', query(procDocs('request', term('supplierRel.documentId', THIS))), requestColumns(), { rowsPerPage: 8 }),
      table('allSuppliersDt', 'Suppliers', query(procDocs('supplier')), [
        { displayName: 'Supplier', field: 'nameId', link: true, sort: { direction: 'asc' } },
        { displayName: 'Category', field: 'categoryRel', type: 'labels' },
        { displayName: 'Approved', field: 'approvedBool', type: 'boolean' },
        { displayName: 'Blocked', field: 'blockedBool', type: 'boolean' },
        { displayName: 'Terms', field: 'paymentTerms' },
      ], { rowsPerPage: 25, showSearch: true, searchBoxFilter: searchBox('nameId', 'abn') }),
    ],
    [T.costCentre]: [
      tags('costCentre'),
      text('nameId', 'Cost centre', { mandatory: true }),
      text('code', 'Code', { mandatory: true }),
      person('ownerRel', 'Manager', { filter: MANAGERS }),
      text('fyKey', 'Financial year'),
      money('budgetNum', 'Budget for the year, ex GST'),
      money('baseSpentNum', 'Spent outside purchase requests (from the ledger)'),
      { componentName: 'solid-budget-check', name: 'centreBudget', label: 'This year', mode: 'summary', fullWidth: true, disableSave: true, timeZone: TIME_ZONE, costCentreFilter: q(query([...procDocs('costCentre'), term('documentId', THIS)])) },
      number('indexNum', 'Order'),
      check('inactiveBool', 'Inactive'),
      table('centreRequestsDt', 'Requests this year', query(procDocs('request', term('costCentreRel.documentId', THIS))), requestColumns(), { rowsPerPage: 10 }),
    ],
    [T.item]: [
      tags('item'),
      text('nameId', 'Item', { mandatory: true, fullWidth: true }),
      { componentName: 'solid-lookup-picker', name: 'supplierRel', label: 'Supplier', singleSelection: true, showDropDown: true, iconSet: 'none', filter: SUPPLIERS },
      text('partNo', 'Part no.'),
      text('unit', 'Unit'),
      money('unitCostNum', 'Price, ex GST'),
      check('inactiveBool', 'Inactive'),
      table('allItemsDt', 'Catalogue', query(procDocs('item')), [
        { displayName: 'Item', field: 'nameId', link: true, sort: { direction: 'asc' } },
        { displayName: 'Supplier', field: 'supplierRel', type: 'labels' },
        { displayName: 'Part no.', field: 'partNo' },
        { displayName: 'Price ex GST', field: 'unitCostNum', type: 'money' },
      ], { rowsPerPage: 25, showSearch: true, searchBoxFilter: searchBox('nameId', 'partNo') }),
    ],
    [T.tier]: [
      tags('tier'),
      html('tierHelp', `<div style="font-family:system-ui,sans-serif;color:#5e5e6d">A delegation of authority: a request above the amount (ex GST) needs this approval. The cost centre manager approves every request; a manager's own request goes to their manager. Nobody approves twice.</div>`),
      text('nameId', 'Approval', { mandatory: true }),
      text('tierKey', 'Key (stable)', { mandatory: true }),
      money('fromAmountNum', 'Needed above (ex GST)'),
      dropDown('rule', 'Who approves', ['owner', 'ownerManager', 'people']),
      person('approversRel', 'People (when "people")', { singleSelection: false, filter: MANAGERS }),
      check('inactiveBool', 'Inactive'),
      table('allTiersDt', 'Delegations of authority', query(procDocs('tier')), [
        { displayName: 'Approval', field: 'nameId', link: true },
        { displayName: 'Above', field: 'fromAmountNum', type: 'money', sort: { direction: 'asc' } },
        { displayName: 'Who', field: 'rule' },
        { displayName: 'People', field: 'approversRel', type: 'labels' },
      ]),
    ],
    [T.counter]: Object.values(COUNTERS).map((c) => text(c.field, `${c.prefix} counter`)),
    ...lookupTemplates(),
  };
}

function lookupTemplates() {
  const out = {};
  for (const [kind, names] of Object.entries(LOOKUPS)) {
    const isStatus = STATUS_KINDS.includes(kind);
    out[T[`lookup_${kind}`]] = [
      tags(kind),
      text('nameId', names.name, { mandatory: true }),
      number('indexNum', 'Order'),
      ...(isStatus ? [{ componentName: 'sc-text-box', name: 'color', label: 'Colour (CSS)' }, dropDown('statusCategory', 'Category', ['todo', 'inprogress', 'done'])] : []),
      check('inactiveBool', 'Inactive'),
      table('allDocsDt', names.plural, query(procDocs(kind)), [
        { displayName: 'Name', field: 'nameId', link: true },
        ...(isStatus ? [{ displayName: 'Colour', field: 'color', type: 'color' }] : []),
        { displayName: 'Order', field: 'indexNum', type: 'numeric', sort: { direction: 'asc' } },
        { displayName: 'Inactive', field: 'inactiveBool', type: 'boolean' },
      ], { rowsPerPage: 25 }),
    ];
  }
  return out;
}

/** The purchasing fields on the account form. */
export function accountComponents() {
  return [
    dropDown('accountType', 'Account type', Object.keys(ROLES)),
    text('jobTitle', 'Title'),
    lookup('costCentreRel', 'Cost centre', 'costCentre', { relatedFields: COST_CENTRE_FIELDS }),
    person('managerRel', 'Reports to', { filter: MANAGERS }),
    check('overrideApproverBool', 'Approves going over budget (Finance override)'),
  ];
}

/** Menus by account type. */
export function menuFor(type, { menuItem, menuGroup }) {
  const form = (id) => `/form/${id}`;
  const lookups = (kinds) => kinds.map((kind) => menuItem(LOOKUPS[kind].plural, form(T[`lookup_${kind}`])));
  const purchasing = menuGroup('Purchasing', [
    menuItem('Purchase requests', form(T.register)),
    menuItem('Orders', form(T.orders)),
    menuItem('Budgets', form(T.budgets)),
    menuItem('Suppliers', form(T.supplier)),
    menuItem('Catalogue', form(T.item)),
  ]);
  const setup = menuGroup('Set-up', [
    menuItem('Cost centres', form(T.costCentre)),
    menuItem('Delegations of authority', form(T.tier)),
    ...lookups(['category', ...STATUS_KINDS]),
  ]);
  const admin = menuGroup('Admin', [
    menuItem('Purchase request template', `${form(T.request)}/${TEMPLATE_EDITOR_ID}`),
    menuItem('Rulesets', `/form/${SYSTEM.ruleSet}`),
    menuItem('Configuration', `${form(CONFIG_ID)}/${TEMPLATE_EDITOR_ID}`),
  ]);
  const overview = menuItem('Purchasing overview', form(T.overview));
  const mine = menuItem('My requests', form(T.myRequests));
  const approvals = menuItem('My approvals', form(T.approvals));
  const newRequest = menuItem('New request', form(T.request));
  switch (type) {
    case 'Administrator':
      return [overview, approvals, mine, newRequest, purchasing, setup, admin];
    case 'Finance':
    case 'Procurement':
      return [overview, approvals, mine, newRequest, purchasing, setup];
    case 'Executive':
      return [approvals, overview, mine, newRequest, purchasing];
    case 'Manager':
      return [approvals, mine, newRequest, menuItem('Purchase requests', form(T.register)), menuItem('Budgets', form(T.budgets))];
    default:
      return [mine, newRequest, menuItem('Budgets', form(T.budgets))];
  }
}

/** Where each account type starts. */
export const HOME_BY_TYPE = {
  Administrator: T.overview,
  Finance: T.overview,
  Procurement: T.overview,
  Executive: T.approvals,
  Manager: T.approvals,
  Employee: T.myRequests,
};

export { CATEGORIES, markdown };

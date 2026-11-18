// Assembles every document of the procurement demo database: lookups, people and reporting lines,
// cost centres and their budgets, the delegations of authority, suppliers and their catalogues, a
// financial year of purchase requests (with quotes, approvals, orders, deliveries and invoices) and
// this week's story, the templates and rulesets, and the platform documents.
//
// Data is generated around "now" with a seeded random generator, so every seed tells the same story
// relative to the day it runs. Derived values (totals, quotes needed, budget positions, approval
// chains, invoice matches) come from the same functions the rulesets use, so seeded records look
// exactly as if they had been saved.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentRepos, DocumentSet, header, menuGroup, menuItem, related, SYSTEM } from '@solidjs-components/platform/documents';
import { LOOKUP_FIELDS, PERSON_FIELDS } from '@solidjs-components/platform/form-parts';
import { appDocuments, companyClock, iso, random } from '@solidjs-components/platform/seed-kit';
import { approvalStatus } from '../../../solidjs-components-shared/packages/kit/src/domain/approval.ts';
import { lineTotals } from '../../../solidjs-components-shared/packages/kit/src/domain/money.ts';
import { dayKey, dayStart } from '../../../solidjs-components-shared/packages/kit/src/domain/range.ts';
import { purchaseApprovalSteps } from '../../packages/proc-kit/src/logic/approvals.ts';
import { budgetPosition, financialYear, invoiceMatch } from '../../packages/proc-kit/src/logic/budget.ts';
import { quoteProblems } from '../../packages/proc-kit/src/logic/quotes.ts';
import { CATEGORIES, COST_CENTRES, ITEMS, PEOPLE, STATUSES, STORY, SUPPLIERS, TIERS } from './catalog.mjs';
import {
  COMPANY, COST_CENTRE_FIELDS, COUNTERS, DEMO_PASSWORD, GST_RATE, INVOICE_TOLERANCE, KEYS, LOOKUPS, PERSON_VALUE_FIELDS, procId, QUOTE_RULES, ROLES, RULESETS, SUPPLIER_FIELDS, T, TIME_ZONE,
} from './model.mjs';
import * as rules from './rules.mjs';
import { accountComponents, HOME_BY_TYPE, menuFor, templateComponents } from './templates.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const money = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dayText = (time) => {
  const key = dayKey(time, TIME_ZONE);
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short' })} ${d.getUTCDate()} ${d.toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'short' })}`;
};
/** The kind of line a catalogue item makes. */
const kindOf = (partNo) => (partNo.startsWith('QF-') ? 'freight' : partNo.startsWith('PSR-') ? 'service' : 'goods');
/** Background requests: the suppliers each cost centre buys from, and the category. */
const BUYS = {
  exe: [['signs', 'Marketing'], ['pinnacle', 'IT equipment']],
  fin: [['pinnacle', 'IT equipment'], ['datacore', 'IT equipment']],
  pro: [['tools', 'Tools and equipment'], ['freight', 'Vehicles and tyres']],
  wsh: [['tools', 'Tools and equipment'], ['hydraulics', 'Tools and equipment'], ['tyres', 'Vehicles and tyres']],
  fop: [['survey', 'Equipment hire'], ['ppe', 'PPE and safety'], ['powergen', 'Equipment hire']],
  its: [['pinnacle', 'IT equipment'], ['datacore', 'IT equipment'], ['northern', 'IT equipment']],
  fac: [['fitouts', 'Facilities and maintenance']],
  hse: [['ppe', 'PPE and safety'], ['safegear', 'PPE and safety']],
  mkt: [['signs', 'Marketing'], ['expo', 'Marketing']],
};

/**
 * Builds the procurement demo documents.
 * @param {{ now?: Date, urlRoot?: string, platform?: boolean }} [options] - `platform: false` leaves out the platform and
 *   component documents (unit tests: they need built bundles)
 */
export function buildDemo({ now = new Date(), urlRoot = 'http://localhost:3005', platform = true } = {}) {
  const NOW = now.getTime();
  const rand = random(20261119);
  const { at } = companyClock({ now: NOW, timeZone: TIME_ZONE });
  const today = dayKey(NOW, TIME_ZONE);
  const fy = financialYear(today);
  const [ty, tm] = today.split('-').map(Number);
  const fyStart = Date.parse(`${tm >= 7 ? ty : ty - 1}-07-01T00:00:00+10:00`);

  const seededAt = new Date(at(-420, 8));
  const adminId = procId('account', 'claire');
  const set = new DocumentSet({ at: seededAt, by: adminId });
  const { doc, statusValues, lookupValues } = appDocuments({ set, app: 'proc', idOf: procId, at: seededAt, by: adminId });

  // ---------------------------------------------------------------------------------- lookups
  const statuses = { requestStatus: statusValues('requestStatus', T.lookup_requestStatus, STATUSES.requestStatus) };
  const values = { category: lookupValues('category', T.lookup_category, CATEGORIES) };

  // ----------------------------------------------------------------------------------- people
  const people = {};
  PEOPLE.forEach((p) => {
    const email = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';
    const account = set.account({
      id: procId('account', p.key),
      securityId: procId('accountSecurity', p.key),
      controlId: procId('accountControl', p.key),
      first: p.first,
      last: p.last,
      email,
      title: p.title,
      password: DEMO_PASSWORD,
      adminKey: KEYS.admin,
      accessKeys: ROLES[p.type].map((k) => KEYS[k]),
      fields: { accountType: p.type, overrideApproverBool: !!p.override, defaultURL: HOME_BY_TYPE[p.type], menu: menuFor(p.type, { menuItem, menuGroup }) },
    });
    people[p.key] = { ...p, name: `${p.first} ${p.last}`, email, documentId: account.documentId, account };
  });
  for (const p of PEOPLE) if (p.manager) people[p.key].account.managerRel = [related(people[p.manager].account, PERSON_FIELDS)];
  const author = (key) => ({ documentId: people[key].documentId, name: people[key].name });

  // ------------------------------------------------------------------- cost centres and tiers
  const centres = {};
  COST_CENTRES.forEach((c, i) => {
    const d = doc('costCentre', T.costCentre, c.name, {
      nameId: c.name, code: c.code, ownerRel: [related(people[c.owner].account, PERSON_FIELDS)], fyKey: fy, budgetNum: c.budget, baseSpentNum: 0, indexNum: (i + 1) * 10, inactiveBool: false,
    });
    centres[c.key] = { ...c, doc: d, value: related(d, COST_CENTRE_FIELDS) };
  });
  for (const p of PEOPLE) people[p.key].account.costCentreRel = [centres[p.cc].value];
  const personValue = (key) => related(people[key].account, PERSON_VALUE_FIELDS);
  const tiers = TIERS.map((t) => ({ ...t, approvers: (t.approvers ?? []).map(author) }));
  TIERS.forEach((t) =>
    doc('tier', T.tier, t.label, { nameId: t.label, tierKey: t.id, fromAmountNum: t.fromAmount, rule: t.rule, approversRel: (t.approvers ?? []).map((k) => related(people[k].account, PERSON_FIELDS)), inactiveBool: false }),
  );
  const finance = PEOPLE.filter((p) => p.override).map((p) => author(p.key));
  const procurement = PEOPLE.filter((p) => p.type === 'Procurement' || p.type === 'Administrator').map((p) => author(p.key)).sort((a, b) => a.name.localeCompare(b.name));

  // ---------------------------------------------------------------------- suppliers, catalogue
  const suppliers = {};
  SUPPLIERS.forEach(([key, name, category, approved, blocked, terms]) => {
    const d = doc('supplier', T.supplier, name, {
      nameId: name, abn: `${rand.int(10, 99)} ${rand.int(100, 999)} ${rand.int(100, 999)} ${rand.int(100, 999)}`, categoryRel: [values.category[category]],
      email: `accounts@${name.toLowerCase().replace(/[^a-z]+/g, '')}.example.com`, phone: `02 49${rand.int(10, 99)} ${rand.int(1000, 9999)}`, paymentTerms: terms,
      approvedBool: approved, blockedBool: blocked, ...(blocked ? { blockReason: 'Goods failed inspection twice; not to be used.' } : {}), inactiveBool: false,
    });
    suppliers[key] = { name, value: related(d, SUPPLIER_FIELDS) };
  });
  const items = {};
  ITEMS.forEach(([supplier, name, partNo, unit, cost]) => {
    const d = doc('item', T.item, name, { nameId: name, supplierRel: [suppliers[supplier].value], partNo, unit, unitCostNum: cost, inactiveBool: false });
    items[partNo] = { supplier, name, partNo, unit, cost, documentId: d.documentId };
  });
  const line = (partNo, qty, i) => {
    const item = items[partNo];
    return { id: `line-${i + 1}`, kind: kindOf(partNo), description: item.name, materialRel: [{ documentId: item.documentId, name: item.name, partNo }], qty, unit: item.unit, unitCost: item.cost };
  };

  // -------------------------------------------------------------------------------- requests
  const requests = [];
  const quotes = [];
  const ccRequests = (cc) => requests.filter((r) => r.cc === cc).map((r) => ({ documentId: r.id, status: r.status, amount: r.subtotal, invoiced: r.invoicedExGst ?? null }));

  /** Plans one request: its lines, quotes, budget position and approvals, as the rules would. */
  const plan = (r) => {
    const lines = r.lines.map(([partNo, qty], i) => line(partNo, qty, i));
    const totals = lineTotals(lines, GST_RATE);
    const id = procId('request', r.key);
    const quoteList = (r.quotes ?? []).map(([supplier, amount, validDays, lead], i) => ({
      id: procId('quote', `${r.key}:${supplier}`), supplier, amount, validUntil: at(validDays, 17), lead, order: i,
    }));
    const qFacts = quoteProblems({
      amount: totals.subtotal, quotes: quoteList.map((q) => ({ documentId: q.id, supplier: suppliers[q.supplier].name, amount: q.amount, validUntil: iso(q.validUntil) })),
      chosenId: quoteList.find((q) => q.supplier === r.chosen)?.id, soleSupplierReason: r.soleSupplierReason, notCheapestReason: r.notCheapestReason, rules: QUOTE_RULES, now: r.askedAt,
    });
    const budget = budgetPosition({ budget: centres[r.cc].budget, baseSpent: centres[r.cc].doc.baseSpentNum, requests: ccRequests(r.cc), exclude: id, amount: totals.subtotal });
    const ownerKey = centres[r.cc].owner;
    const ownerManagerKey = PEOPLE.find((p) => p.key === ownerKey).manager;
    const supplierKey = r.chosen ?? r.supplier;
    const reasons = [];
    if (qFacts.shortBy && r.soleSupplierReason) reasons.push(`Sole supplier: ${r.soleSupplierReason}`);
    if (supplierKey && !SUPPLIERS.find(([k]) => k === supplierKey)[3]) reasons.push(`${suppliers[supplierKey].name} is not an approved supplier yet.`);
    const steps = purchaseApprovalSteps({
      requester: author(r.who), owner: author(ownerKey), ownerManager: ownerManagerKey ? author(ownerManagerKey) : null, amount: totals.subtotal, tiers, finance, procurement, procurementReasons: reasons,
      overBudget: budget.overBy > 0 ? { by: budget.overBy, remaining: budget.remaining, costCentre: centres[r.cc].name } : null,
    });
    return { ...r, id, lines, totals, subtotal: totals.subtotal, quoteList, qFacts, budget, steps, supplierKey };
  };

  /** Writes a planned request (and its quotes) as the rules would have left it. */
  const write = (r) => {
    const ref = `${COUNTERS.request.prefix}-${r.refNo}`;
    const notes = [];
    const told = [];
    const tell = (list) => list.forEach((p) => p && !told.some((t) => t.documentId === p.documentId) && told.push({ documentId: p.documentId, name: p.name }));
    const note = (by, time, detail) => notes.push({ dataId: `note-${r.key}-${notes.length}`, detail, createdBy: author(by), createdDate: iso(time), comments: [], votes: [] });
    const status = r.status;
    let time = r.askedAt;
    let chain = { steps: [] };
    let approvedAt = null;
    if (status !== 'Draft' && !(status === 'Cancelled' && !r.steps.length)) {
      tell(r.steps[0]?.approvers ?? []);
      note(r.who, time, `Submitted for ${money(r.subtotal)} ex GST. Waiting for ${r.steps[0].approvers.map((p) => p.name).join(' or ')} (${r.steps[0].label})${r.steps[0].reason ? `: ${r.steps[0].reason}` : '.'} Told ${r.steps[0].approvers.map((p) => p.name).join(', ')}.`);
      const decided = r.background ? r.steps.map((s) => s.id) : r.approved;
      chain = {
        steps: r.steps.map((step, i) => {
          const made = decided.find((d) => d.split(':')[0] === step.id);
          if (!made) return { ...step, decision: '', decidedBy: null, decidedAt: null, comment: '', delegate: null, delegatedBy: null, delegatedAt: null };
          time = Math.min(NOW - 2 * HOUR, time + rand.int(2, 26) * HOUR);
          const decision = made.endsWith(':rejected') ? 'rejected' : 'approved';
          const by = step.approvers[0];
          const comment = decision === 'rejected' ? r.rejectComment : '';
          note(PEOPLE.find((p) => people[p.key].documentId === by.documentId).key, time, `**${decision === 'approved' ? 'Approved' : 'Rejected'}** by ${by.name} (${step.label})${comment ? `: ${comment}` : '.'}`);
          const next = r.steps[i + 1];
          if (decision === 'approved' && next && !decided.find((d) => d.split(':')[0] === next.id)) {
            tell(next.approvers);
            note(PEOPLE.find((p) => people[p.key].documentId === by.documentId).key, time + 60_000, `Now waiting for ${next.approvers.map((p) => p.name).join(' or ')} (${next.label})${next.reason ? `: ${next.reason}` : '.'} Told ${next.approvers.map((p) => p.name).join(', ')}.`);
          }
          return { ...step, decision, decidedBy: by, decidedAt: iso(time), comment, delegate: null, delegatedBy: null, delegatedAt: null };
        }),
      };
      const state = approvalStatus(chain);
      if (state.state === 'approved') {
        approvedAt = time;
        tell([author(r.who), ...procurement]);
        note(PEOPLE.find((p) => people[p.key].documentId === chain.steps.at(-1).decidedBy.documentId).key, time + 60_000, `**Approved** for ${money(r.subtotal)} ex GST: ready to order. Told ${[author(r.who), ...procurement].map((p) => p.name).join(', ')}.`);
      }
      if (state.state === 'rejected') {
        tell([author(r.who)]);
        note(PEOPLE.find((p) => people[p.key].documentId === chain.steps.find((s) => s.decision === 'rejected').decidedBy.documentId).key, time + 60_000, `**Rejected.** ${people[r.who].name} has been told.`);
      }
    }
    const state = approvalStatus(chain);
    const after = (days) => (days === undefined ? null : NOW - days * DAY);
    const orderedAt = ['Ordered', 'Received', 'Closed'].includes(status) ? (r.orderedAgo !== undefined ? after(r.orderedAgo) : Math.min(NOW - DAY, approvedAt + rand.int(1, 3) * DAY)) : null;
    const expectedAt = orderedAt ? (r.expectedAgo !== undefined ? at(-r.expectedAgo, 17) : Math.min(orderedAt + rand.int(3, 14) * DAY, NOW + 10 * DAY)) : null;
    const receivedAt = ['Received', 'Closed'].includes(status) ? (r.receivedAgo !== undefined ? after(r.receivedAgo) : Math.min(NOW - DAY, expectedAt + rand.int(-1, 2) * DAY)) : null;
    const closedAt = status === 'Closed' ? Math.min(NOW - HOUR, receivedAt + rand.int(3, 20) * DAY) : null;
    const po = `PO-${r.refNo}`;
    if (orderedAt) {
      tell([author(r.who)]);
      note('marco', orderedAt, `**Ordered** from ${suppliers[r.supplierKey].name}: ${po}, expected ${dayText(expectedAt)}.`);
    }
    if (receivedAt) note(r.who, receivedAt, `**Received** by ${people[r.who].name}${r.receiptNotes ? `: ${r.receiptNotes}` : '.'}`);
    const invoice = r.invoice ?? (status === 'Closed' ? { number: `INV-${rand.int(10000, 99999)}`, amount: Math.round(r.totals.total * (rand.chance(0.75) ? 1 : 1 + rand.int(-3, 4) / 100) * 100) / 100 } : null);
    const match = invoice ? invoiceMatch({ approved: r.totals.total, invoiced: invoice.amount, ...INVOICE_TOLERANCE }) : null;
    const invoicedExGst = invoice && status === 'Closed' ? Math.round((invoice.amount / (1 + GST_RATE)) * 100) / 100 : null;
    r.invoicedExGst = invoicedExGst;
    if (closedAt) note('mia', closedAt, `**Closed.** Invoice ${invoice.number} for ${money(invoice.amount)} inc GST: ${match.result.toLowerCase()}${match.variance ? ` (${match.variance > 0 ? '+' : ''}${money(match.variance)})` : ''}.`);
    if (status === 'Cancelled') note(r.who, r.askedAt + 2 * DAY, `**Cancelled** by ${people[r.who].name}: ${r.cancelReason}`);
    const waiting = status === 'Submitted' ? state.waitingOn : [];
    const chosen = r.quoteList.find((q) => q.supplier === r.chosen);
    const updatedAt = Math.max(r.askedAt, time, orderedAt ?? 0, receivedAt ?? 0, closedAt ?? 0);
    set.add({
      documentId: r.id,
      systemHeader: header({ systemType: 'document', templateId: T.request, summaryName: `${ref}: ${r.title}`, at: new Date(r.askedAt - HOUR), by: people[r.who].documentId }),
      appTags: ['proc', 'request'],
      requestRef: ref,
      title: r.title,
      requestStatusRel: [statuses.requestStatus[status]],
      lastStatus: status,
      transition: null,
      requesterRel: [personValue(r.who)],
      costCentreRel: [centres[r.cc].value],
      categoryRel: [values.category[r.category]],
      ...(r.supplierKey ? { supplierRel: [suppliers[r.supplierKey].value], supplierName: suppliers[r.supplierKey].name } : { supplierName: '' }),
      neededByDate: dayStart(dayKey(r.askedAt + rand.int(10, 30) * DAY, TIME_ZONE), TIME_ZONE),
      justification: r.justification ?? '',
      lineItemsArr: r.lines,
      subtotalNum: r.totals.subtotal,
      gstNum: r.totals.tax,
      totalNum: r.totals.total,
      ...(chosen ? { chosenQuoteRel: [{ documentId: chosen.id, name: `${chosen.ref}: ${suppliers[chosen.supplier].name}`, supplier: suppliers[chosen.supplier].name, amount: chosen.amount }] } : {}),
      notCheapestReason: r.notCheapestReason ?? '',
      soleSupplierReason: r.soleSupplierReason ?? '',
      quotesNum: r.quoteList.length,
      quotesValidNum: r.qFacts.valid.length,
      quotesNeededNum: r.qFacts.needed,
      ...(r.quoteList.length ? { cheapestQuoteNum: Math.min(...r.quoteList.map((q) => q.amount)) } : {}),
      fyKey: financialYear(dayKey(r.askedAt, TIME_ZONE)),
      ...(status !== 'Draft' ? { submittedDate: iso(r.askedAt) } : {}),
      budgetRemainingNum: r.budget.remaining,
      overBudgetBool: r.budget.overBy > 0,
      overBudgetByNum: r.budget.overBy > 0 ? r.budget.overBy : null,
      approvalChain: chain,
      approvalState: state.state,
      nextApproverIds: waiting.map((p) => p.documentId),
      nextApproverRel: waiting.map((p) => ({ documentId: p.documentId, name: p.name })),
      ...(approvedAt ? { approvedDate: iso(approvedAt) } : {}),
      ...(orderedAt ? { poNumber: po, orderedDate: iso(orderedAt), orderedByRel: [author('marco')], expectedDeliveryDate: dayStart(dayKey(expectedAt, TIME_ZONE), TIME_ZONE) } : {}),
      ...(receivedAt ? { receivedDate: iso(receivedAt), receivedByRel: [author(r.who)], receiptNotes: r.receiptNotes ?? '' } : {}),
      ...(invoice ? { invoiceNumber: invoice.number, invoiceDate: dayStart(dayKey((closedAt ?? receivedAt ?? NOW) - DAY, TIME_ZONE), TIME_ZONE), invoiceAmountNum: invoice.amount, matchResult: match.result } : {}),
      ...(status === 'Closed' ? { invoiceExGstNum: invoicedExGst, invoiceVarianceNum: match.variance, invoiceVariancePct: match.pct, matchResult: match.result, closedDate: iso(closedAt), closedByRel: [author('mia')] } : {}),
      ...(status === 'Cancelled' ? { cancelReason: r.cancelReason } : {}),
      attachmentsArr: [],
      notifiedRel: told,
      notesCommentsArr: notes,
      createdDate: iso(r.askedAt - HOUR),
      createdByRel: [author(r.who)],
      updatedDate: iso(updatedAt),
      updatedByRel: [author(r.who)],
    });
    for (const q of r.quoteList) {
      set.add({
        documentId: q.id,
        systemHeader: header({ systemType: 'document', templateId: T.quote, summaryName: `${q.ref}: ${suppliers[q.supplier].name}`, at: new Date(r.askedAt - 2 * DAY + q.order * HOUR), by: people[r.who].documentId }),
        appTags: ['proc', 'quote'],
        quoteRef: q.ref,
        requestRel: [{ documentId: r.id, name: `${ref}: ${r.title}`, ref }],
        requestRef: ref,
        supplierRel: [suppliers[q.supplier].value],
        supplierName: suppliers[q.supplier].name,
        amountNum: q.amount,
        validUntilDate: iso(q.validUntil),
        leadTimeDaysNum: q.lead,
        notes: '',
        attachmentsArr: [],
        createdDate: iso(r.askedAt - 2 * DAY),
        createdByRel: [author(r.who)],
      });
      quotes.push(q);
    }
  };

  // A financial year of ordinary purchasing behind each cost centre: mostly closed, a few in flight.
  const background = [];
  const span = Math.max(20, Math.floor((NOW - fyStart) / DAY) - 6);
  for (const c of COST_CENTRES) {
    const buyers = PEOPLE.filter((p) => p.cc === c.key).map((p) => p.key);
    const count = c.key === 'pro' || c.key === 'fin' || c.key === 'exe' ? 2 : rand.int(4, 7);
    for (let i = 0; i < count; i++) {
      const [supplierKey, category] = rand.pick(BUYS[c.key]);
      const choices = ITEMS.filter(([s]) => s === supplierKey);
      const picked = [...new Set(Array.from({ length: rand.int(1, Math.min(3, choices.length)) }, () => rand.pick(choices)))];
      const lines = picked.map(([, , partNo, unit, cost]) => [partNo, unit === 'm' ? rand.int(4, 16) : cost > 2000 ? 1 : rand.int(1, cost > 300 ? 4 : 20)]);
      // Each one at most 6% of the budget: fewer of each until it fits.
      const total = () => lineTotals(lines.map(([p, q], k) => line(p, q, k)), GST_RATE).subtotal;
      while (total() > c.budget * 0.06 && lines.some(([, q]) => q > 1)) {
        const biggest = lines.reduce((best, l) => (items[l[0]].cost * l[1] > items[best[0]].cost * best[1] ? l : best));
        biggest[1] = Math.max(1, Math.floor(biggest[1] / 2));
      }
      const subtotal = total();
      const daysAgo = rand.int(8, span);
      const askedAt = NOW - daysAgo * DAY + rand.int(8, 16) * HOUR - 12 * HOUR;
      const inFlight = daysAgo < 30 && rand.chance(0.35);
      const status = inFlight ? rand.pick(['Approved', 'Ordered', 'Received']) : 'Closed';
      const needed = QUOTE_RULES.reduce((n, rule) => (subtotal > rule.fromAmount && rule.quotes > n ? rule.quotes : n), 0);
      const others = SUPPLIERS.filter(([k, , cat, approved, blocked]) => k !== supplierKey && cat === SUPPLIERS.find(([s]) => s === supplierKey)[2] && approved && !blocked).map(([k]) => k);
      const quoteRows = needed ? [[supplierKey, subtotal, 30, rand.int(2, 14)], ...others.slice(0, needed - 1).map((k) => [k, Math.round(subtotal * (1 + rand.int(3, 12) / 100)), 30, rand.int(3, 20)])] : [];
      background.push({
        key: `${c.key}-${i}`, who: rand.pick(buyers), cc: c.key, category, title: `${items[lines[0][0]].name}${lines.length > 1 ? ' and more' : ''}`, status, askedAt, background: true,
        lines, quotes: quoteRows, chosen: needed ? supplierKey : undefined, supplier: supplierKey,
        soleSupplierReason: needed > 1 && quoteRows.length < needed ? 'Only approved supplier for this range.' : undefined,
      });
    }
  }
  background.sort((a, b) => a.askedAt - b.askedAt);
  let refNo = 0;
  let quoteNo = 0;
  // Closed history first, so budgets stand where the story needs them before it is planned.
  for (const r of background) {
    const planned = plan(r);
    planned.refNo = ++refNo;
    planned.quoteList.forEach((q) => (q.ref = `${COUNTERS.quote.prefix}-${++quoteNo}`));
    write(planned);
    requests.push({ id: planned.id, cc: r.cc, status: r.status, subtotal: planned.subtotal, invoicedExGst: planned.invoicedExGst });
  }
  // Spending outside the requests (from the ledger), so each budget is where the story says.
  for (const c of COST_CENTRES) {
    const position = budgetPosition({ budget: c.budget, requests: ccRequests(c.key) });
    const base = c.remainingForLaptops !== undefined ? c.budget - c.remainingForLaptops - position.spent - position.committed : Math.max(0, c.budget * c.spent - position.spent);
    centres[c.key].doc.baseSpentNum = Math.round(base);
  }
  // This week's story, in the order it was asked for.
  const story = STORY.map((s) => ({ ...s, askedAt: NOW - s.asked * DAY - rand.int(1, 5) * HOUR })).sort((a, b) => a.askedAt - b.askedAt);
  for (const s of story) {
    const planned = plan(s);
    planned.refNo = ++refNo;
    planned.quoteList.forEach((q) => (q.ref = `${COUNTERS.quote.prefix}-${++quoteNo}`));
    write(planned);
    requests.push({ id: planned.id, cc: s.cc, status: s.status, subtotal: planned.subtotal, invoicedExGst: planned.invoicedExGst, story: planned });
  }
  // Each cost centre's figures, as the request PostSave rule keeps them.
  for (const c of COST_CENTRES) {
    const b = budgetPosition({ budget: c.budget, baseSpent: centres[c.key].doc.baseSpentNum, requests: ccRequests(c.key) });
    Object.assign(centres[c.key].doc, { spentNum: b.spent, committedNum: b.committed, pendingNum: b.pending, remainingNum: b.remaining });
  }

  // ------------------------------------------------------------------------------- counters
  const counts = { request: refNo, quote: quoteNo };
  for (const [key, c] of Object.entries(COUNTERS)) {
    set.add({ documentId: c.id, systemHeader: header({ systemType: 'document', templateId: T.counter, summaryName: `${c.prefix} counter`, at: seededAt, by: adminId }), [c.field]: counts[key] ?? 0 });
  }

  // ------------------------------------------------------------------------ templates and rules
  const components = templateComponents({ statuses, values });
  const ref = (key, name) => [{ documentId: RULESETS[key], name }];
  const client = (key, name) => ({ preRenderClientRuleRel: ref(key, name), onLoadClientRuleRel: ref(key, name), onFieldChangeClientRuleRel: ref(key, name), preSaveClientRuleRel: ref(key, name) });
  const template = (id, name, extra = {}) => set.template({ id, name, components: components[id], ...extra });
  const page = (id, name) => template(id, name, { hideCommandBar: true });
  page(T.overview, 'Purchasing overview');
  page(T.myRequests, 'My requests');
  page(T.approvals, 'My approvals');
  page(T.register, 'Purchase requests');
  page(T.orders, 'Orders');
  page(T.budgets, 'Budgets');
  template(T.request, 'Purchase request', {
    appTags: ['proc', 'request'], summaryNameRule: '{{{requestRef}}}: {{{title}}}',
    ...client('requestClient', 'Purchase Request - Client'), preSaveServerRuleRel: ref('requestServer', 'Purchase Request - PreSaveServer'), postSaveServerRuleRel: ref('requestPost', 'Purchase Request - PostSave'),
  });
  template(T.quote, 'Quote', { appTags: ['proc', 'quote'], summaryNameRule: '{{{quoteRef}}}: {{{supplierRel.0.name}}}', preSaveServerRuleRel: ref('quoteServer', 'Quote - PreSaveServer'), postSaveServerRuleRel: ref('quotePost', 'Quote - PostSave') });
  template(T.supplier, 'Supplier', { appTags: ['proc', 'supplier'], summaryNameRule: '{{{nameId}}}' });
  template(T.costCentre, 'Cost centre', { appTags: ['proc', 'costCentre'], summaryNameRule: '{{{nameId}}}' });
  template(T.item, 'Catalogue item', { appTags: ['proc', 'item'], summaryNameRule: '{{{nameId}}}' });
  template(T.tier, 'Delegation of authority', { appTags: ['proc', 'tier'], summaryNameRule: '{{{nameId}}}' });
  template(T.counter, 'Counter', { summaryNameRule: 'Counter' });
  for (const [kind, names] of Object.entries(LOOKUPS)) template(T[`lookup_${kind}`], names.name, { appTags: ['proc', kind], summaryNameRule: '{{{nameId}}}' });

  const linked = (templateId, name, events) => [{ documentId: templateId, name, eventNames: events }];
  const CLIENT_EVENTS = 'preRenderClient | onLoadClient | onFieldChangeClient | preSaveClient';
  const rs = (key, name, dsl, templateId, templateName, events) => set.ruleset({ id: RULESETS[key], name, dsl, group: 'proc', linked: linked(templateId, templateName, events) });
  rs('requestClient', 'Purchase Request - Client', rules.requestClientRules({ statuses }), T.request, 'Purchase request', CLIENT_EVENTS);
  rs('requestServer', 'Purchase Request - PreSaveServer', rules.requestServerRules({ statuses }), T.request, 'Purchase request', 'preSaveServer');
  rs('requestPost', 'Purchase Request - PostSave', rules.requestPostRules(), T.request, 'Purchase request', 'postSaveServer');
  rs('quoteServer', 'Quote - PreSaveServer', rules.quoteServerRules(), T.quote, 'Quote', 'preSaveServer');
  rs('quotePost', 'Quote - PostSave', rules.quotePostRules(), T.quote, 'Quote', 'postSaveServer');

  // ---------------------------------------------------------------------- platform documents
  if (platform) set.platformDocuments(componentRepos(appRoot));
  const accountTemplate = set.documents.find((d) => d.documentId === SYSTEM.account);
  if (accountTemplate?.components) accountTemplate.components.splice(1, 0, ...accountComponents());
  set.configuration({ defaultTemplate: T.overview, urlRoot });

  return {
    documents: set.finish(),
    password: DEMO_PASSWORD,
    people: PEOPLE.map((p) => ({ name: people[p.key].name, email: people[p.key].email, role: `${p.type}, ${centres[p.cc].name}` })),
    urls: {
      overview: `/form/${T.overview}`,
      myRequests: `/form/${T.myRequests}`,
      approvals: `/form/${T.approvals}`,
      orders: `/form/${T.orders}`,
      budgets: `/form/${T.budgets}`,
      newRequest: `/form/${T.request}`,
    },
    stats: { people: PEOPLE.length, requests: requests.length, quotes: quotes.length, company: COMPANY.length > 0 ? 1 : 0 },
    seedFacts: { people, centres, requests, statuses, values, suppliers, items, fy, LOOKUP_FIELDS },
  };
}

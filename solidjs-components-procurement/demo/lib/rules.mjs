// Procurement rulesets: purchase requests and quotes.
//
// The logic the elements also use is not rewritten here: each ruleset carries those functions' own
// source in `ruleset.lib` (functionsLib), so the browser and the server apply one implementation:
// - from shared's kit: line totals (money.ts), the approval chain (approval.ts), days (range.ts);
// - from packages/proc-kit: who approves by amount (approvals.ts), quotes (quotes.ts), the budget
//   position, invoice matching and the financial year (budget.ts).
// The validator (validatePurchase) runs in the browser's PreSave rule, which shows the reason, and in
// the PreSaveServer rule, which enforces it with what only the server can look up (the saved version,
// the quotes, the cost centre's budget, who approves).
//
// The scaffolding (shared helpers, the async-callback guard, status transitions against
// `lastStatus`) comes from solidjs-components-shared's platform.

import { COMMON_LIB, functionsLib, rulesetDsl } from '@solidjs-components/platform/rules';
import { approvalProblems, approvalStatus, mergeApprovalChain } from '../../../solidjs-components-shared/packages/kit/src/domain/approval.ts';
import { lineTotals } from '../../../solidjs-components-shared/packages/kit/src/domain/money.ts';
import { dayKey } from '../../../solidjs-components-shared/packages/kit/src/domain/range.ts';
import { purchaseApprovalSteps } from '../../packages/proc-kit/src/logic/approvals.ts';
import { budgetPosition, financialYear, invoiceMatch } from '../../packages/proc-kit/src/logic/budget.ts';
import { quoteProblems, quotesNeeded } from '../../packages/proc-kit/src/logic/quotes.ts';
import { TRANSITIONS } from './catalog.mjs';
import { GST_RATE, INVOICE_TOLERANCE, KEYS, QUOTE_RULES, TIME_ZONE } from './model.mjs';

const json = (value) => JSON.stringify(value);

/** What procurement rulesets carry besides the shared helpers. */
const PROC_LIB = `
    // Who is saving: from access keys on the server, from the account type in the browser (they match).
    whoFromKeys : function (ntf) {
      return {
        isProcurement: this.hasKey(ntf, ${json(KEYS.procurement)}),
        isFinance: this.hasKey(ntf, ${json(KEYS.finance)}),
        isExecutive: this.hasKey(ntf, ${json(KEYS.executive)}),
        isManager: this.hasKey(ntf, ${json(KEYS.manager)}),
        userId: ntf.userId
      };
    },
    whoFromAccount : function (ntf) {
      var type = (ntf.context.user || {}).accountType || '';
      var admin = type === 'Administrator';
      return {
        isProcurement: admin || type === 'Procurement',
        isFinance: admin || type === 'Finance',
        isExecutive: admin || type === 'Executive',
        isManager: admin || type === 'Executive' || type === 'Finance' || type === 'Manager',
        userId: ntf.userId
      };
    },
    has : function (list) { return !!(list && list.length); },
    zone : ${json(TIME_ZONE)},
    gst : ${json(GST_RATE)},
    quoteRules : ${json(QUOTE_RULES)},
    tolerance : ${json(INVOICE_TOLERANCE)},
    money : function (n) { return '$' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); },
    dayText : function (when) {
      var key = this.dayKey(when, this.zone);
      if (!key) return '';
      var d = new Date(key + 'T00:00:00Z');
      return d.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short' }) + ' ' + d.getUTCDate() + ' ' + d.toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'short' });
    },
    person : function (p) { return p && p.documentId ? { documentId: p.documentId, name: p.name } : null; },
    systemNote : function (ntf, text) {
      var notes = (ntf.document.notesCommentsArr || []).slice();
      notes.push({ dataId: 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), detail: text, createdBy: this.me(ntf), createdDate: new Date().toISOString(), comments: [], votes: [] });
      ntf.document.notesCommentsArr = notes;
    },
    tell : function (ntf, people) {
      var d = ntf.document;
      var told = (d.notifiedRel || []).slice();
      var fresh = [];
      (people || []).forEach(function (p) {
        if (!p || !p.documentId || told.some(function (t) { return t.documentId === p.documentId; })) return;
        told.push({ documentId: p.documentId, name: p.name });
        fresh.push(p);
      });
      d.notifiedRel = told;
      return fresh;
    },
    peekMove : function (ntf, field) {
      var from = ntf.document.lastStatus || '';
      var to = this.statusName(ntf.document[field]);
      return from !== to ? { from: from, to: to, at: new Date().toISOString() } : null;
    },
    series : function (steps, done) {
      var i = 0;
      var next = function () {
        if (i >= steps.length) { done(); return; }
        steps[i++](next);
      };
      next();
    },
    // What a request adds up to, from its lines.
    amounts : function (d) {
      var t = this.lineTotals(d.lineItemsArr, this.gst);
      return { subtotal: t.subtotal, gst: t.tax, total: t.total };
    },
    // What may not change once a request has been submitted without starting the approvals again.
    signature : function (d) {
      var lines = (d.lineItemsArr || []).map(function (l) { return [l.kind, l.description, Number(l.qty) || 0, Number(l.unitCost) || 0]; });
      return JSON.stringify([lines, (this.first(d.costCentreRel) || {}).documentId || '', (this.first(d.supplierRel) || {}).documentId || '']);
    }`;

/** The logic functions, as their own source (type-stripped by Node when this module loads). */
const LOGIC_LIB = functionsLib([
  lineTotals, dayKey, approvalStatus, approvalProblems, mergeApprovalChain, purchaseApprovalSteps, quotesNeeded, quoteProblems, budgetPosition, invoiceMatch, financialYear,
]);

/**
 * What makes a request invalid, checked the same way in the browser and on the server. `who` says
 * whether the person saving is in Procurement or Finance, an executive or a manager; `facts` holds
 * what the server looked up (quotes, the saved version); without it the browser checks what the
 * quote element wrote (how many valid quotes there are).
 */
const VALIDATE_LIB = `
    validatePurchase : function (d, who, facts) {
      var status = this.statusName(d.requestStatusRel);
      var from = d.lastStatus || '';
      var requester = this.first(d.requesterRel) || {};
      var mine = !!requester.documentId && requester.documentId === who.userId;
      var owner = (this.first(d.costCentreRel) || {}).ownerRel;
      var isOwner = !!(owner && owner[0] && owner[0].documentId === who.userId);
      facts = facts || {};
      if (!from && status !== 'Draft' && status !== 'Submitted') return 'A new request starts as Draft or Submitted.';
      if (!this.allowedMove(${json(TRANSITIONS.requestStatus)}, from, status)) {
        return 'A request can\\'t go from ' + from + ' to ' + status + (status === 'Approved' || status === 'Rejected' ? ': it is ' + status.toLowerCase() + ' through its approvals.' : '.');
      }
      var moved = !!from && from !== status;
      if (moved) {
        if ((status === 'Submitted' || (status === 'Draft' && from !== 'Cancelled')) && !(mine || who.isProcurement)) return 'Only ' + (requester.name || 'the requester') + ' or Procurement can ' + (status === 'Submitted' ? 'submit' : 'withdraw') + ' this request.';
        if (status === 'Ordered' && !who.isProcurement) return 'Procurement raises the order.';
        if (status === 'Received' && !(mine || isOwner || who.isProcurement)) return 'The requester, the cost centre manager or Procurement records the delivery.';
        if (status === 'Closed' && !who.isFinance) return 'Finance closes a request once the invoice is in.';
        if (status === 'Cancelled') {
          var early = from === 'Draft' || from === 'Submitted';
          if (!(early ? mine || who.isProcurement || who.isFinance : who.isProcurement || who.isFinance)) return early ? 'Only the requester, Procurement or Finance can cancel it.' : 'Once approved, only Procurement or Finance can cancel it.';
          if (!early && this.empty(d.cancelReason)) return 'Say why the request is cancelled.';
        }
      }
      if (!from && !mine && !(who.isProcurement || who.isFinance)) return 'You can only raise a request for yourself.';
      if (this.empty(d.title)) return 'Say what is being bought, in a few words.';
      if (!requester.documentId) return 'Choose who the request is for.';
      if (!this.has(d.costCentreRel)) return 'Choose the cost centre.';
      if (!this.has(d.categoryRel)) return 'Choose the category.';
      if (status === 'Draft' || status === 'Cancelled' || status === 'Rejected') return '';
      var lines = d.lineItemsArr || [];
      if (!lines.length) return 'Add what is being bought, line by line.';
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i] || {};
        if (this.empty(l.description)) return 'Describe every line.';
        if (!(Number(l.qty) > 0)) return 'Give "' + l.description + '" a quantity.';
        if (l.unitCost === null || l.unitCost === undefined || l.unitCost === '' || Number(l.unitCost) < 0) return 'Give "' + l.description + '" a unit price.';
      }
      var a = this.amounts(d);
      if (!(a.subtotal > 0)) return 'The request comes to nothing.';
      if (this.empty(d.neededByDate)) return 'Say when it is needed by.';
      var supplier = this.first(d.supplierRel);
      if (!supplier) return 'Choose the supplier (choosing a quote sets it).';
      if (supplier.blockedBool) return supplier.name + ' is blocked: choose another supplier.';
      // Quotes, checked when the request is submitted (and again on the server).
      if (status === 'Submitted' && (!from || from === 'Draft')) {
        if (facts.quotes) {
          var q = this.quoteProblems({ amount: a.subtotal, quotes: facts.quotes, chosenId: (this.first(d.chosenQuoteRel) || {}).documentId, soleSupplierReason: d.soleSupplierReason, notCheapestReason: d.notCheapestReason, rules: this.quoteRules, now: Date.now() });
          if (q.problems.length) return q.problems[0];
        } else if (typeof d.quotesValidNum === 'number') {
          var needed = this.quotesNeeded(a.subtotal, this.quoteRules);
          if (d.quotesValidNum < needed && this.empty(d.soleSupplierReason)) return (needed === 1 ? 'A written quote is' : needed + ' written quotes are') + ' needed for ' + this.money(a.subtotal) + ' (' + d.quotesValidNum + ' so far), or a reason there is only one supplier.';
          if (needed && !this.has(d.chosenQuoteRel)) return 'Choose the quote you are going with.';
        }
      }
      if (status === 'Ordered' || status === 'Received' || status === 'Closed') {
        if (!supplier.approvedBool) return supplier.name + ' is not an approved supplier yet: Procurement approves it before ordering.';
        if (this.empty(d.expectedDeliveryDate)) return 'Say when the order is expected.';
      }
      if (status === 'Closed') {
        if (this.empty(d.invoiceNumber) || this.empty(d.invoiceDate) || !(Number(d.invoiceAmountNum) > 0)) return 'Enter the invoice: its number, date and amount (inc GST).';
        var m = this.invoiceMatch({ approved: a.total, invoiced: Number(d.invoiceAmountNum), tolerancePct: this.tolerance.tolerancePct, toleranceAmount: this.tolerance.toleranceAmount });
        if (m.result === 'Over tolerance' && this.empty(d.varianceReason)) return 'The invoice is ' + this.money(m.variance) + ' (' + m.pct + '%) over the approved ' + this.money(a.total) + ': say why before closing.';
      }
      return '';
    }`;

/** A procurement ruleset's DSL: the shared helpers, the procurement ones, the logic and the validators. */
const ruleset = (name, rules) => rulesetDsl(name, { lib: [COMMON_LIB, PROC_LIB, LOGIC_LIB, VALIDATE_LIB], rules });

const CLIENT_INIT = `
  ruleInitialise : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      ntf.isSetup = ntf.context.eventName === 'PreRender' || ntf.context.eventName === 'OnLoad';
      ntf.lib = ntf.ruleset.lib;
      ntf.who = ntf.lib.whoFromAccount(ntf);
      ntf.changed = ntf.context.fieldChanged || '';
      var user = ntf.context.user || {};
      ntf.meValue = { documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '', email: user.email || null, accountType: user.accountType || null,
        jobTitle: user.jobTitle || null, costCentreRel: user.costCentreRel || null, managerRel: user.managerRel || null };
    }
  },`;

const SERVER_INIT = `
  ruleInitialise : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      ntf.lib = ntf.ruleset.lib;
      ntf.now = Date.now();
      ntf.who = ntf.lib.whoFromKeys(ntf);
      ntf.lib.authorship(ntf);
    }
  },`;

const onChange = (fields) => `function (ntf) { return ntf.isSetup || ${json(fields)}.indexOf(ntf.changed) > -1; }`;

// ------------------------------------------------------------------------------------------------
// Purchase request
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function requestClientRules({ statuses }) {
  return ruleset(
    'Purchase Request - Client',
    `${CLIENT_INIT}

  rulePreSave : {
    ruleCondition : function (ntf) { return ntf.context.eventName === 'PreSave'; },
    ruleAction : function (ntf) {
      var message = ntf.lib.validatePurchase(ntf.document, ntf.who, null);
      if (!message) return;
      ntf.scope.showNotification(message, 'error');
      ntf.errorMessage = '(no-display)';
    }
  },

  // A new request: yours, on your cost centre, a draft, needed in two weeks.
  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      if (!ntf.lib.has(d.requesterRel)) d.requesterRel = [ntf.meValue];
      if (!ntf.lib.has(d.requestStatusRel)) d.requestStatusRel = [${json(statuses.requestStatus.Draft)}];
      if (!ntf.lib.has(d.costCentreRel) && ntf.lib.has(ntf.meValue.costCentreRel)) d.costCentreRel = ntf.meValue.costCentreRel;
      if (!d.neededByDate) { var by = new Date(Date.now() + 14 * 86400000); by.setHours(0, 0, 0, 0); d.neededByDate = by.toISOString(); }
    }
  },

  // What the form asks for follows where the request is: the order, the delivery and the invoice
  // appear in turn; what was approved can't be changed.
  ruleView : {
    ruleCondition : ${onChange(['requestStatusRel', 'invoiceAmountNum', 'lineItemsArr'])},
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var status = lib.statusName(d.requestStatusRel) || 'Draft';
      var from = d.lastStatus || '';
      var order = ['Draft', 'Submitted', 'Approved', 'Ordered', 'Received', 'Closed'];
      var at = order.indexOf(status);
      var editing = status === 'Draft' || status === 'Rejected' || (!from && status === 'Submitted');
      ['title', 'costCentreRel', 'categoryRel', 'supplierRel', 'lineItemsArr', 'neededByDate', 'justification', 'soleSupplierReason', 'notCheapestReason', 'quotes'].forEach(function (name) { ntf.scope.enableField(name, editing); });
      ntf.scope.enableField('requesterRel', !from && (ntf.who.isProcurement || ntf.who.isFinance));
      ntf.scope.showField('orderPanel', at >= 2 || from === 'Ordered');
      ntf.scope.mandateField('expectedDeliveryDate', status === 'Ordered');
      ntf.scope.showField('receiptPanel', at >= 3);
      ntf.scope.showField('invoicePanel', at >= 4);
      ['invoiceNumber', 'invoiceDate', 'invoiceAmountNum'].forEach(function (name) { ntf.scope.mandateField(name, status === 'Closed'); });
      var over = false;
      if (Number(d.invoiceAmountNum) > 0) {
        var m = lib.invoiceMatch({ approved: lib.amounts(d).total, invoiced: Number(d.invoiceAmountNum), tolerancePct: lib.tolerance.tolerancePct, toleranceAmount: lib.tolerance.toleranceAmount });
        over = m.result === 'Over tolerance';
        if (ntf.changed === 'invoiceAmountNum') d.matchResult = m.result;
      } else if (ntf.changed === 'invoiceAmountNum') d.matchResult = '';
      ntf.scope.showField('varianceReason', over || !lib.empty(d.varianceReason));
      ntf.scope.mandateField('varianceReason', over && status === 'Closed');
      ntf.scope.showField('cancelReason', status === 'Cancelled');
    }
  }`,
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function requestServerRules({ statuses }) {
  return ruleset(
    'Purchase Request - PreSaveServer',
    `${SERVER_INIT}

  // What the request adds up to and where it stands, kept on the record for lists and the rules.
  ruleDerive : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var a = lib.amounts(d);
      d.subtotalNum = a.subtotal;
      d.gstNum = a.gst;
      d.totalNum = a.total;
      var supplier = lib.first(d.supplierRel) || {};
      d.supplierName = supplier.name || '';
      ntf.move = lib.peekMove(ntf, 'requestStatusRel');
      if (ntf.move && ntf.move.to === 'Submitted') d.submittedDate = ntf.move.at;
      if (!d.fyKey || (ntf.move && ntf.move.to === 'Submitted')) d.fyKey = lib.financialYear(lib.dayKey(d.submittedDate || ntf.now, lib.zone));
      ntf.facts = {};
    }
  },

  // What only the server can know: the saved version, the quotes, the cost centre and its year so
  // far, its manager's manager, the delegations, and who approves overrides and sole suppliers.
  ruleGather : {
    ruleCondition : function (ntf) { return ntf.lib.has(ntf.document.costCentreRel); },
    ruleAction : function (ntf, callback) {
      var lib = ntf.lib;
      var d = ntf.document;
      var f = ntf.facts;
      var cc = lib.first(d.costCentreRel);
      var accounts = function (filter) { return { size: 100, sort: [{ 'systemHeader.summaryName.lcase': 'asc' }], query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }].concat(filter), must_not: [{ term: { inactiveBool: true } }] } } }; };
      lib.series([
        function (next) { lib.byId(ntf, d.documentId, function (err, saved) { f.previous = saved || null; next(); }); },
        function (next) {
          var query = { size: 100, query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: 'proc' } }, { term: { appTags: 'quote' } }, { term: { 'requestRel.documentId': d.documentId } }] } } };
          lib.search(ntf, query, function (err, list) {
            f.quotes = (list || []).map(function (q) { return { documentId: q.documentId, supplier: (lib.first(q.supplierRel) || {}).name || 'the supplier', amount: q.amountNum, validUntil: q.validUntilDate || null }; });
            next();
          });
        },
        function (next) { lib.byId(ntf, cc.documentId, function (err, doc) { f.costCentre = doc || null; next(); }); },
        function (next) {
          var query = { size: 2000, query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: 'proc' } }, { term: { appTags: 'request' } }, { term: { 'costCentreRel.documentId': cc.documentId } }, { term: { fyKey: d.fyKey } }] } } };
          lib.search(ntf, query, function (err, list) {
            f.ccRequests = (list || []).map(function (r) { return { documentId: r.documentId, status: lib.statusName(r.requestStatusRel), amount: r.subtotalNum, invoiced: r.invoiceExGstNum === undefined ? null : r.invoiceExGstNum }; });
            next();
          });
        },
        function (next) {
          var owner = lib.first((f.costCentre && f.costCentre.ownerRel) || cc.ownerRel);
          f.owner = lib.person(owner);
          if (!owner) { next(); return; }
          lib.byId(ntf, owner.documentId, function (err, account) { f.ownerManager = account ? lib.person(lib.first(account.managerRel)) : null; next(); });
        },
        function (next) {
          var query = { size: 20, sort: [{ fromAmountNum: 'asc' }], query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: 'proc' } }, { term: { appTags: 'tier' } }], must_not: [{ term: { inactiveBool: true } }] } } };
          lib.search(ntf, query, function (err, list) {
            f.tiers = (list || []).map(function (t) { return { id: t.tierKey || t.documentId, label: t.nameId, fromAmount: Number(t.fromAmountNum) || 0, rule: t.rule || 'people', approvers: (t.approversRel || []).map(lib.person) }; });
            next();
          });
        },
        function (next) { lib.search(ntf, accounts([{ term: { overrideApproverBool: true } }]), function (err, list) { f.finance = (list || []).map(function (a) { return { documentId: a.documentId, name: a.systemHeader.summaryName }; }); next(); }); },
        function (next) { lib.search(ntf, accounts([{ terms: { accountType: ['Procurement', 'Administrator'] } }]), function (err, list) { f.procurement = (list || []).map(function (a) { return { documentId: a.documentId, name: a.systemHeader.summaryName }; }); next(); }); }
      ], function () {
        var budget = f.costCentre ? lib.budgetPosition({ budget: f.costCentre.budgetNum, baseSpent: f.costCentre.baseSpentNum, requests: f.ccRequests || [], exclude: d.documentId, amount: d.subtotalNum }) : null;
        f.budget = budget;
        if (budget) {
          d.budgetRemainingNum = budget.remaining;
          d.overBudgetBool = budget.overBy > 0;
          d.overBudgetByNum = budget.overBy > 0 ? budget.overBy : null;
        }
        var q = lib.quoteProblems({ amount: d.subtotalNum, quotes: f.quotes || [], chosenId: (lib.first(d.chosenQuoteRel) || {}).documentId, soleSupplierReason: d.soleSupplierReason, notCheapestReason: d.notCheapestReason, rules: lib.quoteRules, now: ntf.now });
        d.quotesNum = (f.quotes || []).length;
        d.quotesValidNum = q.valid.length;
        d.quotesNeededNum = q.needed;
        f.quoteFacts = q;
        callback();
      });
    }
  },

  ruleValidate : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var f = ntf.facts;
      var message = ntf.lib.validatePurchase(d, ntf.who, f);
      // What was submitted (lines, cost centre, supplier) can't change once approved.
      if (!message && f.previous) {
        var was = ntf.lib.statusName(f.previous.requestStatusRel);
        f.changed = ntf.lib.signature(f.previous) !== ntf.lib.signature(d);
        if (f.changed && ['Approved', 'Ordered', 'Received', 'Closed'].indexOf(was) > -1) message = 'An approved request can\\'t change what is bought or from whom: cancel it and raise a new one.';
      }
      if (message) ntf.errorMessage = message;
    }
  },

  // The approvals while the request is submitted: the steps its amount, quotes and budget need, the
  // decisions made since the saved version checked (by whom, in turn), and the status they come to.
  // Changing a submitted request's lines, cost centre or supplier starts the approvals again.
  ruleApproval : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var f = ntf.facts;
      var status = lib.statusName(d.requestStatusRel);
      var before = f.previous && lib.statusName(f.previous.requestStatusRel) === 'Submitted' ? f.previous.approvalChain : null;
      if (status !== 'Submitted') {
        // A draft has no approvals yet; a decided request keeps its chain as it was decided.
        if (status === 'Draft') d.approvalChain = { steps: [] };
        else if (f.previous && f.previous.approvalChain) d.approvalChain = f.previous.approvalChain;
        var kept = lib.approvalStatus(d.approvalChain);
        d.approvalState = kept.state;
        d.nextApproverIds = [];
        d.nextApproverRel = [];
        return;
      }
      var sent = d.approvalChain || { steps: [] };
      if (before && f.changed) {
        sent = { steps: [] };
        before = null;
        lib.systemNote(ntf, 'The request changed (' + lib.money(d.subtotalNum) + ' ex GST): the approvals start again.');
      }
      if (before) {
        var problems = lib.approvalProblems(before, sent, ntf.userId, { commentOnReject: true });
        if (problems.length) { ntf.errorMessage = problems[0]; return; }
      }
      // The saved chain, with only this save's decision and delegation taken from what was sent.
      var nowIso = new Date(ntf.now).toISOString();
      var base = JSON.parse(JSON.stringify(before || { steps: [] }));
      var decided = [];
      (sent.steps || []).forEach(function (s) {
        var step = (base.steps || []).filter(function (x) { return x.id === s.id; })[0];
        if (!step || step.decision) return;
        if (s.decision) {
          step.decision = s.decision;
          step.comment = s.comment || '';
          step.decidedBy = lib.me(ntf);
          step.decidedAt = nowIso;
          decided.push(step);
        }
        var was = (step.delegate && step.delegate.documentId) || '';
        var now = (s.delegate && s.delegate.documentId) || '';
        if (was !== now) {
          step.delegate = s.delegate ? lib.person(s.delegate) : null;
          step.delegatedBy = s.delegate ? lib.me(ntf) : null;
          step.delegatedAt = s.delegate ? nowIso : null;
          if (s.delegate) lib.systemNote(ntf, lib.me(ntf).name + ' handed the ' + step.label + ' step to ' + s.delegate.name + '.');
        }
      });
      var reasons = [];
      var q = f.quoteFacts;
      if (q && q.shortBy && !lib.empty(d.soleSupplierReason)) reasons.push('Sole supplier: ' + d.soleSupplierReason);
      var supplier = lib.first(d.supplierRel) || {};
      if (supplier.documentId && !supplier.approvedBool) reasons.push(supplier.name + ' is not an approved supplier yet.');
      var steps = lib.purchaseApprovalSteps({
        requester: lib.person(lib.first(d.requesterRel)), owner: f.owner, ownerManager: f.ownerManager, amount: d.subtotalNum, tiers: f.tiers || [],
        finance: f.finance || [], procurement: f.procurement || [], procurementReasons: reasons,
        overBudget: f.budget && f.budget.overBy > 0 ? { by: f.budget.overBy, remaining: f.budget.remaining, costCentre: (lib.first(d.costCentreRel) || {}).name } : null
      });
      var chain = lib.mergeApprovalChain(steps, base);
      d.approvalChain = chain;
      var state = lib.approvalStatus(chain);
      d.approvalState = state.state;
      d.nextApproverIds = state.waitingOn.map(function (p) { return p.documentId; });
      d.nextApproverRel = state.waitingOn.map(lib.person);
      if (state.state === 'approved') { d.requestStatusRel = [${json(statuses.requestStatus.Approved)}]; d.approvedDate = nowIso; }
      if (state.state === 'rejected') d.requestStatusRel = [${json(statuses.requestStatus.Rejected)}];
      ntf.decided = decided;
      ntf.chainState = state;
      ntf.newWaiting = !before || JSON.stringify(lib.approvalStatus(before).waitingOn.map(function (p) { return p.documentId; })) !== JSON.stringify(d.nextApproverIds);
    }
  },

  // The order, the delivery and the invoice, as the request moves on.
  ruleOrder : {
    ruleCondition : function (ntf) { return !ntf.errorMessage && !!ntf.move; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var to = ntf.move.to;
      if (to === 'Ordered') {
        d.poNumber = 'PO-' + String(d.requestRef || '').replace(/^\\D+/, '');
        d.orderedDate = ntf.move.at;
        d.orderedByRel = [lib.me(ntf)];
      }
      if (to === 'Received') {
        d.receivedDate = ntf.move.at;
        d.receivedByRel = [lib.me(ntf)];
      }
      if (to === 'Closed') {
        var m = lib.invoiceMatch({ approved: d.totalNum, invoiced: Number(d.invoiceAmountNum), tolerancePct: lib.tolerance.tolerancePct, toleranceAmount: lib.tolerance.toleranceAmount });
        d.invoiceExGstNum = Math.round((Number(d.invoiceAmountNum) / (1 + lib.gst)) * 100) / 100;
        d.invoiceVarianceNum = m.variance;
        d.invoiceVariancePct = m.pct;
        d.matchResult = m.result;
        d.closedDate = ntf.move.at;
        d.closedByRel = [lib.me(ntf)];
      }
      if (to === 'Draft') d.submittedDate = null;
    }
  },

  // The activity: who was asked, what was decided, and each step after.
  ruleNotes : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var status = lib.statusName(d.requestStatusRel);
      var requester = lib.person(lib.first(d.requesterRel));
      (ntf.decided || []).forEach(function (step) {
        lib.systemNote(ntf, '**' + (step.decision === 'approved' ? 'Approved' : 'Rejected') + '** by ' + step.decidedBy.name + ' (' + step.label + ')' + (step.comment ? ': ' + step.comment : '.'));
      });
      var procurement = (ntf.facts.procurement || []);
      if (status === 'Approved' && d.lastStatus !== 'Approved') {
        var fresh = lib.tell(ntf, [requester].concat(procurement));
        lib.systemNote(ntf, '**Approved** for ' + lib.money(d.subtotalNum) + ' ex GST: ready to order.' + (fresh.length ? ' Told ' + fresh.map(function (p) { return p.name; }).join(', ') + '.' : ''));
      } else if (status === 'Rejected' && d.lastStatus !== 'Rejected') {
        lib.tell(ntf, [requester]);
        lib.systemNote(ntf, '**Rejected.** ' + (requester ? requester.name + ' has been told.' : ''));
      } else if (status === 'Submitted' && ntf.newWaiting && ntf.chainState && ntf.chainState.current > -1) {
        var step = d.approvalChain.steps[ntf.chainState.current];
        var told = lib.tell(ntf, ntf.chainState.waitingOn);
        var who = ntf.chainState.waitingOn.map(function (p) { return p.name; }).join(' or ') || 'an approver';
        lib.systemNote(ntf, (d.lastStatus === 'Submitted' ? 'Now waiting for ' : 'Submitted for ' + lib.money(d.subtotalNum) + ' ex GST. Waiting for ') + who + ' (' + step.label + ')' + (step.reason ? ': ' + step.reason : '.') + (told.length ? ' Told ' + told.map(function (p) { return p.name; }).join(', ') + '.' : ''));
      } else if (ntf.move && ntf.move.to === 'Ordered') {
        lib.tell(ntf, [requester]);
        lib.systemNote(ntf, '**Ordered** from ' + d.supplierName + ': ' + d.poNumber + ', expected ' + lib.dayText(d.expectedDeliveryDate) + '.');
      } else if (ntf.move && ntf.move.to === 'Received') {
        lib.systemNote(ntf, '**Received** by ' + lib.me(ntf).name + (d.receiptNotes ? ': ' + d.receiptNotes : '.'));
      } else if (ntf.move && ntf.move.to === 'Closed') {
        lib.systemNote(ntf, '**Closed.** Invoice ' + d.invoiceNumber + ' for ' + lib.money(d.invoiceAmountNum) + ' inc GST: ' + d.matchResult.toLowerCase() + (d.invoiceVarianceNum ? ' (' + (d.invoiceVarianceNum > 0 ? '+' : '') + lib.money(d.invoiceVarianceNum) + ')' : '') + (d.varianceReason ? '. ' + d.varianceReason : '.'));
      } else if (ntf.move && ntf.move.to === 'Cancelled') {
        lib.systemNote(ntf, '**Cancelled** by ' + lib.me(ntf).name + (d.cancelReason ? ': ' + d.cancelReason : '.'));
      } else if (ntf.move && ntf.move.to === 'Draft' && ntf.move.from === 'Submitted') {
        lib.systemNote(ntf, 'Withdrawn to draft by ' + lib.me(ntf).name + '.');
      }
    }
  },
  ruleTransition : {
    ruleCondition : true,
    ruleAction : function (ntf) { ntf.lib.transition(ntf, 'requestStatusRel'); }
  }`,
  );
}

/** PostSave: the cost centre's year so far, recounted from its requests. */
export function requestPostRules() {
  return ruleset(
    'Purchase Request - PostSave',
    `
  ruleBudget : {
    ruleCondition : function (ntf) { return ntf.ruleset.lib.has(ntf.document.costCentreRel) && !!ntf.document.fyKey; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var cc = lib.first(d.costCentreRel);
      var query = { size: 2000, query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: 'proc' } }, { term: { appTags: 'request' } }, { term: { 'costCentreRel.documentId': cc.documentId } }, { term: { fyKey: d.fyKey } }] } } };
      lib.search(ntf, query, function (err, found) {
        // Search may not have this save yet: use the saved request itself.
        var list = (found || []).filter(function (r) { return r.documentId !== d.documentId; }).concat([d]).map(function (r) {
          return { documentId: r.documentId, status: lib.statusName(r.requestStatusRel), amount: r.subtotalNum, invoiced: r.invoiceExGstNum === undefined ? null : r.invoiceExGstNum };
        });
        lib.byId(ntf, cc.documentId, function (err2, centre) {
          if (!centre) { callback(); return; }
          var b = lib.budgetPosition({ budget: centre.budgetNum, baseSpent: centre.baseSpentNum, requests: list });
          lib.update(ntf, cc.documentId, { spentNum: b.spent, committedNum: b.committed, pendingNum: b.pending, remainingNum: b.remaining }, function () { callback(); });
        });
      });
    }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Quote
// ------------------------------------------------------------------------------------------------

export function quoteServerRules() {
  return ruleset(
    'Quote - PreSaveServer',
    `${SERVER_INIT}

  ruleValidate : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var supplier = lib.first(d.supplierRel);
      var request = lib.first(d.requestRel) || {};
      d.requestRef = request.ref || '';
      d.supplierName = supplier ? supplier.name : '';
      if (!request.documentId) ntf.errorMessage = 'A quote belongs to a purchase request.';
      else if (!supplier) ntf.errorMessage = 'Choose the supplier.';
      else if (supplier.blockedBool) ntf.errorMessage = supplier.name + ' is blocked: its quotes can\\'t be used.';
      else if (!(Number(d.amountNum) > 0)) ntf.errorMessage = 'Enter the quoted amount, ex GST.';
      else if (d.validUntilDate && Date.parse(d.validUntilDate) < ntf.now - 30 * 86400000) ntf.errorMessage = 'This quote expired more than a month ago: ask for a new one.';
    }
  }`,
  );
}

/** PostSave: the request counts its quotes (for the lists). */
export function quotePostRules() {
  return ruleset(
    'Quote - PostSave',
    `
  ruleCount : {
    ruleCondition : function (ntf) { return ntf.ruleset.lib.has(ntf.document.requestRel); },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var request = lib.first(d.requestRel);
      var query = { size: 100, query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: 'proc' } }, { term: { appTags: 'quote' } }, { term: { 'requestRel.documentId': request.documentId } }] } } };
      lib.search(ntf, query, function (err, found) {
        var list = (found || []).filter(function (q) { return q.documentId !== d.documentId; }).concat([d]);
        var cheapest = list.reduce(function (best, q) { return !best || Number(q.amountNum) < Number(best.amountNum) ? q : best; }, null);
        lib.update(ntf, request.documentId, { quotesNum: list.length, cheapestQuoteNum: cheapest ? Number(cheapest.amountNum) : null }, function () { callback(); });
      });
    }
  }`,
  );
}

/** For tests: the validator library alone. */
export const VALIDATORS = { PROC_LIB, LOGIC_LIB, VALIDATE_LIB };

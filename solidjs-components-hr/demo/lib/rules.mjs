// HR rulesets: leave requests, certificates, the certificate expiry check and onboarding.
//
// The logic the elements also use is not rewritten here: each ruleset carries those functions' own
// source in `ruleset.lib` (functionsLib), so the browser and the server apply one implementation:
// - from shared's kit: working days and day keys (range.ts), the approval chain (approval.ts) and the
//   checklist outcome (checklist.ts);
// - from packages/hr-kit: leave balances, minimum staffing, who approves (leave.ts), certificate
//   expiry and what someone still lacks (certs.ts).
// The validators (validateLeave…) run in the browser's PreSave rule, which shows the reason, and in
// the PreSaveServer rule, which enforces it with what only the server can look up (the saved
// version, balances, the team's leave).
//
// The scaffolding (shared helpers, the async-callback guard, status transitions against
// `lastStatus`, the client PreSave rule) comes from solidjs-components-shared's platform.

import { clientPreSave, COMMON_LIB, functionsLib, rulesetDsl } from '@solidjs-components/platform/rules';
import { approvalProblems, approvalStatus, canDecide, mergeApprovalChain } from '../../../solidjs-components-shared/packages/kit/src/domain/approval.ts';
import { checklistOutcome } from '../../../solidjs-components-shared/packages/kit/src/domain/checklist.ts';
import { dayKey, dayStart, workingDays } from '../../../solidjs-components-shared/packages/kit/src/domain/range.ts';
import { certState, expiryFromIssue, missingCertificates } from '../../packages/hr-kit/src/logic/certs.ts';
import { leaveApprovalSteps, leaveBalance, leavePeriodText, staffingBreaches } from '../../packages/hr-kit/src/logic/leave.ts';
import { HOLIDAYS, TRANSITIONS } from './catalog.mjs';
import { EXPIRY_WARN_DAYS, KEYS, OPENING_FIELDS, TIME_ZONE } from './model.mjs';

const json = (value) => JSON.stringify(value);

/** What HR rulesets carry besides the shared helpers. */
const HR_LIB = `
    // Who is saving: from access keys on the server, from the account type in the browser (they match).
    whoFromKeys : function (ntf) {
      return {
        isHr: this.hasKey(ntf, ${json(KEYS.hr)}),
        isManager: this.hasKey(ntf, ${json(KEYS.manager)}),
        isExecutive: this.hasKey(ntf, ${json(KEYS.executive)}),
        userId: ntf.userId
      };
    },
    whoFromAccount : function (ntf) {
      var type = (ntf.context.user || {}).accountType || '';
      var admin = type === 'Administrator';
      return {
        isHr: admin || type === 'People & Culture',
        isManager: admin || type === 'Executive' || type === 'Manager',
        isExecutive: admin || type === 'Executive',
        userId: ntf.userId
      };
    },
    has : function (list) { return !!(list && list.length); },
    zone : ${json(TIME_ZONE)},
    holidays : ${json(HOLIDAYS)},
    // A day key as people read it: "Tue 8 Dec".
    dayText : function (key) {
      if (!key) return '';
      var d = new Date(key + 'T00:00:00Z');
      return d.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short' }) + ' ' + d.getUTCDate() + ' ' + d.toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'short' });
    },
    rangeText : function (first, last) { return first === last ? this.dayText(first) : this.dayText(first) + ' – ' + this.dayText(last); },
    daysText : function (n) { return (Math.round(n * 10) / 10) + (n === 1 ? ' day' : ' days'); },
    person : function (p) { return p && p.documentId ? { documentId: p.documentId, name: p.name } : null; },
    // A note in the record's activity (solid-comments), written by the person whose save caused it.
    systemNote : function (ntf, text) {
      var notes = (ntf.document.notesCommentsArr || []).slice();
      notes.push({ dataId: 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), detail: text, createdBy: this.me(ntf), createdDate: new Date().toISOString(), comments: [], votes: [] });
      ntf.document.notesCommentsArr = notes;
    },
    // Adds people to who has been told, once each; returns those not told before.
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
    // The save's status move, without recording it: the validators compare against lastStatus, so
    // lib.transition (which moves lastStatus on) runs only after them, in ruleTransition.
    peekMove : function (ntf, field) {
      var from = ntf.document.lastStatus || '';
      var to = this.statusName(ntf.document[field]);
      return from !== to ? { from: from, to: to, at: new Date().toISOString() } : null;
    },
    // Runs async steps one after another: each gets a "next" to call.
    series : function (steps, done) {
      var i = 0;
      var next = function () {
        if (i >= steps.length) { done(); return; }
        steps[i++](next);
      };
      next();
    }`;

/** The logic functions, as their own source (type-stripped by Node when this module loads). */
const LOGIC_LIB = functionsLib([
  dayKey, dayStart, workingDays, approvalStatus, canDecide, approvalProblems, mergeApprovalChain, checklistOutcome,
  leaveBalance, staffingBreaches, leaveApprovalSteps, leavePeriodText, certState, expiryFromIssue, missingCertificates,
]);

/**
 * What makes a record invalid, checked the same way in the browser and on the server. `who` says
 * whether the person saving is People & Culture, a manager or an executive; `facts` holds what the
 * server looked up (the browser has what the leave balance element wrote).
 * Each returns a message, or '' when the record is fine.
 */
const VALIDATE_LIB = `
    // What a leave request's fields add up to: its days, type rules and who it is for.
    leaveFacts : function (d) {
      var type = this.first(d.leaveTypeRel) || {};
      var employee = this.first(d.employeeRel) || {};
      var first = this.dayKey(d.startDate, this.zone);
      var last = this.dayKey(d.endDate, this.zone);
      var count = this.workingDays({ first: first, last: last, holidays: this.holidays, halfFirst: d.startHalfBool, halfLast: d.endHalfBool });
      return { type: type, employee: employee, first: first, last: last, days: count.days, dates: count.dates, count: count };
    },
    validateLeave : function (d, who, facts) {
      var status = this.statusName(d.leaveStatusRel);
      var from = d.lastStatus || '';
      var f = this.leaveFacts(d);
      var mine = !!f.employee.documentId && f.employee.documentId === who.userId;
      if (!from && status !== 'Pending') return 'A new leave request starts as Pending.';
      if (!this.allowedMove(${json(TRANSITIONS.leaveStatus)}, from, status)) return 'A leave request can\\'t go from ' + from + ' to ' + status + (status === 'Approved' || status === 'Rejected' ? ': it is ' + status.toLowerCase() + ' through its approvals.' : '.');
      if (!f.employee.documentId) return 'Choose who the leave is for.';
      if (!from && !mine && !(who.isHr || who.isManager)) return 'You can only request leave for yourself.';
      if (status === 'Cancelled' && from && from !== 'Cancelled') {
        var today = this.dayKey(Date.now(), this.zone);
        if (!(who.isHr || who.isManager)) {
          if (!mine) return 'Only the person on leave, their manager or People & Culture can cancel it.';
          if (from === 'Approved' && f.first && f.first <= today) return 'This leave has started: ask your manager or People & Culture to cancel it.';
        }
        if (from === 'Approved' && this.empty(d.cancelReason)) return 'Say why the approved leave is cancelled.';
        return '';
      }
      if (status === 'Cancelled' || status === 'Rejected') return '';
      if (!f.type.documentId) return 'Choose the type of leave.';
      if (!f.first || !f.last) return 'Choose the first and last day.';
      if (f.last < f.first) return 'The last day can\\'t be before the first.';
      if (!(f.days > 0)) return 'These days are all weekends or public holidays: there is no leave to take.';
      if (f.type.maxDaysNum && f.days > f.type.maxDaysNum) return f.type.name + ' is up to ' + this.daysText(f.type.maxDaysNum) + ' at a time.';
      if (f.type.needsReasonBool && this.empty(d.reason)) return 'Say what the ' + String(f.type.name).toLowerCase() + ' is for.';
      if (f.type.evidenceAfterDaysNum && f.days > f.type.evidenceAfterDaysNum && !this.has(d.evidenceArr)) return 'Attach a medical certificate or statutory declaration: it is needed for more than ' + this.daysText(f.type.evidenceAfterDaysNum) + ' of ' + String(f.type.name).toLowerCase() + '.';
      if (status !== 'Pending') return '';
      facts = facts || {};
      if (facts.overlaps && facts.overlaps.length) return (mine ? 'You already have' : f.employee.name + ' already has') + ' leave on those days (' + facts.overlaps.slice(0, 2).join('; ') + ').';
      var available = facts.available !== undefined ? facts.available : (typeof d.availableDaysNum === 'number' ? d.availableDaysNum : null);
      if (f.type.balanceKey && available !== null && available !== undefined && f.days > available + 0.001) {
        return 'That is ' + this.daysText(f.days) + ' of ' + String(f.type.name).toLowerCase() + ', but ' + (mine ? 'you' : f.employee.name) + ' will have ' + this.daysText(Math.max(0, Math.round(available * 10) / 10)) + ' on ' + this.dayText(f.first) + '.';
      }
      return '';
    },

    validateCertificate : function (d, who) {
      var person = this.first(d.personRel) || {};
      var type = this.first(d.certTypeRel) || {};
      if (!person.documentId) return 'Choose whose certificate it is.';
      if (person.documentId !== who.userId && !(who.isHr || who.isManager)) return 'You can only add your own certificates.';
      if (!type.documentId) return 'Choose the type of certificate.';
      if (this.empty(d.issuedDate)) return 'Enter when it was issued.';
      if (Date.parse(d.issuedDate) > Date.now() + 86400000) return 'It can\\'t have been issued in the future.';
      if (type.validityMonthsNum && this.empty(d.expiryDate)) return type.name + ' expires: enter its expiry date.';
      if (!this.empty(d.expiryDate) && Date.parse(d.expiryDate) <= Date.parse(d.issuedDate)) return 'It must expire after it was issued.';
      return '';
    },

    validateOnboarding : function (d, who, facts) {
      var status = this.statusName(d.onboardingStatusRel);
      var from = d.lastStatus || '';
      if (!from && status !== 'Not started' && status !== 'In progress') return 'A new onboarding starts as Not started or In progress.';
      if (!this.allowedMove(${json(TRANSITIONS.onboardingStatus)}, from, status)) return 'Onboarding can\\'t go from ' + from + ' to ' + status + '.';
      if (from && from !== status && !(who.isHr || who.isManager)) return 'People & Culture or the manager moves an onboarding on.';
      if (!this.has(d.personRel)) return 'Choose the new starter.';
      if (!this.has(d.positionRel)) return 'Choose their position: it sets the checklist and the certificates they need.';
      if (this.empty(d.startDate)) return 'Enter their first day.';
      if (status === 'Completed') {
        var o = this.checklistOutcome(d.tasks, { commentOnFail: true, failLabel: 'Blocked' });
        if (!o.total) return 'The checklist has no tasks.';
        if (o.missingMandatory.length) return 'Finish the required tasks first: ' + o.missingMandatory.slice(0, 3).join('; ') + (o.missingMandatory.length > 3 ? '…' : '') + '.';
        if (o.failed) return 'Some tasks are blocked: sort them out or mark them N/A.';
        var missing = facts && facts.missingCerts ? facts.missingCerts : (d.missingCerts || []);
        if (missing.length) return 'They still need ' + missing.join(', ') + ' for their position.';
      }
      return '';
    }`;

/** An HR ruleset's DSL: the shared helpers, the HR ones, the logic and the validators. */
const ruleset = (name, rules) => rulesetDsl(name, { lib: [COMMON_LIB, HR_LIB, LOGIC_LIB, VALIDATE_LIB], rules });

/** Client rules: what every form does first. */
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
        jobTitle: user.jobTitle || null, teamRel: user.teamRel || null, managerRel: user.managerRel || null, employeeNo: user.employeeNo || null, positionRel: user.positionRel || null };
    }
  },`;

/** Server rules: helpers on ntf, and authorship on every save. */
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

/** A ruleset's view rule runs on load and when one of these fields changes. */
const onChange = (fields) => `function (ntf) { return ntf.isSetup || ${json(fields)}.indexOf(ntf.changed) > -1; }`;

/** The query for an account's or a team's leave that is Pending or Approved. */
const LIVE_LEAVE = `[{ term: { appTags: 'hr' } }, { term: { appTags: 'leave' } }, { terms: { 'leaveStatusRel.name': ['Pending', 'Approved'] } }]`;

// ------------------------------------------------------------------------------------------------
// Leave
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>>, values: Record<string, Record<string, object>> }} o
 */
export function leaveClientRules({ statuses, values }) {
  return ruleset(
    'HR Leave - Client',
    `${CLIENT_INIT}

  rulePreSave : {
    ruleCondition : function (ntf) { return ntf.context.eventName === 'PreSave'; },
    ruleAction : function (ntf) {
      var message = ntf.lib.validateLeave(ntf.document, ntf.who, null);
      if (!message) return;
      ntf.scope.showNotification(message, 'error');
      ntf.errorMessage = '(no-display)';
    }
  },

  // A new request: yours, annual leave, waiting for approval.
  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      if (!ntf.lib.has(d.employeeRel)) d.employeeRel = [ntf.meValue];
      if (!ntf.lib.has(d.leaveStatusRel)) d.leaveStatusRel = [${json(statuses.leaveStatus.Pending)}];
      if (!ntf.lib.has(d.leaveTypeRel)) d.leaveTypeRel = [${json(values.leaveType['Annual leave'])}];
      if (d.startHalfBool === undefined) d.startHalfBool = false;
      if (d.endHalfBool === undefined) d.endHalfBool = false;
    }
  },

  // What the form asks for follows the type and the status: a reason, evidence, a cancellation reason;
  // only a pending request can be changed, and only by the person on leave (or P&C, or a manager).
  ruleView : {
    ruleCondition : ${onChange(['leaveTypeRel', 'leaveStatusRel', 'startDate', 'endDate', 'daysNum', 'startHalfBool', 'endHalfBool'])},
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var f = lib.leaveFacts(d);
      var status = lib.statusName(d.leaveStatusRel) || 'Pending';
      var from = d.lastStatus || '';
      ntf.scope.showField('reason', true);
      ntf.scope.mandateField('reason', !!f.type.needsReasonBool);
      var evidence = !!f.type.evidenceAfterDaysNum && f.days > f.type.evidenceAfterDaysNum;
      ntf.scope.showField('evidenceArr', evidence || lib.has(d.evidenceArr));
      ntf.scope.mandateField('evidenceArr', evidence);
      ntf.scope.showField('cancelReason', status === 'Cancelled');
      ntf.scope.mandateField('cancelReason', status === 'Cancelled' && from === 'Approved');
      ntf.scope.showField('balancePanel', !!f.type.balanceKey);
      var mine = (lib.first(d.employeeRel) || {}).documentId === ntf.who.userId;
      var editable = (!from || from === 'Pending') && status === 'Pending' && (mine || ntf.who.isHr || ntf.who.isManager);
      ['leaveTypeRel', 'startDate', 'reason', 'evidenceArr'].forEach(function (name) { ntf.scope.enableField(name, editable); });
      ntf.scope.enableField('employeeRel', !from && (ntf.who.isHr || ntf.who.isManager));
    }
  }`,
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>>, leaveTypes: Record<string, object> }} o - status values; leave types by id (balance key, accrual)
 */
export function leaveServerRules({ statuses, leaveTypes }) {
  return ruleset(
    'HR Leave - PreSaveServer',
    `${SERVER_INIT}

  // Everything the request's fields imply, kept on the record for lists, the calendar and the rules.
  ruleDerive : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var f = lib.leaveFacts(d);
      d.firstDay = f.first;
      d.lastDay = f.last;
      d.daysNum = f.days;
      d.calendarDaysNum = f.count.calendarDays;
      d.periodText = lib.leavePeriodText(f.first, f.last, d.startHalfBool, d.endHalfBool);
      d.startHalfBool = !!d.startHalfBool;
      d.endHalfBool = !!d.endHalfBool;
      d.teamRel = f.employee.teamRel || [];
      d.managerRel = f.employee.managerRel || [];
      ntf.facts = f;
      ntf.move = lib.peekMove(ntf, 'leaveStatusRel');
    }
  },

  // What only the server can know: the saved version, the person's balance and other leave, the team
  // and its leave on those days, the manager's manager, and People & Culture.
  ruleGather : {
    ruleCondition : function (ntf) { return !!ntf.facts.employee.documentId; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.lib;
      var d = ntf.document;
      var f = ntf.facts;
      var types = ${json(leaveTypes)};
      var team = lib.first(d.teamRel) || {};
      f.others = [];
      f.teamSize = 0;
      lib.series([
        function (next) { lib.byId(ntf, d.documentId, function (err, saved) { f.previous = saved || null; next(); }); },
        function (next) { lib.byId(ntf, f.employee.documentId, function (err, account) { f.account = account || null; next(); }); },
        function (next) {
          var query = { size: 500, query: { bool: { filter: ${LIVE_LEAVE}.concat([{ term: { 'employeeRel.documentId': f.employee.documentId } }]) } } };
          lib.search(ntf, query, function (err, list) { f.own = (list || []).filter(function (x) { return x.documentId !== d.documentId; }); next(); });
        },
        function (next) {
          if (!team.documentId) { next(); return; }
          var query = { size: 500, query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }, { term: { 'teamRel.documentId': team.documentId } }], must_not: [{ term: { inactiveBool: true } }] } } };
          lib.search(ntf, query, function (err, list) { f.teamSize = (list || []).length; next(); });
        },
        function (next) {
          if (!team.documentId || !f.first || !f.last) { next(); return; }
          var query = { size: 500, query: { bool: { filter: ${LIVE_LEAVE}.concat([{ term: { 'teamRel.documentId': team.documentId } },
            { range: { startDate: { lt: lib.dayStart(new Date(Date.parse(f.last + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10), lib.zone) } } },
            { range: { endDate: { gte: lib.dayStart(f.first, lib.zone) } } }]) } } };
          // First come, first served: approved leave, and requests made before this one.
          var asked = Date.parse(d.createdDate || (d.systemHeader && d.systemHeader.createdDate) || new Date(ntf.now).toISOString());
          lib.search(ntf, query, function (err, list) {
            f.others = (list || []).filter(function (x) {
              if (x.documentId === d.documentId) return false;
              if (lib.statusName(x.leaveStatusRel) === 'Approved') return true;
              return Date.parse(x.createdDate || (x.systemHeader && x.systemHeader.createdDate) || '') < asked;
            });
            next();
          });
        },
        function (next) {
          var manager = lib.first((f.account && f.account.managerRel) || d.managerRel);
          if (!manager) { next(); return; }
          lib.byId(ntf, manager.documentId, function (err, account) { f.manager = lib.person(manager); f.skipLevel = account ? lib.person(lib.first(account.managerRel)) : null; next(); });
        },
        function (next) {
          var query = { size: 50, sort: [{ 'systemHeader.summaryName.lcase': 'asc' }], query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }, { terms: { accountType: ['People & Culture', 'Administrator'] } }], must_not: [{ term: { inactiveBool: true } }] } } };
          lib.search(ntf, query, function (err, list) { f.hr = (list || []).map(function (a) { return { documentId: a.documentId, name: a.systemHeader.summaryName }; }); next(); });
        }
      ], function () {
        // Overlapping leave of the same person.
        f.overlaps = (f.own || []).filter(function (x) {
          var a = lib.dayKey(x.startDate, lib.zone);
          var b = lib.dayKey(x.endDate, lib.zone);
          return f.first && f.last && a <= f.last && f.first <= b;
        }).map(function (x) { return (x.leaveRef || 'a request') + ', ' + lib.rangeText(lib.dayKey(x.startDate, lib.zone), lib.dayKey(x.endDate, lib.zone)); });
        // The balance on the first day.
        var type = types[f.type.documentId] || f.type;
        if (type.balanceKey && f.account && f.first) {
          var sameKind = Object.keys(types).filter(function (id) { return types[id].balanceKey === type.balanceKey; });
          var openingFields = ${json(OPENING_FIELDS)};
          var balance = lib.leaveBalance({
            opening: f.account[openingFields[type.balanceKey]],
            accrualPerYear: type.accrualDaysNum,
            fte: f.account.fteNum,
            since: lib.dayKey(f.account.balanceDate, lib.zone) || f.first,
            at: f.first,
            exclude: d.documentId,
            requests: (f.own || []).filter(function (x) { return sameKind.indexOf((lib.first(x.leaveTypeRel) || {}).documentId) > -1; })
              .map(function (x) { return { documentId: x.documentId, days: x.daysNum, status: lib.statusName(x.leaveStatusRel), first: lib.dayKey(x.startDate, lib.zone) }; })
          });
          f.available = balance.available;
          d.balanceAtStartNum = balance.available;
        }
        // Who else in the team is away, and whether this request takes the team below its minimum.
        f.breaches = lib.staffingBreaches({
          dates: f.dates, first: f.first, last: f.last, halfFirst: d.startHalfBool, halfLast: d.endHalfBool,
          employeeId: f.employee.documentId, teamSize: f.teamSize, min: team.minOnDutyNum,
          others: (f.others || []).map(function (x) {
            return { employeeId: (lib.first(x.employeeRel) || {}).documentId, first: lib.dayKey(x.startDate, lib.zone), last: lib.dayKey(x.endDate, lib.zone), halfFirst: x.startHalfBool, halfLast: x.endHalfBool };
          })
        });
        callback();
      });
    }
  },

  ruleValidate : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var f = ntf.facts;
      var message = ntf.lib.validateLeave(d, ntf.who, f);
      // Approved or rejected leave keeps its dates and type: cancel it and ask again instead.
      if (!message && f.previous) {
        var was = ntf.lib.statusName(f.previous.leaveStatusRel);
        var same = function (a, b) { return String(a || '') === String(b || ''); };
        var changed = ntf.lib.dayKey(f.previous.startDate, ntf.lib.zone) !== f.first || ntf.lib.dayKey(f.previous.endDate, ntf.lib.zone) !== f.last ||
          !same((ntf.lib.first(f.previous.leaveTypeRel) || {}).documentId, f.type.documentId) || !!f.previous.startHalfBool !== !!d.startHalfBool || !!f.previous.endHalfBool !== !!d.endHalfBool;
        if (changed && was && was !== 'Pending') message = (was === 'Approved' ? 'Approved' : was) + ' leave can\\'t be changed: cancel it and make a new request.';
        f.changed = changed;
      }
      if (message) ntf.errorMessage = message;
    }
  },

  // The approvals: the steps this request needs (a second approver when the team would be below its
  // minimum), the decisions made since the saved version checked (by whom, in turn), and the status
  // they come to. Changing a pending request's dates or type starts the approvals again.
  ruleApproval : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var f = ntf.facts;
      var status = lib.statusName(d.leaveStatusRel);
      var before = f.previous ? f.previous.approvalChain : null;
      if (status === 'Cancelled') {
        d.nextApproverIds = [];
        d.nextApproverRel = [];
        return;
      }
      // A decided request keeps its chain as it was decided.
      if (status !== 'Pending') {
        if (before) d.approvalChain = before;
        var kept = lib.approvalStatus(d.approvalChain);
        d.approvalState = kept.state;
        d.nextApproverIds = [];
        d.nextApproverRel = [];
        return;
      }
      var submitted = d.approvalChain || { steps: [] };
      if (f.previous && f.changed) {
        // New dates or type: decisions on the old ones don't carry over.
        submitted = { steps: [] };
        before = null;
        lib.systemNote(ntf, 'Dates or type changed to ' + lib.rangeText(f.first, f.last) + ' (' + lib.daysText(f.days) + '): the approvals start again.');
      }
      // Decisions and delegations are judged against the saved chain, by the person saving.
      if (before) {
        var problems = lib.approvalProblems(before, submitted, ntf.userId, { commentOnReject: true });
        if (problems.length) { ntf.errorMessage = problems[0]; return; }
      }
      // The saved chain, with only this save's decision and delegation taken from what was sent: the
      // steps and their approvers are the rules', never the browser's.
      var nowIso = new Date(ntf.now).toISOString();
      var base = JSON.parse(JSON.stringify(before || { steps: [] }));
      var decided = [];
      (submitted.steps || []).forEach(function (sent) {
        var step = (base.steps || []).filter(function (x) { return x.id === sent.id; })[0];
        if (!step || step.decision) return;
        if (sent.decision) {
          step.decision = sent.decision;
          step.comment = sent.comment || '';
          step.decidedBy = lib.me(ntf);
          step.decidedAt = nowIso;
          decided.push(step);
        }
        var was = (step.delegate && step.delegate.documentId) || '';
        var now = (sent.delegate && sent.delegate.documentId) || '';
        if (was !== now) {
          step.delegate = sent.delegate ? lib.person(sent.delegate) : null;
          step.delegatedBy = sent.delegate ? lib.me(ntf) : null;
          step.delegatedAt = sent.delegate ? nowIso : null;
          if (sent.delegate) lib.systemNote(ntf, lib.me(ntf).name + ' handed the ' + step.label + ' step to ' + sent.delegate.name + '.');
        }
      });
      var team = lib.first(d.teamRel) || {};
      var steps = lib.leaveApprovalSteps({
        employee: lib.person(f.employee), manager: f.manager || lib.person(lib.first(d.managerRel)), skipLevel: f.skipLevel, hr: f.hr || [],
        breaches: f.breaches || [], teamName: team.name, teamSize: f.teamSize, min: team.minOnDutyNum, needsHr: !!f.type.needsHrBool, typeName: f.type.name
      });
      // Decided steps stay as they are; a breach found later still adds a second approver.
      var chain = lib.mergeApprovalChain(steps, base);
      d.approvalChain = chain;
      var state = lib.approvalStatus(chain);
      d.approvalState = state.state;
      d.nextApproverIds = state.waitingOn.map(function (p) { return p.documentId; });
      d.nextApproverRel = state.waitingOn.map(lib.person);
      d.staffingBreachBool = !!(f.breaches && f.breaches.length);
      d.staffingNote = d.staffingBreachBool ? chain.steps.filter(function (s) { return s.id === 'second'; }).map(function (s) { return s.reason; })[0] || '' : '';
      if (state.state === 'approved' && status === 'Pending') d.leaveStatusRel = [${json(statuses.leaveStatus.Approved)}];
      if (state.state === 'rejected' && status === 'Pending') d.leaveStatusRel = [${json(statuses.leaveStatus.Rejected)}];
      ntf.decided = decided;
      ntf.chainState = state;
      ntf.newWaiting = !before || JSON.stringify(lib.approvalStatus(before).waitingOn.map(function (p) { return p.documentId; })) !== JSON.stringify(d.nextApproverIds) || !!f.changed;
    }
  },

  // The activity: who was asked, what was decided, and the outcome. People asked are recorded as told.
  ruleNotes : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var f = ntf.facts;
      var status = lib.statusName(d.leaveStatusRel);
      var what = lib.daysText(f.days) + ' of ' + String(f.type.name || 'leave').toLowerCase() + ', ' + lib.rangeText(f.first, f.last);
      (ntf.decided || []).forEach(function (step) {
        lib.systemNote(ntf, '**' + (step.decision === 'approved' ? 'Approved' : 'Rejected') + '** by ' + step.decidedBy.name + ' (' + step.label + ')' + (step.comment ? ': ' + step.comment : '.'));
      });
      if (status === 'Approved' && d.lastStatus !== 'Approved') {
        lib.tell(ntf, [lib.person(f.employee)]);
        lib.systemNote(ntf, '**Approved**: ' + what + '. ' + f.employee.name + ' has been told.');
      } else if (status === 'Rejected' && d.lastStatus !== 'Rejected') {
        lib.tell(ntf, [lib.person(f.employee)]);
        lib.systemNote(ntf, '**Rejected**: ' + what + '. ' + f.employee.name + ' has been told.');
      } else if (status === 'Cancelled' && d.lastStatus && d.lastStatus !== 'Cancelled') {
        lib.systemNote(ntf, '**Cancelled** by ' + lib.me(ntf).name + (d.cancelReason ? ': ' + d.cancelReason : '.'));
      } else if (status === 'Pending' && ntf.newWaiting && ntf.chainState && ntf.chainState.current > -1) {
        var step = d.approvalChain.steps[ntf.chainState.current];
        var fresh = lib.tell(ntf, ntf.chainState.waitingOn);
        var line = (d.lastStatus ? 'Now waiting for ' : 'Requested ' + what + '. Waiting for ') + (ntf.chainState.waitingOn.map(function (p) { return p.name; }).join(' or ') || 'an approver') + ' (' + step.label + ')';
        lib.systemNote(ntf, line + (step.reason ? ': ' + step.reason : '.') + (fresh.length ? ' Told ' + fresh.map(function (p) { return p.name; }).join(', ') + '.' : ''));
      }
    }
  },
  // Last: record the move (lastStatus, and transition for the PostSave rule), after the validators
  // and checks have compared against the previous status.
  ruleTransition : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var move = ntf.lib.transition(ntf, 'leaveStatusRel');
      if (move && (move.to === 'Approved' || move.to === 'Rejected')) ntf.document.decidedDate = move.at;
    }
  }`,
  );
}

/**
 * PostSave: the person's balances on their account, as of today, recounted from their leave.
 * @param {{ leaveTypes: Record<string, object> }} o - Leave types by id
 */
export function leavePostRules({ leaveTypes }) {
  return ruleset(
    'HR Leave - PostSave',
    `
  ruleBalances : {
    ruleCondition : function (ntf) { return ntf.ruleset.lib.has(ntf.document.employeeRel); },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var employee = lib.first(d.employeeRel);
      var types = ${json(leaveTypes)};
      var query = { size: 500, query: { bool: { filter: ${LIVE_LEAVE}.concat([{ term: { 'employeeRel.documentId': employee.documentId } }]) } } };
      lib.search(ntf, query, function (err, found) {
        // Search may not have this save yet: use the saved request itself.
        var list = (found || []).filter(function (x) { return x.documentId !== d.documentId; });
        var status = lib.statusName(d.leaveStatusRel);
        if (status === 'Approved' || status === 'Pending') list.push(d);
        lib.byId(ntf, employee.documentId, function (err2, account) {
          if (!account) { callback(); return; }
          var change = { leaveBalances: {} };
          var today = lib.dayKey(Date.now(), lib.zone);
          var openingFields = ${json(OPENING_FIELDS)};
          Object.keys(openingFields).forEach(function (key) {
            var ids = Object.keys(types).filter(function (id) { return types[id].balanceKey === key; });
            if (!ids.length) return;
            var b = lib.leaveBalance({
              opening: account[openingFields[key]], accrualPerYear: types[ids[0]].accrualDaysNum, fte: account.fteNum,
              since: lib.dayKey(account.balanceDate, lib.zone) || today, at: today,
              requests: list.filter(function (x) { return ids.indexOf((lib.first(x.leaveTypeRel) || {}).documentId) > -1; })
                .map(function (x) { return { documentId: x.documentId, days: x.daysNum, status: lib.statusName(x.leaveStatusRel), first: lib.dayKey(x.startDate, lib.zone) }; })
            });
            change.leaveBalances[key] = b;
            change[key + 'AvailableNum'] = b.available;
          });
          lib.update(ntf, employee.documentId, change, function () { callback(); });
        });
      });
    }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Certificates
// ------------------------------------------------------------------------------------------------

export function certClientRules() {
  return ruleset(
    'HR Certificate - Client',
    `${CLIENT_INIT}
${clientPreSave('validateCertificate')}

  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      if (!ntf.lib.has(ntf.document.personRel)) ntf.document.personRel = [ntf.meValue];
    }
  },

  // The expiry follows the type's validity from the issue date (it can still be changed).
  ruleExpiry : {
    ruleCondition : function (ntf) { return ntf.changed === 'issuedDate' || ntf.changed === 'certTypeRel'; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var type = ntf.lib.first(d.certTypeRel) || {};
      var expiry = ntf.lib.expiryFromIssue(d.issuedDate, type.validityMonthsNum);
      if (expiry) d.expiryDate = expiry;
    }
  },

  ruleView : {
    ruleCondition : ${onChange(['certTypeRel'])},
    ruleAction : function (ntf) {
      var type = ntf.lib.first(ntf.document.certTypeRel) || {};
      ntf.scope.mandateField('expiryDate', !!type.validityMonthsNum);
      ntf.scope.enableField('personRel', ntf.isNew && (ntf.who.isHr || ntf.who.isManager));
    }
  }`,
  );
}

/**
 * @param {{ certStates: Record<string, object> }} o - Certificate state values by name
 */
export function certServerRules({ certStates }) {
  return ruleset(
    'HR Certificate - PreSaveServer',
    `${SERVER_INIT}

  // Where it stands, kept on the record; a certificate within ${EXPIRY_WARN_DAYS} days of expiry tells its holder and their manager, once.
  ruleDerive : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var person = lib.first(d.personRel) || {};
      var type = lib.first(d.certTypeRel) || {};
      if (lib.empty(d.expiryDate) && type.validityMonthsNum && d.issuedDate) d.expiryDate = lib.expiryFromIssue(d.issuedDate, type.validityMonthsNum);
      var s = lib.certState(d.expiryDate, ntf.now, ${EXPIRY_WARN_DAYS});
      var labels = { valid: 'Valid', expiring: 'Expiring', expired: 'Expired', none: 'No expiry' };
      var states = ${json(certStates)};
      d.certState = labels[s.state];
      d.certStateRel = [states[labels[s.state]]];
      d.daysLeftNum = s.daysLeft;
      d.teamRel = person.teamRel || [];
      d.managerRel = person.managerRel || [];
      if (s.state === 'valid' || s.state === 'none') d.expiryNotifiedBool = false;
      ntf.state = s;
    }
  },
  ruleValidate : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var message = ntf.lib.validateCertificate(ntf.document, ntf.who);
      if (message) ntf.errorMessage = message;
    }
  },
  ruleTell : {
    ruleCondition : function (ntf) { return !ntf.errorMessage && (ntf.state.state === 'expiring' || ntf.state.state === 'expired') && !ntf.document.expiryNotifiedBool; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var person = lib.first(d.personRel) || {};
      var type = lib.first(d.certTypeRel) || {};
      var fresh = lib.tell(ntf, [lib.person(person), lib.person(lib.first(person.managerRel))]);
      d.expiryNotifiedBool = true;
      var when = lib.dayText(lib.dayKey(d.expiryDate, lib.zone));
      lib.systemNote(ntf, '**' + type.name + (ntf.state.state === 'expired' ? ' expired' : ' expires') + ' ' + when + '**' + (ntf.state.state === 'expiring' ? ' (in ' + lib.daysText(ntf.state.daysLeft) + ')' : '') + '. ' +
        (fresh.length ? 'Told ' + fresh.map(function (p) { return p.name; }).join(' and ') + '.' : ''));
    }
  }`,
  );
}

/**
 * The certificate expiry check: saving one looks through every certificate that has expired or
 * expires within the warning period, brings its state up to date and tells its holder and their
 * manager (once). A real deployment would save one every morning from a scheduler.
 * @param {{ certStates: Record<string, object> }} o
 */
export function expiryServerRules() {
  return ruleset(
    'HR Expiry Check - PreSaveServer',
    `${SERVER_INIT}

  ruleDefaults : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      if (!d.runDate) d.runDate = new Date(ntf.now).toISOString();
      // The company's warning period, the same one the certificate rule uses.
      d.warnDaysNum = ${EXPIRY_WARN_DAYS};
      if (!ntf.who.isHr) ntf.errorMessage = 'People & Culture runs the certificate expiry check.';
    }
  }`,
  );
}

export function expiryPostRules({ certStates }) {
  return ruleset(
    'HR Expiry Check - PostSave',
    `
  ruleSweep : {
    ruleCondition : function (ntf) { return !ntf.document.doneBool; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var now = Date.now();
      var warn = Number(d.warnDaysNum) || ${EXPIRY_WARN_DAYS};
      var states = ${json(certStates)};
      var labels = { valid: 'Valid', expiring: 'Expiring', expired: 'Expired', none: 'No expiry' };
      var query = { size: 1000, query: { bool: { filter: [{ term: { appTags: 'hr' } }, { term: { appTags: 'certificate' } }, { range: { expiryDate: { lt: new Date(now + warn * 86400000).toISOString() } } }], must_not: [{ term: { supersededBool: true } }] } } };
      lib.search(ntf, query, function (err, certs) {
        var told = {};
        var counts = { expiring: 0, expired: 0, notified: 0, updated: 0 };
        var lines = [];
        var todo = (certs || []).map(function (c) {
          var s = lib.certState(c.expiryDate, now, warn);
          if (s.state === 'expiring') counts.expiring++;
          if (s.state === 'expired') counts.expired++;
          var change = {};
          if (c.certState !== labels[s.state]) { change.certState = labels[s.state]; change.certStateRel = [states[labels[s.state]]]; }
          if (c.daysLeftNum !== s.daysLeft) change.daysLeftNum = s.daysLeft;
          if ((s.state === 'expiring' || s.state === 'expired') && !c.expiryNotifiedBool) {
            var person = lib.first(c.personRel) || {};
            var type = lib.first(c.certTypeRel) || {};
            var people = [lib.person(person), lib.person(lib.first(person.managerRel))].filter(function (p) { return !!p; });
            var notified = (c.notifiedRel || []).slice();
            people.forEach(function (p) { if (!notified.some(function (n) { return n.documentId === p.documentId; })) notified.push(p); told[p.documentId] = p.name; });
            var notes = (c.notesCommentsArr || []).slice();
            notes.push({ dataId: 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), createdBy: lib.me(ntf), createdDate: new Date().toISOString(), comments: [], votes: [],
              detail: '**' + type.name + (s.state === 'expired' ? ' expired' : ' expires') + ' ' + lib.dayText(lib.dayKey(c.expiryDate, lib.zone)) + '**. Told ' + people.map(function (p) { return p.name; }).join(' and ') + ' (expiry check ' + (d.expiryCheckRef || '') + ').' });
            change.notifiedRel = notified;
            change.notesCommentsArr = notes;
            change.expiryNotifiedBool = true;
            counts.notified++;
            lines.push({ certificate: { documentId: c.documentId, name: c.systemHeader.summaryName }, state: labels[s.state], daysLeft: s.daysLeft });
          }
          return Object.keys(change).length ? { id: c.documentId, change: change } : null;
        }).filter(function (x) { return !!x; });
        counts.updated = todo.length;
        var next = function (i) {
          if (i >= todo.length) {
            var names = Object.keys(told).map(function (id) { return told[id]; });
            lib.update(ntf, d.documentId, {
              doneBool: true, expiringNum: counts.expiring, expiredNum: counts.expired, notifiedNum: counts.notified, updatedNum: counts.updated, toldRel: Object.keys(told).map(function (id) { return { documentId: id, name: told[id] }; }),
              newlyFlagged: lines,
              summary: counts.notified ? 'Flagged ' + counts.notified + ' certificate' + (counts.notified === 1 ? '' : 's') + ' and told ' + names.length + (names.length === 1 ? ' person' : ' people') + ' (' + names.join(', ') + '). ' + counts.expired + ' expired and ' + counts.expiring + ' expiring in all.' : 'Nothing new: ' + counts.expired + ' expired and ' + counts.expiring + ' expiring, everyone already told.'
            }, function () { callback(); });
            return;
          }
          lib.update(ntf, todo[i].id, todo[i].change, function () { next(i + 1); });
        };
        next(0);
      });
    }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Onboarding
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function onboardingClientRules({ statuses }) {
  return ruleset(
    'HR Onboarding - Client',
    `${CLIENT_INIT}

  rulePreSave : {
    ruleCondition : function (ntf) { return ntf.context.eventName === 'PreSave'; },
    ruleAction : function (ntf) {
      var message = ntf.lib.validateOnboarding(ntf.document, ntf.who, null);
      if (!message) return;
      ntf.scope.showNotification(message, 'error');
      ntf.errorMessage = '(no-display)';
    }
  },

  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      if (!ntf.lib.has(ntf.document.onboardingStatusRel)) ntf.document.onboardingStatusRel = [${json(statuses.onboardingStatus['Not started'])}];
    }
  },

  // Choosing the starter brings their position, manager and first day from their account.
  ruleStarter : {
    ruleCondition : function (ntf) { return ntf.changed === 'personRel'; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var p = ntf.lib.first(d.personRel) || {};
      if (ntf.lib.has(p.positionRel)) d.positionRel = p.positionRel;
      if (ntf.lib.has(p.managerRel) && !ntf.lib.has(d.managerRel)) d.managerRel = p.managerRel;
      if (p.employmentStartDate && !d.startDate) d.startDate = p.employmentStartDate;
    }
  },

  ruleView : {
    ruleCondition : ${onChange(['onboardingStatusRel'])},
    ruleAction : function (ntf) {
      var status = ntf.lib.statusName(ntf.document.onboardingStatusRel) || 'Not started';
      ntf.scope.enableField('tasks', status !== 'Completed' && status !== 'Cancelled');
    }
  }`,
  );
}

export function onboardingServerRules() {
  return ruleset(
    'HR Onboarding - PreSaveServer',
    `${SERVER_INIT}

  ruleDerive : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var o = lib.checklistOutcome(d.tasks, { commentOnFail: true, failLabel: 'Blocked' });
      d.tasksTotalNum = o.total;
      d.tasksDoneNum = o.passed + o.na;
      d.tasksBlockedNum = o.failed;
      d.progressNum = o.total ? Math.round(((o.passed + o.na) / o.total) * 100) : 0;
      if (d.startDate) d.probationReviewDate = lib.expiryFromIssue(d.startDate, 3);
      var person = lib.first(d.personRel) || {};
      d.teamRel = person.teamRel || d.teamRel || [];
      ntf.move = lib.peekMove(ntf, 'onboardingStatusRel');
      if (ntf.move && ntf.move.to === 'Completed') { d.completedDate = ntf.move.at; d.completedByRel = [lib.me(ntf)]; }
      if (ntf.move && ntf.move.from === 'Completed') { d.completedDate = null; d.completedByRel = []; }
    }
  },

  // The certificates their position requires that they don't hold in date yet.
  ruleCertificates : {
    ruleCondition : function (ntf) { return ntf.lib.has(ntf.document.personRel) && ntf.lib.has(ntf.document.positionRel); },
    ruleAction : function (ntf, callback) {
      var lib = ntf.lib;
      var d = ntf.document;
      var person = lib.first(d.personRel);
      var position = lib.first(d.positionRel);
      var query = { size: 200, query: { bool: { filter: [{ term: { appTags: 'hr' } }, { term: { appTags: 'certificate' } }, { term: { 'personRel.documentId': person.documentId } }] } } };
      lib.search(ntf, query, function (err, certs) {
        var held = (certs || []).map(function (c) { return { typeId: (lib.first(c.certTypeRel) || {}).documentId, expiryDate: c.expiryDate }; });
        d.missingCerts = lib.missingCertificates(position.requiredCertsRel || [], held, ntf.now);
        d.missingCertsNum = d.missingCerts.length;
        d.missingCertsText = d.missingCerts.join(', ');
        callback();
      });
    }
  },
  ruleValidate : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var message = ntf.lib.validateOnboarding(ntf.document, ntf.who, { missingCerts: ntf.document.missingCerts || [] });
      if (message) ntf.errorMessage = message;
    }
  },
  ruleNotes : {
    ruleCondition : function (ntf) { return !ntf.errorMessage && !!ntf.move && ntf.move.to === 'Completed'; },
    ruleAction : function (ntf) {
      var person = ntf.lib.first(ntf.document.personRel) || {};
      ntf.lib.systemNote(ntf, '**Onboarding complete** for ' + person.name + ': every required task done and every required certificate held.');
    }
  },
  ruleTransition : {
    ruleCondition : true,
    ruleAction : function (ntf) { ntf.lib.transition(ntf, 'onboardingStatusRel'); }
  }`,
  );
}

/** PostSave: the starter's account says how their onboarding stands. */
export function onboardingPostRules() {
  return ruleset(
    'HR Onboarding - PostSave',
    `
  ruleAccount : {
    ruleCondition : function (ntf) { return ntf.ruleset.lib.has(ntf.document.personRel); },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var person = lib.first(d.personRel);
      // (JayRule treats a rule as asynchronous only when it sees callback() called.)
      lib.update(ntf, person.documentId, { onboardingStatus: lib.statusName(d.onboardingStatusRel), onboardingProgressNum: d.progressNum || 0, onboardedDate: d.completedDate || null }, function () { callback(); });
    }
  }`,
  );
}

/** For tests: the validator library alone. */
export const VALIDATORS = { HR_LIB, LOGIC_LIB, VALIDATE_LIB };

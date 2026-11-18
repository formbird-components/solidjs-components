// Safety rulesets: incidents, hazards, corrective actions and inspections.
//
// The safety logic the elements also use (the risk matrix and responses, injury classes,
// notifiable incidents, action due dates and summaries, five-whys checks, hazard reviews, the
// checklist outcome) is not rewritten here: each ruleset carries those functions' own source in
// `ruleset.lib`, imported from packages/whs-kit/src/logic (and shared's checklist), so the browser
// and the server apply one implementation. The validators (validateIncident…) run in the browser's
// PreSave rule, which shows the reason, and in the PreSaveServer rule, which enforces it.
//
// The scaffolding (shared helpers, the async-callback guard, status transitions against
// `lastStatus`, the client PreSave rule) comes from solidjs-components-shared's platform
// (packages/platform/rules.mjs).

import { clientPreSave, COMMON_LIB, functionsLib, rulesetDsl, whenLib } from '@solidjs-components/platform/rules';
import { checklistOutcome } from '../../../solidjs-components-shared/packages/kit/src/domain/checklist.ts';
import { actionDueDate, actionState, actionsSummary, controlRank } from '../../packages/whs-kit/src/logic/actions.ts';
import { controlProblem, nextReviewDate } from '../../packages/whs-kit/src/logic/hazard.ts';
import { injuryClass, notifiable, reportingDelayHours } from '../../packages/whs-kit/src/logic/incident.ts';
import { residualProblem, riskRating, riskResponse } from '../../packages/whs-kit/src/logic/risk.ts';
import { causeProblems, causeSummary } from '../../packages/whs-kit/src/logic/rootcause.ts';
import { CHECK_CATEGORY_HAZARD, CONTROL_LEVELS, TRANSITIONS } from './catalog.mjs';
import { KEYS, LATE_REPORT_HOURS, TIME_ZONE } from './model.mjs';

const json = (value) => JSON.stringify(value);

/** What safety rulesets carry besides the shared helpers. */
const WHS_LIB = `
    // Who is saving: from access keys on the server, from the account type in the browser (they match).
    whoFromKeys : function (ntf) {
      return {
        isWhs: this.hasKey(ntf, ${json(KEYS.whs)}),
        isManager: this.hasKey(ntf, ${json(KEYS.manager)}),
        isExecutive: this.hasKey(ntf, ${json(KEYS.executive)}),
        isSupervisor: this.hasKey(ntf, ${json(KEYS.supervisor)}),
        userId: ntf.userId
      };
    },
    whoFromAccount : function (ntf) {
      var type = (ntf.context.user || {}).accountType || '';
      var admin = type === 'Administrator';
      return {
        isWhs: admin || type === 'WHS Advisor',
        isManager: admin || type === 'Executive' || type === 'Site Manager',
        isExecutive: admin || type === 'Executive',
        isSupervisor: admin || type === 'Site Manager' || type === 'Supervisor',
        userId: ntf.userId
      };
    },
    has : function (list) { return !!(list && list.length); },
    rated : function (value) {
      var r = value && this.riskRating(value.likelihood, value.consequence);
      return r ? { likelihood: Number(value.likelihood), consequence: Number(value.consequence), score: r.score, rating: r.rating } : null;
    },
    unique : function (list) {
      var seen = {};
      return (list || []).filter(function (x) { if (!x || seen[x]) return false; seen[x] = true; return true; });
    },
    // A note in the record's activity (solid-comments), written by the person whose save caused it.
    systemNote : function (ntf, text) {
      var notes = (ntf.document.notesCommentsArr || []).slice();
      notes.push({ dataId: 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), detail: text, createdBy: this.me(ntf), createdDate: new Date().toISOString(), comments: [], votes: [] });
      ntf.document.notesCommentsArr = notes;
    },
    personValue : function (p) { return p ? { documentId: p.documentId, name: p.name } : null; },
    // The save's status move, without recording it: the validators compare against lastStatus, so
    // lib.transition (which moves lastStatus on) runs only after them, in ruleTransition.
    peekMove : function (ntf, field) {
      var from = ntf.document.lastStatus || '';
      var to = this.statusName(ntf.document[field]);
      return from !== to ? { from: from, to: to, at: new Date().toISOString() } : null;
    }`;

/** The logic functions, as their own source (type-stripped by Node when this module loads). */
const LOGIC_LIB = functionsLib([
  riskRating, riskResponse, residualProblem, injuryClass, notifiable, reportingDelayHours, actionDueDate, actionState, actionsSummary, controlRank,
  causeProblems, causeSummary, nextReviewDate, controlProblem, checklistOutcome,
]);

/**
 * What makes a record invalid, checked the same way in the browser and on the server. `who` says
 * whether the person saving is a WHS advisor, a manager, an executive or a supervisor.
 * Each returns a message, or '' when the record is fine.
 */
const VALIDATE_LIB = `
    // What an incident's fields add up to: its rating, injury class, whether it is notifiable, how
    // deep the investigation goes and who signs it off.
    incidentFacts : function (d) {
      var risk = this.rated(d.riskAssessment);
      var rating = risk ? risk.rating : '';
      var type = this.statusName(d.incidentTypeRel);
      var treatment = this.statusName(d.treatmentRel);
      var injury = this.injuryClass(treatment);
      var natures = (d.injuryNatureRel || []).map(function (n) { return { name: n.name, serious: !!n.seriousBool }; });
      var notice = this.notifiable({ type: type, treatment: treatment, natures: natures, dangerousKind: this.statusName(d.dangerousKindRel) });
      var response = rating ? this.riskResponse(rating) : null;
      var investigation = response ? response.investigation : 'none';
      if (notice.notifiable || (injury && injury.lostTime)) investigation = 'full';
      else if (injury && injury.recordable && investigation === 'none') investigation = 'supervisor';
      var closeBy = notice.notifiable ? 'Executive' : response ? response.closeBy : 'WHS';
      return { type: type, treatment: treatment, risk: risk, rating: rating, injury: injury, notice: notice, response: response, investigation: investigation, closeBy: closeBy, isInjury: type === 'Injury' || type === 'Illness' };
    },
    validateIncident : function (d, who) {
      var status = this.statusName(d.incidentStatusRel);
      var from = d.lastStatus || '';
      var f = this.incidentFacts(d);
      if (!from && status !== 'Reported' && !(who.isWhs && status === 'Under Review')) return 'A new incident starts as Reported.';
      if (!this.allowedMove(${json(TRANSITIONS.incidentStatus)}, from, status)) return "An incident can't go from " + from + ' to ' + status + '.';
      if (from && from !== status) {
        if (status === 'Under Review' && from === 'Reported' && !(who.isSupervisor || who.isWhs || who.isManager)) return 'A supervisor, a manager or a WHS advisor reviews a report.';
        if ((status === 'Investigating' || status === 'Actions Pending' || status === 'Rejected') && !who.isWhs) return 'Only a WHS advisor can move an incident to ' + status + '.';
        if (from === 'Closed' && !(who.isWhs || who.isManager)) return 'Only a WHS advisor or a manager can reopen an incident.';
        if (status === 'Closed') {
          if (f.closeBy === 'Executive' && !who.isExecutive) return (f.notice.notifiable ? 'A notifiable incident' : 'An Extreme incident') + ' is signed off by an executive.';
          if (f.closeBy === 'Manager' && !who.isManager) return 'A High incident is signed off by a site manager or an executive.';
          if (f.closeBy === 'WHS' && !(who.isWhs || who.isManager)) return 'A WHS advisor or a manager closes an incident.';
        }
      }
      if (this.empty(d.title)) return 'Say what happened, in a few words.';
      if (!f.type) return 'Choose the type of incident.';
      if (this.empty(d.occurredDate)) return 'Enter when it happened.';
      if (Date.parse(d.occurredDate) > Date.now() + 5 * 60000) return "It can't have happened in the future.";
      if (d.reportedDate && Date.parse(d.reportedDate) < Date.parse(d.occurredDate) - 60000) return "It can't have been reported before it happened.";
      if (!this.has(d.siteRel)) return 'Choose the site.';
      if (this.empty(d.description)) return 'Describe what happened.';
      if (f.type === 'Dangerous incident' && !this.has(d.dangerousKindRel)) return 'Choose the kind of dangerous incident.';
      if (f.isInjury) {
        if (!this.has(d.injuredPersonRel) && this.empty(d.injuredName)) return 'Who was hurt? Choose the person, or type their name.';
        if (!f.treatment) return 'Choose the treatment given.';
        if (!this.has(d.injuryNatureRel)) return 'Choose the nature of the injury.';
        if (f.type === 'Injury' && !this.has(d.injuryPins)) return 'Mark where on the body the injury is.';
      }
      if (status === 'Rejected') return this.empty(d.rejectReason) ? 'Say why the incident is rejected.' : '';
      if (status !== 'Reported' && !f.risk) return 'Rate the risk (likelihood and consequence) to review the incident.';
      if ((status === 'Investigating' || status === 'Actions Pending' || status === 'Closed') && f.notice.notifiable) {
        if (this.empty(d.regulatorNotifiedDate) || this.empty(d.regulatorRef)) return 'This incident is notifiable (' + f.notice.reasons.join('; ') + '). Record when the regulator was told and their reference.';
        if (!d.sitePreservedBool) return 'Confirm the site was left undisturbed until an inspector released it.';
      }
      if (status === 'Investigating' && !this.has(d.investigatorRel)) return 'Choose who investigates.';
      if (status === 'Actions Pending' || status === 'Closed') {
        if (f.investigation === 'full') {
          var problems = this.causeProblems(d.rootCauseTree, { minDepth: 3 });
          if (problems.length) return "The investigation isn't finished: " + problems[0];
          if (this.empty(d.investigationSummary)) return 'Write up what the investigation found.';
        } else if (f.investigation === 'supervisor' && this.empty(d.investigationSummary)) {
          return "Write up the review's findings.";
        }
      }
      if (status === 'Closed' && f.injury && f.injury.lostTime && f.treatment !== 'Fatality' && !(Number(d.daysLostNum) > 0)) return 'Record the days lost before closing a lost time injury.';
      return '';
    },

    validateHazard : function (d, who) {
      var status = this.statusName(d.hazardStatusRel);
      var from = d.lastStatus || '';
      if (!from && status !== 'Reported' && !(who.isWhs && status === 'Assessed')) return 'A new hazard starts as Reported.';
      if (!this.allowedMove(${json(TRANSITIONS.hazardStatus)}, from, status)) return "A hazard can't go from " + from + ' to ' + status + '.';
      if (from && from !== status) {
        if ((status === 'Assessed' || status === 'Controls Pending') && !(who.isSupervisor || who.isWhs || who.isManager)) return 'A supervisor, a manager or a WHS advisor assesses hazards.';
        if ((status === 'Controlled' || status === 'Closed') && !(who.isWhs || who.isManager)) return 'A WHS advisor or a manager signs off controls.';
        if (status === 'Rejected' && !who.isWhs) return 'Only a WHS advisor can reject a hazard report.';
      }
      if (this.empty(d.title)) return 'Name the hazard in a few words.';
      if (!this.has(d.hazardCategoryRel)) return 'Choose the hazard category.';
      if (!this.has(d.siteRel)) return 'Choose the site.';
      if (this.empty(d.description)) return 'Describe what could go wrong, and to whom.';
      if (status === 'Reported' || status === 'Rejected') return '';
      var inherent = this.rated(d.inherentRisk);
      var residual = this.rated(d.residualRisk);
      if (!inherent) return 'Rate the risk before controls.';
      if (!this.has(d.ownerRel)) return 'Choose who owns the hazard.';
      if (residual) {
        var problem = this.residualProblem(inherent, residual);
        if (problem) return problem;
      }
      if (status === 'Controlled' || status === 'Closed') {
        if (!residual) return 'Rate the risk with the controls in place.';
        if (status === 'Controlled' && residual.rating === 'Extreme') return "Work can't continue with an Extreme residual risk: add controls that lower it first.";
      }
      if (status === 'Closed' && this.empty(d.closeNotes)) return 'Say why the hazard can be closed (removed, or no longer present).';
      return '';
    },

    // The latest due date an action's source rating allows (ms), or null.
    actionDueLimit : function (d) {
      var source = this.first(d.sourceRel) || {};
      var response = this.riskResponse(source.riskRating);
      if (!response || !d.raisedDate) return null;
      return { at: Date.parse(this.actionDueDate(d.raisedDate, response.actionDays)), days: response.actionDays, rating: source.riskRating };
    },
    validateAction : function (d, who) {
      var status = this.statusName(d.actionStatusRel);
      var from = d.lastStatus || '';
      if (!from && status !== 'Open' && status !== 'In Progress') return 'A new action starts as Open or In Progress.';
      if (!this.allowedMove(${json(TRANSITIONS.actionStatus)}, from, status)) return "An action can't go from " + from + ' to ' + status + '.';
      var moved = from && from !== status;
      if (moved && (status === 'Verified' || status === 'Cancelled') && !(who.isWhs || who.isManager)) return 'A WHS advisor or a manager ' + (status === 'Verified' ? 'verifies' : 'cancels') + ' actions.';
      if (this.empty(d.title)) return 'Say what the action is.';
      if (!this.has(d.sourceRel)) return 'An action belongs to an incident, a hazard or an inspection.';
      if (!this.has(d.controlLevelRel)) return 'Choose the control level.';
      if (!this.has(d.ownerRel)) return 'Choose who owns the action.';
      if (this.empty(d.dueDate)) return 'Choose when it is due.';
      if (status === 'Cancelled') return this.empty(d.cancelReason) ? 'Say why the action is cancelled.' : '';
      var limit = this.actionDueLimit(d);
      if (limit && Date.parse(d.dueDate) > limit.at + 60000 && status !== 'Completed' && status !== 'Verified') {
        if (this.empty(d.extensionReason)) return 'A ' + limit.rating + ' risk action is due within ' + limit.days + (limit.days === 1 ? ' day' : ' days') + ' of being raised, by ' + this.when(limit.at) + '. Give a reason for a later date.';
        // Compared as instants: on the server, dates read back from the database are Date objects.
        if (!(who.isManager || who.isWhs) && Date.parse(d.approvedDueDate) !== Date.parse(d.dueDate)) return 'A later due date needs a manager or a WHS advisor: ask one to approve it.';
      }
      if (status === 'Completed' || status === 'Verified') {
        if (this.empty(d.completionNotes)) return 'Say what was done.';
        var rating = (this.first(d.sourceRel) || {}).riskRating;
        if (moved && (rating === 'High' || rating === 'Extreme') && !this.has(d.evidenceArr)) return 'Attach evidence (a photo or a document) for a ' + rating + ' risk action.';
      }
      if (moved && status === 'Verified') {
        var owner = this.first(d.ownerRel) || {};
        if (owner.documentId && owner.documentId === who.userId) return "You own this action, so someone else verifies it.";
      }
      return '';
    },

    validateInspection : function (d, who) {
      var status = this.statusName(d.inspectionStatusRel);
      var from = d.lastStatus || '';
      if (!from && status !== 'Scheduled' && status !== 'In Progress') return 'A new inspection starts as Scheduled or In Progress.';
      if (!this.allowedMove(${json(TRANSITIONS.inspectionStatus)}, from, status)) return "An inspection can't go from " + from + ' to ' + status + '.';
      if (from && from !== status && status === 'Cancelled' && !(who.isWhs || who.isManager)) return 'A WHS advisor or a manager cancels inspections.';
      if (!this.has(d.siteRel)) return 'Choose the site.';
      if (!this.has(d.checkSheetRel)) return 'Choose the checklist.';
      if (this.empty(d.scheduledDate)) return 'Choose when it is scheduled.';
      if ((status === 'In Progress' || status === 'Completed') && !this.has(d.inspectorRel)) return 'Choose the inspector.';
      if (status === 'Completed') {
        var o = this.checklistOutcome(d.checkItems, { commentOnFail: true, failLabel: 'Hazards found' });
        if (!o.total) return 'The checklist has no checks.';
        if (o.missingMandatory.length) return 'Answer every required check: ' + o.missingMandatory.slice(0, 3).join('; ') + (o.missingMandatory.length > 3 ? '…' : '') + '.';
        if (o.failsWithoutComment.length) return 'Say what is wrong for each failed check: ' + o.failsWithoutComment.slice(0, 3).join('; ') + '.';
      }
      return '';
    }`;

/** A safety ruleset's DSL: the shared helpers, the safety ones, the logic and the validators. */
const ruleset = (name, rules) => rulesetDsl(name, { lib: [COMMON_LIB, whenLib(TIME_ZONE), WHS_LIB, LOGIC_LIB, VALIDATE_LIB], rules });

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
      ntf.meValue = { documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '', email: user.email || null, accountType: user.accountType || null };
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

/** The server check every validator gets: enforce, and stop the save with the reason (no trailing comma). */
const serverValidate = (validator) => `
  ruleValidate : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var message = ntf.lib.${validator}(ntf.document, ntf.who);
      if (message) ntf.errorMessage = message;
    }
  }`;

/** A ruleset's view rule runs on load and when one of these fields changes. */
const onChange = (fields) => `function (ntf) { return ntf.isSetup || ${json(fields)}.indexOf(ntf.changed) > -1; }`;

// ------------------------------------------------------------------------------------------------
// Incident
// ------------------------------------------------------------------------------------------------

const INVESTIGATION_TEXT = {
  none: 'None: the supervisor\'s review is enough',
  supervisor: 'A supervisor\'s review, with findings',
  full: 'A full investigation, with root causes',
};

/**
 * @param {{ statuses: Record<string, Record<string, object>>, values: Record<string, Record<string, object>> }} o
 */
export function incidentClientRules({ statuses, values }) {
  return ruleset(
    'Safety Incident - Client',
    `${CLIENT_INIT}
${clientPreSave('validateIncident')}

  // A new report: you reported it, now, at your site; it happened now unless you say otherwise.
  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var now = new Date().toISOString();
      if (!ntf.lib.has(d.reportedByRel)) d.reportedByRel = [ntf.meValue];
      if (!d.reportedDate) d.reportedDate = now;
      if (!d.occurredDate) d.occurredDate = now;
      if (!ntf.lib.has(d.incidentStatusRel)) d.incidentStatusRel = [${json(statuses.incidentStatus.Reported)}];
      if (!ntf.lib.has(d.personTypeRel)) d.personTypeRel = [${json(values.personType.Employee)}];
      var mine = (ntf.context.user || {}).siteRel;
      if (!ntf.lib.has(d.siteRel) && ntf.lib.has(mine)) d.siteRel = mine;
    }
  },

  // What the form shows follows what the incident is: the injury section for injuries, the regulator
  // questions when it is notifiable, the investigation once it has been reviewed.
  ruleView : {
    ruleCondition : ${onChange(['incidentTypeRel', 'incidentStatusRel', 'riskAssessment', 'injuryNatureRel', 'treatmentRel', 'dangerousKindRel', 'injuryPins'])},
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var f = lib.incidentFacts(d);
      var status = lib.statusName(d.incidentStatusRel) || 'Reported';
      var dangerous = f.type === 'Dangerous incident';
      ntf.scope.showField('dangerousKindRel', dangerous);
      ntf.scope.mandateField('dangerousKindRel', dangerous);
      ntf.scope.showField('injuryPanel', f.isInjury || lib.has(d.injuryPins));
      ntf.scope.mandateField('treatmentRel', f.isInjury);
      ntf.scope.mandateField('injuryNatureRel', f.isInjury);
      ntf.scope.mandateField('injuryPins', f.type === 'Injury');
      d.notifiableBool = f.notice.notifiable;
      d.notifiableReasonsText = f.notice.reasons.join('; ');
      ['notifiableReasonsText', 'regulatorNotifiedDate', 'regulatorRef', 'sitePreservedBool'].forEach(function (name) { ntf.scope.showField(name, f.notice.notifiable); });
      var reviewed = status !== 'Reported';
      ntf.scope.mandateField('regulatorNotifiedDate', f.notice.notifiable && reviewed);
      ntf.scope.mandateField('regulatorRef', f.notice.notifiable && reviewed);
      d.investigationLevelText = ${json(INVESTIGATION_TEXT)}[f.investigation];
      ntf.scope.showField('investigationPanel', reviewed || f.investigation === 'full');
      ntf.scope.mandateField('investigatorRel', status === 'Investigating');
      ntf.scope.showField('actionsPanel', reviewed || ntf.who.isWhs);
      ntf.scope.showField('closePanel', ['Actions Pending', 'Closed', 'Rejected'].indexOf(status) > -1);
      ntf.scope.showField('rejectReason', status === 'Rejected');
      ntf.scope.mandateField('rejectReason', status === 'Rejected');
    }
  },

  // Once a report has been reviewed, the facts belong to the safety team: the reporter can still
  // add photos and notes.
  ruleReporterLock : {
    ruleCondition : function (ntf) { return ntf.isSetup && !ntf.isNew && !(ntf.who.isWhs || ntf.who.isManager || ntf.who.isSupervisor); },
    ruleAction : function (ntf) {
      if (ntf.lib.statusName(ntf.document.incidentStatusRel) === 'Reported') return;
      ['title', 'incidentTypeRel', 'dangerousKindRel', 'occurredDate', 'siteRel', 'exactLocation', 'locationGeo', 'description', 'immediateActions', 'injuryPins',
        'injuryNatureRel', 'mechanismRel', 'treatmentRel', 'riskAssessment', 'investigatorRel', 'rootCauseTree', 'investigationSummary']
        .forEach(function (name) { ntf.scope.enableField(name, false); });
    }
  }`,
  );
}

/**
 * @param {{ ratings: Record<string, object>, executives: object[] }} o - risk rating values by name; who signs off notifiable incidents
 */
export function incidentServerRules({ ratings, executives }) {
  return ruleset(
    'Safety Incident - PreSaveServer',
    `${SERVER_INIT}

  // Everything the incident's fields imply, kept on the record for lists, the map and the dashboard.
  ruleDerive : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var f = lib.incidentFacts(d);
      var ratings = ${json(ratings)};
      d.riskAssessment = f.risk || null;
      d.riskRating = f.rating;
      d.riskScoreNum = f.risk ? f.risk.score : null;
      d.riskRatingRel = f.rating ? [ratings[f.rating]] : [];
      d.injuryClass = f.injury ? f.injury.code : '';
      d.injuryClassLabel = f.injury ? f.injury.label : '';
      d.recordableBool = !!(f.injury && f.injury.recordable);
      d.lostTimeBool = !!(f.injury && f.injury.lostTime);
      d.notifiableBool = f.notice.notifiable;
      d.notifiableReasons = f.notice.reasons;
      d.notifiableReasonsText = f.notice.reasons.join('; ');
      d.bodyParts = lib.unique((d.injuryPins || []).map(function (p) { return p && p.region; }));
      d.investigationLevel = f.investigation;
      d.investigationLevelText = ${json(INVESTIGATION_TEXT)}[f.investigation];
      if (!d.reportedDate) d.reportedDate = new Date(ntf.now).toISOString();
      var delay = lib.reportingDelayHours(d.occurredDate, d.reportedDate);
      d.reportDelayHours = delay;
      d.lateReportBool = delay !== null && delay > ${LATE_REPORT_HOURS};
      if (f.response && d.responseRating !== f.rating) {
        d.responseRating = f.rating;
        d.responseDueDate = new Date(Date.parse(d.reportedDate) + f.response.respondHours * 3600000).toISOString();
      }
      if (f.investigation !== 'none' && !d.investigationDueDate && d.occurredDate) {
        var days = f.response && f.response.investigationDays ? f.response.investigationDays : 14;
        d.investigationDueDate = new Date(Date.parse(d.occurredDate) + days * 86400000).toISOString();
      }
      var move = lib.peekMove(ntf, 'incidentStatusRel');
      if (move && move.to === 'Closed') {
        d.closedByRel = [lib.me(ntf)];
        d.closedDate = move.at;
      } else if (move && move.from === 'Closed') {
        d.closedByRel = [];
        d.closedDate = null;
      }
      ntf.facts = f;
      ntf.move = move;
    }
  },
${serverValidate('validateIncident')},

  // An incident closes once its corrective actions are done: verified, for High and Extreme ones.
  ruleActionsDone : {
    ruleCondition : function (ntf) { return !ntf.errorMessage && !!ntf.move && ntf.move.to === 'Closed'; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.lib;
      var strict = ntf.facts.rating === 'High' || ntf.facts.rating === 'Extreme' || ntf.facts.notice.notifiable;
      var query = { size: 200, query: { bool: { filter: [{ term: { appTags: 'whs' } }, { term: { appTags: 'action' } }, { term: { 'sourceRel.documentId': ntf.document.documentId } }] } } };
      lib.search(ntf, query, function (err, actions) {
        var open = (actions || []).filter(function (a) {
          var s = lib.statusName(a.actionStatusRel);
          return s === 'Open' || s === 'In Progress' || (strict && s === 'Completed');
        });
        if (open.length) {
          var refs = open.slice(0, 4).map(function (a) { return a.actionRef || a.title; }).join(', ');
          ntf.errorMessage = open.length + (open.length === 1 ? ' corrective action is' : ' corrective actions are') + ' still ' + (strict ? 'open or not yet verified' : 'open') + ' (' + refs + (open.length > 4 ? '…' : '') + '). Finish or cancel ' + (open.length === 1 ? 'it' : 'them') + ' before closing.';
        }
        callback();
      });
    }
  },

  // Who hears about it: as the rating rises (or it turns out to be notifiable), the people its
  // response lists are told, and the record says so in its activity.
  ruleEscalate : {
    ruleCondition : function (ntf) { return !ntf.errorMessage && !!ntf.facts.rating; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var f = ntf.facts;
      var order = ['', 'Low', 'Medium', 'High', 'Extreme'];
      var risen = order.indexOf(f.rating) > order.indexOf(d.escalationLevel || '');
      var newlyNotifiable = f.notice.notifiable && !d.regulatorAlertBool;
      if (!risen && !newlyNotifiable) return;
      var site = lib.first(d.siteRel) || {};
      var byRole = {
        Supervisor: (site.supervisorRel || []).map(lib.personValue),
        'WHS Advisor': (site.whsAdvisorRel || []).map(lib.personValue),
        'Site Manager': (site.siteManagerRel || []).map(lib.personValue),
        Executive: ${json(executives)}
      };
      var roles = f.response.notify.slice();
      if (f.notice.notifiable && roles.indexOf('Executive') === -1) roles.push('Executive');
      var told = [];
      var already = (d.notifiedRel || []).map(function (p) { return p.documentId; });
      roles.forEach(function (role) {
        (byRole[role] || []).forEach(function (p) {
          if (!p || !p.documentId || already.indexOf(p.documentId) > -1) return;
          already.push(p.documentId);
          told.push({ documentId: p.documentId, name: p.name, role: role });
        });
      });
      d.notifiedRel = (d.notifiedRel || []).concat(told.map(function (p) { return { documentId: p.documentId, name: p.name }; }));
      if (risen) d.escalationLevel = f.rating;
      var lines = ['**' + f.rating + ' risk' + (f.notice.notifiable ? ', notifiable' : '') + '.**'];
      if (told.length) lines.push('Told ' + told.map(function (p) { return p.name + ' (' + p.role + ')'; }).join(', ') + '.');
      lines.push('Triage by ' + lib.when(d.responseDueDate) + '; actions due within ' + f.response.actionDays + (f.response.actionDays === 1 ? ' day.' : ' days.'));
      if (newlyNotifiable) {
        d.regulatorAlertBool = true;
        lines.push('**Notifiable**: ' + f.notice.reasons.join('; ') + '. Tell the regulator immediately, and leave the site undisturbed until an inspector releases it.');
      }
      lib.systemNote(ntf, lines.join(' '));
    }
  },
  // Last: record the move (lastStatus, and transition for the PostSave rule), after the validators
  // and checks have compared against the previous status.
  ruleTransition : {
    ruleCondition : true,
    ruleAction : function (ntf) { ntf.lib.transition(ntf, 'incidentStatusRel'); }
  }`,
  );
}

/** PostSave: the site remembers its latest incident and lost time injury (the map's site popup). */
export function incidentPostRules() {
  return ruleset(
    'Safety Incident - PostSave',
    `
  ruleSiteDates : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && ntf.ruleset.lib.has(ntf.document.siteRel) && !!ntf.document.occurredDate; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var site = lib.first(d.siteRel);
      lib.byId(ntf, site.documentId, function (err, current) {
        if (!current) { callback(); return; }
        var change = {};
        var at = Date.parse(d.occurredDate);
        if (!current.lastIncidentDate || at > Date.parse(current.lastIncidentDate)) change.lastIncidentDate = d.occurredDate;
        if (d.lostTimeBool && (!current.lastLtiDate || at > Date.parse(current.lastLtiDate))) change.lastLtiDate = d.occurredDate;
        if (!Object.keys(change).length) { callback(); return; }
        lib.update(ntf, site.documentId, change, callback);
      });
    }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Hazard
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function hazardClientRules({ statuses }) {
  return ruleset(
    'Safety Hazard - Client',
    `${CLIENT_INIT}
${clientPreSave('validateHazard')}

  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      if (!ntf.lib.has(d.reportedByRel)) d.reportedByRel = [ntf.meValue];
      if (!d.reportedDate) d.reportedDate = new Date().toISOString();
      if (!ntf.lib.has(d.hazardStatusRel)) d.hazardStatusRel = [${json(statuses.hazardStatus.Reported)}];
      var mine = (ntf.context.user || {}).siteRel;
      if (!ntf.lib.has(d.siteRel) && ntf.lib.has(mine)) d.siteRel = mine;
    }
  },

  // Reporting a hazard asks only what it is and where; assessing it brings in the risk, the controls
  // and an owner. A High or Extreme hazard may need a justification of its controls.
  ruleView : {
    ruleCondition : ${onChange(['hazardStatusRel', 'inherentRisk', 'residualRisk', 'sourceRel'])},
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var status = lib.statusName(d.hazardStatusRel) || 'Reported';
      var assessed = status !== 'Reported' && status !== 'Rejected';
      var inherent = lib.rated(d.inherentRisk);
      ntf.scope.showField('controlsPanel', assessed);
      ntf.scope.showField('residualPanel', assessed);
      ntf.scope.mandateField('inherentRisk', assessed);
      ntf.scope.mandateField('ownerRel', assessed);
      ntf.scope.mandateField('residualRisk', status === 'Controlled' || status === 'Closed');
      ntf.scope.showField('justification', !!inherent && (inherent.rating === 'High' || inherent.rating === 'Extreme'));
      ntf.scope.showField('closeNotes', status === 'Closed');
      ntf.scope.mandateField('closeNotes', status === 'Closed');
      ntf.scope.showField('sourceRel', lib.has(d.sourceRel));
    }
  }`,
  );
}

/**
 * @param {{ ratings: Record<string, object> }} o
 */
export function hazardServerRules({ ratings }) {
  return ruleset(
    'Safety Hazard - PreSaveServer',
    `${SERVER_INIT}

  ruleDerive : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var ratings = ${json(ratings)};
      var inherent = lib.rated(d.inherentRisk);
      var residual = lib.rated(d.residualRisk);
      var current = residual || inherent;
      d.inherentRisk = inherent;
      d.residualRisk = residual;
      d.inherentRating = inherent ? inherent.rating : '';
      d.inherentScoreNum = inherent ? inherent.score : null;
      d.inherentRatingRel = inherent ? [ratings[inherent.rating]] : [];
      d.residualRating = residual ? residual.rating : '';
      d.residualScoreNum = residual ? residual.score : null;
      d.residualRatingRel = residual ? [ratings[residual.rating]] : [];
      d.currentRisk = current;
      d.currentRating = current ? current.rating : '';
      d.currentRatingRel = current ? [ratings[current.rating]] : [];
      if (!d.reportedDate) d.reportedDate = new Date(ntf.now).toISOString();
      var move = lib.peekMove(ntf, 'hazardStatusRel');
      if (move && move.to === 'Controlled' && residual) {
        d.lastReviewDate = move.at;
        d.reviewDate = lib.nextReviewDate(ntf.now, residual.rating);
      }
      ntf.move = move;
    }
  },
${serverValidate('validateHazard')},

  // Controls Pending needs planned controls; Controlled needs them in place, strong enough for the
  // risk (the hierarchy of controls), and none still open.
  ruleControls : {
    ruleCondition : function (ntf) { return !ntf.errorMessage && !!ntf.move && (ntf.move.to === 'Controls Pending' || ntf.move.to === 'Controlled'); },
    ruleAction : function (ntf, callback) {
      var lib = ntf.lib;
      var d = ntf.document;
      var query = { size: 200, query: { bool: { filter: [{ term: { appTags: 'whs' } }, { term: { appTags: 'action' } }, { term: { 'sourceRel.documentId': d.documentId } }] } } };
      lib.search(ntf, query, function (err, actions) {
        var list = (actions || []).map(function (a) {
          return { ref: a.actionRef || a.title, status: lib.statusName(a.actionStatusRel), dueDate: a.dueDate, controlLevel: lib.statusName(a.controlLevelRel) };
        }).filter(function (a) { return a.status !== 'Cancelled'; });
        if (ntf.move.to === 'Controls Pending') {
          if (!list.length) ntf.errorMessage = 'Add the controls you plan before moving the hazard to Controls Pending.';
          callback();
          return;
        }
        var open = list.filter(function (a) { return a.status === 'Open' || a.status === 'In Progress'; });
        if (open.length) {
          ntf.errorMessage = 'Some controls are not in place yet (' + open.slice(0, 4).map(function (a) { return a.ref; }).join(', ') + '). Finish or cancel them first.';
          callback();
          return;
        }
        var inPlace = lib.actionsSummary(list, ntf.now);
        var problem = lib.controlProblem({ inherent: d.inherentRating, residual: d.residualRating, strongestRank: inPlace.strongestRank, justification: d.justification });
        if (problem) ntf.errorMessage = problem;
        callback();
      });
    }
  },
  // Last: record the move (lastStatus, and transition for the PostSave rule), after the validators
  // and checks have compared against the previous status.
  ruleTransition : {
    ruleCondition : true,
    ruleAction : function (ntf) { ntf.lib.transition(ntf, 'hazardStatusRel'); }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Corrective action
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function actionClientRules({ statuses }) {
  return ruleset(
    'Safety Action - Client',
    `${CLIENT_INIT}
${clientPreSave('validateAction')}

  // A new action is Open, raised now, and due as soon as its source's rating asks.
  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      if (!d.raisedDate) d.raisedDate = new Date().toISOString();
      if (!lib.has(d.actionStatusRel)) d.actionStatusRel = [${json(statuses.actionStatus.Open)}];
      var limit = lib.actionDueLimit(d);
      if (!d.dueDate && limit) d.dueDate = new Date(limit.at).toISOString();
    }
  },

  ruleView : {
    ruleCondition : ${onChange(['actionStatusRel', 'dueDate', 'sourceRel'])},
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var status = lib.statusName(d.actionStatusRel) || 'Open';
      var limit = lib.actionDueLimit(d);
      var late = !!limit && !!d.dueDate && Date.parse(d.dueDate) > limit.at + 60000;
      var done = status === 'Completed' || status === 'Verified';
      var rating = (lib.first(d.sourceRel) || {}).riskRating;
      ntf.scope.showField('extensionReason', late || !lib.empty(d.extensionReason));
      ntf.scope.mandateField('extensionReason', late && !done);
      ntf.scope.mandateField('completionNotes', done);
      ntf.scope.mandateField('evidenceArr', done && (d.lastStatus || '') !== status && (rating === 'High' || rating === 'Extreme'));
      ntf.scope.showField('verificationPanel', done);
      ntf.scope.showField('cancelReason', status === 'Cancelled');
      ntf.scope.mandateField('cancelReason', status === 'Cancelled');
    }
  }`,
  );
}

/**
 * @param {{ ratings: Record<string, object> }} o
 */
export function actionServerRules({ ratings }) {
  return ruleset(
    'Safety Action - PreSaveServer',
    `${SERVER_INIT}

  ruleDerive : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var ratings = ${json(ratings)};
      if (!d.raisedDate) d.raisedDate = new Date(ntf.now).toISOString();
      var source = lib.first(d.sourceRel) || {};
      d.riskRatingRel = ratings[source.riskRating] ? [ratings[source.riskRating]] : [];
      d.controlRankNum = lib.controlRank(lib.statusName(d.controlLevelRel));
      // A manager or WHS advisor saving a later due date approves it.
      var limit = lib.actionDueLimit(d);
      if (limit && d.dueDate && Date.parse(d.dueDate) > limit.at + 60000 && (ntf.who.isManager || ntf.who.isWhs) && !lib.empty(d.extensionReason)) {
        d.approvedDueDate = d.dueDate;
        d.extensionApprovedByRel = [lib.me(ntf)];
      }
      var move = lib.peekMove(ntf, 'actionStatusRel');
      if (move) {
        if (move.to === 'Completed' && !d.completedDate) d.completedDate = move.at;
        if (move.to === 'Verified') {
          d.verifiedByRel = [lib.me(ntf)];
          d.verifiedDate = move.at;
          if (!d.completedDate) d.completedDate = move.at;
        }
        if (move.to === 'Open' || move.to === 'In Progress') {
          d.completedDate = null;
          d.verifiedByRel = [];
          d.verifiedDate = null;
        }
      }
    }
  },
${serverValidate('validateAction')},
  // Last: record the move (lastStatus, and transition for the PostSave rule), after the validators
  // and checks have compared against the previous status.
  ruleTransition : {
    ruleCondition : true,
    ruleAction : function (ntf) { ntf.lib.transition(ntf, 'actionStatusRel'); }
  }`,
  );
}

/** PostSave: the record an action belongs to keeps count of its actions, and hears when they are all done. */
export function actionPostRules() {
  const levels = CONTROL_LEVELS.map((l) => l.name);
  return ruleset(
    'Safety Action - PostSave',
    `
  ruleRecount : {
    ruleCondition : function (ntf) { return ntf.ruleset.lib.has(ntf.document.sourceRel); },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var source = lib.first(d.sourceRel);
      var query = { size: 200, query: { bool: { filter: [{ term: { appTags: 'whs' } }, { term: { appTags: 'action' } }, { term: { 'sourceRel.documentId': source.documentId } }] } } };
      lib.search(ntf, query, function (err, found) {
        // Search may not have this save yet: use the saved action itself.
        var list = (found || []).filter(function (a) { return a.documentId !== d.documentId; }).concat([d]);
        var items = list.map(function (a) { return { status: lib.statusName(a.actionStatusRel), dueDate: a.dueDate, controlLevel: lib.statusName(a.controlLevelRel) }; });
        var all = lib.actionsSummary(items, Date.now());
        var inPlace = lib.actionsSummary(items.filter(function (a) { return a.status === 'Completed' || a.status === 'Verified'; }), Date.now());
        var levels = ${json(levels)};
        var change = {
          actionsTotalNum: all.total,
          actionsOpenNum: all.open,
          actionsDoneNum: all.done,
          actionsOverdueNum: all.overdue,
          strongestControl: inPlace.strongestRank < 99 ? levels[inPlace.strongestRank - 1] : ''
        };
        lib.byId(ntf, source.documentId, function (err2, current) {
          if (!current) { callback(); return; }
          var finished = all.total > 0 && all.open === 0 && (current.actionsOpenNum || 0) > 0;
          if (finished && lib.statusName(current.incidentStatusRel) === 'Actions Pending') {
            var notes = (current.notesCommentsArr || []).slice();
            notes.push({ dataId: 'note-' + Date.now().toString(36), detail: '**All ' + all.total + ' corrective actions are done.** Ready for sign-off.', createdBy: lib.me(ntf), createdDate: new Date().toISOString(), comments: [], votes: [] });
            change.notesCommentsArr = notes;
          }
          lib.update(ntf, source.documentId, change, callback);
        });
      });
    }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Inspection
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function inspectionClientRules({ statuses }) {
  return ruleset(
    'Safety Inspection - Client',
    `${CLIENT_INIT}
${clientPreSave('validateInspection')}

  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      if (!ntf.lib.has(d.inspectionStatusRel)) d.inspectionStatusRel = [${json(statuses.inspectionStatus['In Progress'])}];
      if (!d.scheduledDate) d.scheduledDate = new Date().toISOString();
      if (!ntf.lib.has(d.inspectorRel)) d.inspectorRel = [ntf.meValue];
      var mine = (ntf.context.user || {}).siteRel;
      if (!ntf.lib.has(d.siteRel) && ntf.lib.has(mine)) d.siteRel = mine;
      var site = ntf.lib.first(d.siteRel) || {};
      if (!ntf.lib.has(d.checkSheetRel) && ntf.lib.has(site.checkSheetRel)) d.checkSheetRel = site.checkSheetRel;
    }
  },

  // The site's checklist, unless one was chosen.
  ruleChecklist : {
    ruleCondition : function (ntf) { return ntf.changed === 'siteRel'; },
    ruleAction : function (ntf) {
      var site = ntf.lib.first(ntf.document.siteRel) || {};
      if (!ntf.lib.has(ntf.document.checkSheetRel) && ntf.lib.has(site.checkSheetRel)) ntf.document.checkSheetRel = site.checkSheetRel;
    }
  },

  ruleView : {
    ruleCondition : ${onChange(['inspectionStatusRel'])},
    ruleAction : function (ntf) {
      var status = ntf.lib.statusName(ntf.document.inspectionStatusRel) || 'Scheduled';
      ntf.scope.mandateField('inspectorRel', status === 'In Progress' || status === 'Completed');
      ntf.scope.showField('raisedHazardsDt', status === 'Completed');
      if (status === 'Completed') ['siteRel', 'checkSheetRel', 'scheduledDate', 'checkItems'].forEach(function (name) { ntf.scope.enableField(name, false); });
    }
  }`,
  );
}

export function inspectionServerRules() {
  return ruleset(
    'Safety Inspection - PreSaveServer',
    `${SERVER_INIT}

  ruleDerive : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var lib = ntf.lib;
      var o = lib.checklistOutcome(d.checkItems, { commentOnFail: true, failLabel: 'Hazards found' });
      d.totalNum = o.total;
      d.answeredNum = o.answered;
      d.passedNum = o.passed;
      d.failedNum = o.failed;
      d.naNum = o.na;
      var move = lib.peekMove(ntf, 'inspectionStatusRel');
      if (move && move.to === 'Completed') {
        d.completedDate = move.at;
        d.resultText = o.result;
      } else if (move && move.from === 'Completed') {
        d.completedDate = null;
        d.resultText = '';
      }
    }
  },
${serverValidate('validateInspection')},
  // Last: record the move (lastStatus, and transition for the PostSave rule), after the validators
  // and checks have compared against the previous status.
  ruleTransition : {
    ruleCondition : true,
    ruleAction : function (ntf) { ntf.lib.transition(ntf, 'inspectionStatusRel'); }
  }`,
  );
}

/**
 * PostSave: a completed inspection raises a hazard for each failed check (once), and books the
 * site's next inspection.
 * @param {{ statuses: Record<string, Record<string, object>>, values: Record<string, Record<string, object>>, hazardTemplateId: string, inspectionTemplateId: string }} o
 */
export function inspectionPostRules({ statuses, values, hazardTemplateId, inspectionTemplateId }) {
  const categoryValue = Object.fromEntries(Object.entries(CHECK_CATEGORY_HAZARD).map(([check, hazard]) => [check, values.hazardCategory[hazard]]));
  return ruleset(
    'Safety Inspection - PostSave',
    `
  ruleRaiseHazards : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && ntf.document.transition.to === 'Completed'; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var categories = ${json(categoryValue)};
      var fallback = ${json(values.hazardCategory['Slips, trips and falls'])};
      var source = [{ documentId: d.documentId, name: d.systemHeader.summaryName, ref: d.inspectionRef || '', kind: 'inspection' }];
      var failed = (d.checkItems || []).filter(function (c) { return c.result === 'fail'; });
      var query = { size: 200, query: { bool: { filter: [{ term: { appTags: 'whs' } }, { term: { appTags: 'hazard' } }, { term: { 'sourceRel.documentId': d.documentId } }] } } };
      lib.search(ntf, query, function (err, existing) {
        var raised = (existing || []).map(function (h) { return h.sourceItemKey; });
        var todo = failed.filter(function (c) { return raised.indexOf(c.key) === -1; });
        var next = function (i) {
          if (i >= todo.length) { callback(); return; }
          var c = todo[i];
          var hazard = {
            appTags: ['whs', 'hazard'],
            title: String(c.question).slice(0, 120),
            hazardCategoryRel: [categories[c.category] || fallback],
            hazardStatusRel: [${json(statuses.hazardStatus.Reported)}],
            siteRel: d.siteRel,
            description: (c.comment || 'Failed at inspection.') + '\\n\\nRaised by ' + (d.inspectionRef || 'an inspection') + ' (' + (c.category || 'checks') + ').',
            reportedByRel: d.inspectorRel,
            reportedDate: new Date().toISOString(),
            sourceRel: source,
            sourceItemKey: c.key
          };
          lib.create(ntf, hazard, ${json(hazardTemplateId)}, function () { next(i + 1); });
        };
        next(0);
      });
    }
  },

  ruleNextInspection : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && ntf.document.transition.to === 'Completed'; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var site = lib.first(d.siteRel) || {};
      var weeks = Number(site.inspectionWeeksNum) || 0;
      if (!weeks) { callback(); return; }
      var query = { size: 1, query: { bool: { filter: [{ term: { appTags: 'whs' } }, { term: { appTags: 'inspection' } }, { term: { 'siteRel.documentId': site.documentId } }, { term: { 'inspectionStatusRel.name': 'Scheduled' } }] } } };
      lib.search(ntf, query, function (err, scheduled) {
        if (scheduled && scheduled.length) { callback(); return; }
        var next = {
          appTags: ['whs', 'inspection'],
          siteRel: d.siteRel,
          checkSheetRel: d.checkSheetRel,
          inspectorRel: d.inspectorRel,
          inspectionStatusRel: [${json(statuses.inspectionStatus.Scheduled)}],
          scheduledDate: new Date(Date.parse(d.completedDate || new Date().toISOString()) + weeks * 7 * 86400000).toISOString(),
          checkItems: []
        };
        lib.create(ntf, next, ${json(inspectionTemplateId)}, function () { callback(); });
      });
    }
  }`,
  );
}

/** For tests: the validator library alone. */
export const VALIDATORS = { WHS_LIB, LOGIC_LIB, VALIDATE_LIB };

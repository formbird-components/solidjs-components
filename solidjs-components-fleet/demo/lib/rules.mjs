// Fleet rulesets, in the structure SDMS and the internal demo use ({ #include …, ruleset: { ruleX } }).
//
// The business logic the elements also use (overlaps, hire cost, service due, checklist outcome,
// meter and fuel checks, line totals) is not rewritten here: each ruleset carries those functions'
// own source in `ruleset.lib` (JayRule only runs keys starting with "rule"), imported from
// packages/fleet-kit/src/logic, so the browser and the server apply one implementation.
//
// The scaffolding (shared helpers, the async-callback guard, status transitions against `lastStatus`,
// the client PreSave rule) comes from solidjs-components-shared's platform (packages/platform/rules.mjs).

import { bookingTimeProblems, hireCost, hireHours, overlaps, UNRETURNED_BLOCK_MS } from '../../packages/fleet-kit/src/logic/booking.ts';
import { checklistOutcome } from '../../../solidjs-components-shared/packages/kit/src/domain/checklist.ts';
import { fuelCheck, meterProblems } from '../../packages/fleet-kit/src/logic/meter.ts';
import { lineTotals } from '../../packages/fleet-kit/src/logic/money.ts';
import { nextServiceDue, serviceWarning } from '../../packages/fleet-kit/src/logic/service.ts';
import { IN_WORKSHOP, TRANSITIONS } from './catalog.mjs';
import { KEYS, MAX_BOOKING_HOURS, TIME_ZONE } from './model.mjs';
import { clientPreSave, COMMON_LIB, functionsLib, rulesetDsl, whenLib } from '@solidjs-components/platform/rules';

const json = (value) => JSON.stringify(value);

/** What fleet rulesets carry besides the shared helpers: who is saving, dates and meters as people read them. */
const FLEET_LIB = `
    // Who is saving: from access keys on the server, from the account type in the browser (they match).
    whoFromKeys : function (ntf) {
      return { isManager: this.hasKey(ntf, ${json(KEYS.manager)}), isWorkshop: this.hasKey(ntf, ${json(KEYS.workshop)}), isSupervisor: this.hasKey(ntf, ${json(KEYS.supervisor)}) };
    },
    whoFromAccount : function (ntf) {
      var type = (ntf.context.user || {}).accountType || '';
      return { isManager: type === 'Administrator' || type === 'Asset Manager', isWorkshop: ['Administrator', 'Supervisor', 'Technician'].indexOf(type) > -1, isSupervisor: type === 'Administrator' || type === 'Supervisor' };
    },
    meterText : function (value, unit) {
      if (value === null || value === undefined || value === '') return '';
      return Number(value).toLocaleString('en-AU') + ' ' + (unit === 'hours' ? 'hours' : 'km');
    }`;

/** The logic functions, as their own source (type-stripped by Node when this module loads). */
const LOGIC_LIB = functionsLib([overlaps, hireHours, hireCost, bookingTimeProblems, nextServiceDue, serviceWarning, checklistOutcome, meterProblems, fuelCheck, lineTotals]);

/**
 * What makes a record invalid, checked the same way in the browser (client PreSave rule, which
 * shows the reason) and on the server (PreSaveServer rule, which enforces it). `who` says whether
 * the person saving is an asset manager, workshop staff or a workshop supervisor.
 * Each returns a message, or '' when the record is fine.
 */
const VALIDATE_LIB = `
    // Each validator checks a new record's starting status itself (lib.allowedMove allows any start).
    validateBooking : function (d, who) {
      var status = this.statusName(d.bookingStatusRel);
      var from = d.lastStatus || '';
      if (!from && status !== 'Asset Reserved') return 'A new booking starts as Asset Reserved.';
      if (!this.allowedMove(${json(TRANSITIONS.bookingStatus)}, from, status)) return 'A booking can\\'t go from ' + from + ' to ' + status + '.';
      var asset = this.first(d.assetRel) || {};
      if (!asset.documentId) return 'Choose the asset to book.';
      if (status === 'Asset Reserved') {
        var problems = this.bookingTimeProblems({ start: d.startDate, end: d.endDate, maxHours: asset.maxBookingHours, defaultMaxHours: ${MAX_BOOKING_HOURS} });
        if (who.isManager) problems = problems.filter(function (p) { return p.indexOf('at most') === -1; });
        if (problems.length) return problems.join(' ');
      }
      if ((status === 'Hire Commenced' || status === 'Closed') && this.empty(d.startMeterNum)) return 'Enter the meter reading at the start of the hire.';
      if (status === 'Closed') {
        if (this.empty(d.endMeterNum)) return 'Enter the meter reading at the end of the hire.';
        var meter = this.meterProblems({ reading: d.endMeterNum, minimum: d.startMeterNum, unit: asset.primaryMeterUnit });
        if (meter.length) return meter.join(' ');
      }
      if (status === 'Cancelled' && !(d.cancelReasonRel && d.cancelReasonRel.length)) return 'Choose a Reason For Cancellation.';
      return '';
    },
    validateRequest : function (d, who) {
      var status = this.statusName(d.requestStatusRel);
      var from = d.lastStatus || '';
      if (!from && status !== 'Pending' && !(status === 'Open' && who.isWorkshop)) return who.isWorkshop ? 'A new request starts as Pending or Open.' : 'A new request starts as Pending, for a workshop supervisor to triage.';
      if (!this.allowedMove(${json(TRANSITIONS.requestStatus)}, from, status)) return 'A request can\\'t go from ' + from + ' to ' + status + '.';
      if (from && from !== status) {
        var supervisorOnly = ['Open', 'Closed', 'Cancelled', 'Pending'].indexOf(status) > -1;
        if (supervisorOnly ? !who.isSupervisor : !who.isWorkshop) return 'Only ' + (supervisorOnly ? 'a workshop supervisor' : 'the workshop') + ' can move a request to ' + status + '.';
      }
      if (status === 'Cancelled' && !(d.closeReasonRel && d.closeReasonRel.length)) return 'Choose a Reason For Closing.';
      if (d.deferredBool && !d.deferredReason) return 'Give the Reason Deferred.';
      return '';
    },
    validateWorkOrder : function (d, who) {
      if (!(d.requestRel && d.requestRel.length)) return 'Choose the request this work order is for.';
      var status = this.statusName(d.workOrderStatusRel);
      var from = d.lastStatus || '';
      if (!from && !who.isWorkshop) return 'Only the workshop raises work orders.';
      if (!from && status !== 'New' && status !== 'In Progress') return 'A new work order starts as New or In Progress.';
      if (!this.allowedMove(${json(TRANSITIONS.workOrderStatus)}, from, status)) return 'A work order can\\'t go from ' + from + ' to ' + status + '.';
      if (from && from !== status && !who.isWorkshop) return 'Only the workshop can move a work order to ' + status + '.';
      if (from === 'Complete' && status !== 'Complete' && !who.isSupervisor) return 'Only a workshop supervisor can reopen a completed work order.';
      if (status === 'On Hold' && !d.onHoldReason) return 'Give the Reason On Hold.';
      if (status !== 'Complete') return '';
      if (!d.workCompleted) return 'Describe the Work Completed.';
      if (this.statusName(d.workOrderTypeRel) === 'PM Service') {
        if (!d.dateAtService || this.empty(d.meterAtServiceNum)) return 'A PM Service needs the Date at Service and the Meter at Service.';
        var outcome = this.checklistOutcome(d.serviceChecksArr, { commentOnFail: true });
        if (outcome.total && outcome.answered < outcome.total) return 'Answer every service check (' + (outcome.total - outcome.answered) + ' left).';
        if (outcome.failsWithoutComment.length) return 'Say what is wrong with: ' + outcome.failsWithoutComment.join(', ') + '.';
      }
      return '';
    },
    validateAsset : function (d, who) {
      var from = d.lastStatus || '';
      var to = this.statusName(d.assetStatusRel);
      if (!from && to !== 'Commission' && !(to === 'Active' && who.isManager)) return 'A new asset starts as Commission.';
      if (from && from !== to && !who.isManager) return 'Only an Asset Manager can move an asset from ' + from + ' to ' + to + '.';
      if (!this.allowedMove(${json(TRANSITIONS.assetStatus)}, from, to)) return 'An asset can\\'t go from ' + from + ' to ' + to + '.';
      if (to === 'Disposed' && !(d.disposedByRel && d.disposedByRel.length)) return 'Choose how the asset was disposed of (Disposed By).';
      if (d.allocationStatus !== 'Unassigned' && !(d.responsiblePersonRel && d.responsiblePersonRel.length)) return 'Choose a Responsible Person, or set the allocation to Unassigned.';
      return '';
    },
    validateDailyDriver : function (d) {
      var outcome = this.checklistOutcome(d.checksArr, { commentOnFail: true });
      if (!outcome.total) return 'There are no checks to answer: choose the asset first.';
      if (outcome.missingMandatory.length) return 'Mandatory Check Not Completed: ' + outcome.missingMandatory.join(', ') + '.';
      if (outcome.failsWithoutComment.length) return 'Say what is wrong with: ' + outcome.failsWithoutComment.join(', ') + '.';
      if (outcome.failed) {
        if (!d.defectDescription) return 'Describe the defect.';
        if (!(d.defectPriorityRel && d.defectPriorityRel.length)) return 'Choose the defect priority.';
        if (!d.inspectionCompleteBool) return 'Tick Defect Inspection Complete to submit.';
      }
      return '';
    }`;

/** A fleet ruleset's DSL: the shared helpers, the fleet ones, and with `logic` the logic and validators. */
const ruleset = (name, rules, { logic = false } = {}) =>
  rulesetDsl(name, { lib: [COMMON_LIB, whenLib(TIME_ZONE), FLEET_LIB, ...(logic ? [LOGIC_LIB, VALIDATE_LIB] : [])], rules });

/** Client rules: what every form does on PreRender / OnLoad. */
const CLIENT_INIT = `
  ruleInitialise : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      ntf.isSetup = ntf.context.eventName === 'PreRender' || ntf.context.eventName === 'OnLoad';
      ntf.lib = ntf.ruleset.lib;
      var user = ntf.context.user || {};
      ntf.accountType = user.accountType || '';
      ntf.who = ntf.lib.whoFromAccount(ntf);
      ntf.isManager = ntf.who.isManager;
      ntf.isWorkshop = ntf.who.isWorkshop;
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
      ntf.isManager = ntf.who.isManager;
      ntf.isWorkshop = ntf.who.isWorkshop;
      ntf.isSupervisor = ntf.who.isSupervisor;
      ntf.lib.authorship(ntf);
    }
  },`;

// ------------------------------------------------------------------------------------------------
// Asset
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o - status values by kind and name
 */
export function assetClientRules({ statuses }) {
  return ruleset(
    'Fleet Asset - Client',
    `${CLIENT_INIT}
${clientPreSave('validateAsset')}

  // A new asset is commissioned before it can be booked.
  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      if (!(d.assetStatusRel && d.assetStatusRel.length)) d.assetStatusRel = [${json(statuses.assetStatus.Commission)}];
      if (!(d.hireStatusRel && d.hireStatusRel.length)) d.hireStatusRel = [${json(statuses.hireStatus['Unavailable For Hire'])}];
      if (!d.allocationStatus) d.allocationStatus = 'Unassigned';
      if (d.bookableBool === undefined) d.bookableBool = true;
      if (d.includeInMapBool === undefined) d.includeInMapBool = true;
      if (d.dailyDriverRequiredBool === undefined) d.dailyDriverRequiredBool = true;
      if (!d.primaryMeterUnit) d.primaryMeterUnit = 'km';
    }
  },

  // Choosing a type brings its defaults: meter, booking limits, rates, check sheet, service plan, fuel.
  ruleTypeDefaults : {
    ruleCondition : function (ntf) { return ntf.context.fieldChanged === 'assetTypeRel'; },
    ruleAction : function (ntf) {
      var type = ntf.lib.first(ntf.document.assetTypeRel);
      if (!type) return;
      var copy = { primaryMeterUnit: type.primaryMeter, maxBookingHours: type.maxBookingHours, hireRateHourly: type.hireRateHourly,
        hireRateDaily: type.hireRateDaily, checkSheetRel: type.checkSheetRel, servicePlanRel: type.servicePlanRel,
        fuelTypeRel: type.fuelTypeRel, tankCapacityL: type.tankCapacityL, rangeKm: type.rangeKm };
      for (var field in copy) {
        var value = copy[field];
        if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && !value.length)) ntf.document[field] = value;
      }
    }
  },

  // Responsible Person is mandatory unless the asset is Unassigned.
  ruleResponsiblePerson : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'allocationStatus'; },
    ruleAction : function (ntf) {
      ntf.scope.mandateField('responsiblePersonRel', ntf.document.allocationStatus !== 'Unassigned');
    }
  },

  // Plant has no registration; vehicles have no engine-hours meter by default.
  rulePlantFields : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'assetTypeRel'; },
    ruleAction : function (ntf) {
      var type = ntf.lib.first(ntf.document.assetTypeRel) || {};
      var plant = type.assetClass === 'Plant' || type.assetClass === 'Yellow Plant';
      ['registration', 'regDueDate', 'insuranceDueDate'].forEach(function (f) { ntf.scope.showField(f, !plant); });
    }
  },

  // Only asset managers change an existing asset's ID, money and booking settings (FLEET: admins edit the ID).
  ruleManagerFields : {
    ruleCondition : function (ntf) { return ntf.isSetup && !ntf.isNew && !ntf.isManager; },
    ruleAction : function (ntf) {
      ['assetId', 'purchasePrice', 'purchaseDate', 'currentValue', 'replacementCycleMonths', 'bookableBool', 'maxBookingHours',
        'hireRateHourly', 'hireRateDaily', 'assetTypeRel', 'poolsRel'].forEach(function (f) { ntf.scope.enableField(f, false); });
    }
  }`,
    { logic: true },
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function assetServerRules({ statuses }) {
  return ruleset(
    'Fleet Asset - PreSaveServer',
    `${SERVER_INIT}


  // The checks the browser also runs before saving (lib.validateAsset), enforced here.
  ruleValidate : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var message = ntf.lib.validateAsset(ntf.document, ntf.who);
      if (message) ntf.errorMessage = message;
    }
  },
  // IDs are unique across the fleet.
  ruleUniqueId : {
    ruleCondition : function (ntf) { return !!ntf.document.assetId; },
    ruleAction : function (ntf, callback) {
      var id = String(ntf.document.assetId).trim().toUpperCase();
      ntf.document.assetId = id;
      ntf.lib.search(ntf, { query: { bool: { filter: [{ term: { appTags: 'asset' } }, { term: { assetId: id } }], must_not: [{ term: { documentId: ntf.document.documentId } }] } } }, function (err, docs) {
        if (!err && docs.length) ntf.errorMessage = 'Asset ID ' + id + ' is already used by ' + docs[0].systemHeader.summaryName + '.';
        callback();
      });
    }
  },

  // One tracker per asset ("Tracker Device Must Be Unique").
  ruleUniqueTracker : {
    ruleCondition : function (ntf) { return !!ntf.document.trackerSerial; },
    ruleAction : function (ntf, callback) {
      ntf.lib.search(ntf, { query: { bool: { filter: [{ term: { appTags: 'asset' } }, { term: { trackerSerial: ntf.document.trackerSerial } }], must_not: [{ term: { documentId: ntf.document.documentId } }] } } }, function (err, docs) {
        if (!err && docs.length) ntf.errorMessage = 'Tracker Device Must Be Unique: ' + ntf.document.trackerSerial + ' is on ' + docs[0].assetId + '.';
        callback();
      });
    }
  },


  // Derived fields: name, type details, financial class, replacement due.
  ruleDerived : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var type = ntf.lib.first(d.assetTypeRel) || {};
      d.makeModel = [d.make, d.model].filter(Boolean).join(' ');
      d.assetName = [d.assetId, d.make, d.model, d.registration].filter(Boolean).join(' ');
      d.iconKind = type.iconKind || d.iconKind || '';
      d.assetClass = type.assetClass || d.assetClass || '';
      d.requiredLicence = type.requiredLicence || '';
      d.meterReading = ntf.lib.meterText(d.meterReadingNum, d.primaryMeterUnit);
      d.financialClass = Number(d.purchasePrice) > 5000 ? 'Major Plant' : d.purchasePrice ? 'Minor Plant' : '';
      if (d.purchaseDate && d.replacementCycleMonths) {
        var due = new Date(d.purchaseDate);
        due.setMonth(due.getMonth() + Number(d.replacementCycleMonths));
        d.replacementDueDate = due.toISOString();
      }
    }
  },

  // When the next service falls due, from the plan and the last service; and how close it is.
  ruleService : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var plan = ntf.lib.first(d.servicePlanRel);
      if (!plan) { d.serviceWarning = ''; return; }
      if (!d.serviceDueDate && !d.serviceDueMeterNum) {
        var next = ntf.lib.nextServiceDue({ serviceDate: d.lastServiceDate || d.purchaseDate || new Date().toISOString(), serviceMeter: d.lastServiceMeterNum || 0, intervalWeeks: plan.weeks, intervalMeter: plan.meter });
        if (next.dueDate) d.serviceDueDate = next.dueDate;
        if (next.dueMeter !== undefined) d.serviceDueMeterNum = next.dueMeter;
      }
      d.serviceWarning = ntf.lib.serviceWarning({ dueDate: d.serviceDueDate, dueMeter: d.serviceDueMeterNum, meter: d.meterReadingNum, leadWeeks: plan.leadWeeks, leadMeter: plan.leadMeter });
    }
  },

  // A disposed asset leaves the calendar and the map; a commissioned one goes on hire.
  ruleLifecycle : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var from = d.lastStatus || '';
      var to = ntf.lib.statusName(d.assetStatusRel);
      if (to === 'Disposed') {
        d.bookableBool = false;
        d.includeInMapBool = false;
        d.hireStatusRel = [${json(statuses.hireStatus['Unavailable For Hire'])}];
      }
      if (from === 'Commission' && to === 'Active') d.hireStatusRel = [${json(statuses.hireStatus['Available For Hire'])}];
      ntf.lib.transition(ntf, 'assetStatusRel');
    }
  }`,
    { logic: true },
  );
}

// ------------------------------------------------------------------------------------------------
// Booking
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>>, assetFilter: object }} o
 */
export function bookingClientRules({ statuses, assetFilter }) {
  return ruleset(
    'Fleet Booking - Client',
    `${CLIENT_INIT}
${clientPreSave('validateBooking')}

  // A new booking is the signed-in user's, Asset Reserved, from the next half hour for two hours.
  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      if (!(d.requestedByRel && d.requestedByRel.length)) {
        var user = ntf.context.user || {};
        d.requestedByRel = [{ documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '', email: user.email || null, accountType: user.accountType || null }];
      }
      if (!(d.bookingStatusRel && d.bookingStatusRel.length)) d.bookingStatusRel = [${json(statuses.bookingStatus['Asset Reserved'])}];
      if (!d.startDate) {
        var start = Math.ceil(Date.now() / 1800000) * 1800000;
        d.startDate = new Date(start).toISOString();
        d.endDate = new Date(start + 2 * 3600000).toISOString();
      }
    }
  },

  // People book from their own vehicle hire pools; asset managers from all of them.
  rulePools : {
    ruleCondition : function (ntf) { return ntf.isSetup && !ntf.isManager; },
    ruleAction : function (ntf) {
      var pools = ((ntf.context.user || {}).poolsRel || []).map(function (p) { return p.documentId; });
      var filter = JSON.parse(${json(JSON.stringify(assetFilter))});
      filter.query.bool.filter.push({ terms: { 'poolsRel.documentId': pools.length ? pools : ['none'] } });
      ntf.scope.setFilter('assetRel', filter);
      ntf.scope.setComponentProps('availability', 'solid-booking-calendar', { assetFilter: filter });
    }
  },

  // Meters are taken when the hire starts and ends; a finished booking can't be changed.
  ruleStatusFields : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'bookingStatusRel'; },
    ruleAction : function (ntf) {
      var status = ntf.lib.statusName(ntf.document.bookingStatusRel);
      var started = status === 'Hire Commenced' || status === 'Closed';
      ntf.scope.showField('startMeterNum', started);
      ntf.scope.mandateField('startMeterNum', status === 'Hire Commenced');
      ntf.scope.showField('endMeterNum', status === 'Closed');
      ntf.scope.mandateField('endMeterNum', status === 'Closed');
      ntf.scope.showField('cancelReasonRel', status === 'Cancelled');
      var locked = status === 'Closed' || status === 'Cancelled';
      var fixed = locked || (status === 'Hire Commenced' && !ntf.isManager);
      ['assetRel', 'requestedByRel'].forEach(function (f) { ntf.scope.enableField(f, !fixed); });
      if (ntf.isSetup && !locked && !fixed) return;
      ['startDate', 'bookingReasonRel', 'jobCode', 'destination', 'destinationGeo', 'bookingNotes'].forEach(function (f) { ntf.scope.enableField(f, !locked); });
      ntf.scope.showField('availability', !locked);
    }
  }`,
    { logic: true },
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function bookingServerRules({ statuses }) {
  return ruleset(
    'Fleet Booking - PreSaveServer',
    `${SERVER_INIT}

  ruleLoad : {
    ruleCondition : true,
    ruleAction : function (ntf, callback) {
      var d = ntf.document;
      ntf.status = ntf.lib.statusName(d.bookingStatusRel);
      ntf.from = d.lastStatus || '';
      ntf.assetRef = ntf.lib.first(d.assetRel) || {};
      ntf.requester = ntf.lib.first(d.requestedByRel) || ntf.lib.me(ntf);
      if (!ntf.assetRef.documentId) { ntf.errorMessage = 'Choose the asset to book.'; callback(); return; }
      ntf.lib.byId(ntf, ntf.assetRef.documentId, function (err, asset) {
        ntf.asset = asset || {};
        ntf.lib.byId(ntf, ntf.requester.documentId, function (err2, person) {
          ntf.person = person || {};
          callback();
        });
      });
    }
  },


  // A new booking whose start has already passed starts now ("Start Time Adjusted").
  ruleAdjustStart : {
    ruleCondition : function (ntf) { return ntf.status === 'Asset Reserved' && !ntf.from; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      if (new Date(d.startDate).getTime() < ntf.now - 5 * 60000) {
        d.startDate = new Date(ntf.now).toISOString();
        d.startAdjustedBool = true;
      }
    }
  },
  // The checks the browser also runs before saving (lib.validateBooking), enforced here.
  ruleValidate : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var message = ntf.lib.validateBooking(ntf.document, ntf.who);
      if (message) ntf.errorMessage = message;
    }
  },

  // The asset must be bookable: Active, not in the workshop (unless booked for maintenance).
  ruleAssetAvailable : {
    ruleCondition : function (ntf) { return ntf.status === 'Asset Reserved' && !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var a = ntf.asset;
      var id = a.assetId || ntf.assetRef.name;
      if (ntf.lib.statusName(a.assetStatusRel) !== 'Active' || a.bookableBool === false) {
        ntf.errorMessage = id + ' can\\'t be booked: it is ' + (ntf.lib.statusName(a.assetStatusRel) || 'not bookable') + '.';
        return;
      }
      var hire = ntf.lib.statusName(a.hireStatusRel);
      var maintenance = ntf.lib.statusName(ntf.document.bookingReasonRel) === 'Maintenance';
      if (hire === 'Unavailable For Hire' && !maintenance) ntf.errorMessage = id + ' is Unavailable For Hire (in the workshop or tagged out).';
    }
  },

  // People book from their vehicle hire pools, with a licence that covers the asset.
  rulePoolsAndLicence : {
    ruleCondition : function (ntf) { return ntf.status === 'Asset Reserved' && !ntf.isManager && !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var personPools = (ntf.person.poolsRel || []).map(function (p) { return p.documentId; });
      var assetPools = (ntf.asset.poolsRel || []).map(function (p) { return p.documentId; });
      var name = ntf.requester.name || 'This person';
      if (!assetPools.some(function (id) { return personPools.indexOf(id) > -1; })) {
        ntf.errorMessage = name + ' isn\\'t in a vehicle hire pool that has ' + ntf.asset.assetId + '.';
        return;
      }
      var needed = ntf.asset.requiredLicence || ntf.assetRef.requiredLicence;
      if (!needed) return;
      var held = (ntf.person.licencesRel || []).map(function (l) { return l.name; });
      var road = ['C', 'LR', 'MR', 'HR', 'HC', 'MC'];
      var covers = held.some(function (h) {
        return h === needed || (road.indexOf(h) > -1 && road.indexOf(needed) > -1 && road.indexOf(h) >= road.indexOf(needed));
      });
      if (!covers) { ntf.errorMessage = name + ' needs a ' + needed + ' licence or ticket to book ' + ntf.asset.assetId + '.'; return; }
      var expiry = ntf.person.licenceExpiryDate && new Date(ntf.person.licenceExpiryDate).getTime();
      if (expiry && expiry < new Date(ntf.document.endDate).getTime()) ntf.errorMessage = name + '\\'s licence expires before the booking ends.';
    }
  },

  // No clashes: other bookings, a hire not returned yet, or the workshop.
  ruleConflicts : {
    ruleCondition : function (ntf) { return ntf.status === 'Asset Reserved' && !ntf.errorMessage; },
    ruleAction : function (ntf, callback) {
      var d = ntf.document;
      var lib = ntf.lib;
      var assetId = ntf.assetRef.documentId;
      var start = d.startDate;
      var end = d.endDate;
      var others = { query: { bool: {
        filter: [{ term: { appTags: 'booking' } }, { term: { 'assetRel.documentId': assetId } }, { terms: { 'bookingStatusRel.name': ['Asset Reserved', 'Hire Commenced'] } }],
        must_not: [{ term: { documentId: d.documentId } }] } } };
      lib.search(ntf, others, function (err, bookings) {
        var clash = (bookings || []).filter(function (b) {
          var notBack = lib.statusName(b.bookingStatusRel) === 'Hire Commenced' && new Date(b.endDate).getTime() < ntf.now;
          // A hire not returned yet blocks bookings that start in the next 24 hours.
          if (notBack) return new Date(start).getTime() < ntf.now + ${UNRETURNED_BLOCK_MS};
          return lib.overlaps(b.startDate, b.endDate, start, end);
        })[0];
        if (clash) {
          var who = clash.requestedByRel && clash.requestedByRel[0] ? clash.requestedByRel[0].name : 'someone';
          var back = lib.statusName(clash.bookingStatusRel) === 'Hire Commenced' && new Date(clash.endDate).getTime() < ntf.now;
          ntf.errorMessage = back
            ? ntf.asset.assetId + ' hasn\\'t been returned from ' + clash.bookingRef + ' (' + who + ', due back ' + lib.when(clash.endDate) + ').'
            : ntf.asset.assetId + ' is already booked then: ' + clash.bookingRef + ' (' + who + ', ' + lib.when(clash.startDate) + ' – ' + lib.when(clash.endDate) + ').';
          callback();
          return;
        }
        var workshop = { query: { bool: {
          filter: [{ term: { appTags: 'request' } }, { term: { 'assetRel.documentId': assetId } }],
          should: [{ terms: { 'requestStatusRel.name': ${json(IN_WORKSHOP)} } }, { terms: { disableBooking: ['Disable', 'Auto Disable'] } }], minimum_should_match: 1,
          must_not: [{ terms: { 'requestStatusRel.name': ['Closed', 'Cancelled', 'Pick Up'] } }] } } };
        lib.search(ntf, workshop, function (err2, requests) {
          var blocked = (requests || []).filter(function (r) {
            if (lib.statusName(d.bookingReasonRel) === 'Maintenance') return false;
            var from = r.expectedStartDate || r.createdDate;
            var to = r.expectedCompletionDate || new Date(ntf.now + 7 * 86400000).toISOString();
            return lib.overlaps(from, to, start, end);
          })[0];
          if (blocked) ntf.errorMessage = ntf.asset.assetId + ' is booked into the workshop then (' + blocked.requestRef + ', ' + lib.statusName(blocked.requestStatusRel) + ').';
          callback();
        });
      });
    }
  },

  // Commencing and closing record when; closing records the distance.
  ruleHire : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      if ((ntf.status === 'Hire Commenced' || ntf.status === 'Closed') && !d.commencedDate) d.commencedDate = new Date(ntf.now).toISOString();
      if (ntf.status === 'Closed') {
        if (!d.closedDate) d.closedDate = new Date(ntf.now).toISOString();
        d.distanceNum = Math.round((Number(d.endMeterNum) - Number(d.startMeterNum)) * 10) / 10;
      }
    }
  },

  // Duration and cost (hourly, capped daily, weekends free), and whether the hire is overdue.
  ruleCost : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var rates = { hourlyRate: ntf.assetRef.hireRateHourly || ntf.asset.hireRateHourly, dailyRate: ntf.assetRef.hireRateDaily || ntf.asset.hireRateDaily };
      d.hireDurationHours = Math.round(ntf.lib.hireHours(d.startDate, d.endDate, d.closedDate) * 100) / 100;
      d.hireCost = ntf.status === 'Cancelled' ? 0 : ntf.lib.hireCost({ start: d.startDate, end: d.endDate, closed: d.closedDate, hourlyRate: rates.hourlyRate, dailyRate: rates.dailyRate, timeZone: ${json(TIME_ZONE)} });
      d.hireOverdueBool = ntf.status === 'Hire Commenced' && new Date(d.endDate).getTime() < ntf.now;
      ntf.lib.transition(ntf, 'bookingStatusRel');
    }
  }`,
    { logic: true },
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function bookingPostRules({ statuses }) {
  return ruleset(
    'Fleet Booking - PostSave',
    `
  // On Hire while a hire is out; back to Available For Hire, with its meter, when it is closed.
  ruleAssetHireStatus : {
    ruleCondition : function (ntf) { return !!ntf.document.transition; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var to = d.transition.to;
      var asset = lib.first(d.assetRel);
      if (!asset || (to !== 'Hire Commenced' && to !== 'Closed')) { callback(); return; }
      lib.byId(ntf, asset.documentId, function (err, current) {
        if (!current) { callback(); return; }
        var change = {};
        var hire = lib.statusName(current.hireStatusRel);
        if (to === 'Hire Commenced' && hire !== 'Unavailable For Hire') change.hireStatusRel = [${json(statuses.hireStatus['On Hire'])}];
        if (to === 'Closed') {
          if (hire === 'On Hire') change.hireStatusRel = [${json(statuses.hireStatus['Available For Hire'])}];
          if (Number(d.endMeterNum) > Number(current.meterReadingNum || 0)) {
            change.meterReadingNum = Number(d.endMeterNum);
            change.meterReadingDate = d.closedDate;
          }
        }
        if (!Object.keys(change).length) { callback(); return; }
        lib.update(ntf, asset.documentId, change, callback);
      });
    }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Daily Driver
// ------------------------------------------------------------------------------------------------

export function ddClientRules() {
  return ruleset(
    'Fleet Daily Driver - Client',
    `${CLIENT_INIT}
${clientPreSave('validateDailyDriver')}

  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var user = ntf.context.user || {};
      if (!(d.driverRel && d.driverRel.length)) d.driverRel = [{ documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '', email: user.email || null, accountType: user.accountType || null }];
      if (!d.checkDate) d.checkDate = new Date().toISOString();
    }
  },

  // A failed check opens the Defect panel: description, priority, where to fix it, inspection done.
  ruleDefectFields : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'checksArr'; },
    ruleAction : function (ntf) {
      var failed = (ntf.document.checksArr || []).some(function (c) { return c.result === 'fail'; });
      ['defectDescription', 'defectPriorityRel', 'serviceRequested', 'inspectionCompleteBool'].forEach(function (f) {
        ntf.scope.showField(f, failed);
        ntf.scope.mandateField(f, failed && f !== 'serviceRequested');
      });
      ntf.scope.showField('defectPanel', failed);
    }
  },

  // A submitted check is a record: it doesn't change afterwards.
  ruleLocked : {
    ruleCondition : function (ntf) { return ntf.isSetup && !ntf.isNew && !ntf.isManager; },
    ruleAction : function (ntf) {
      ['assetRel', 'driverRel', 'checkDate', 'meterReadingNum', 'checksArr', 'defectDescription', 'defectPriorityRel', 'serviceRequested', 'inspectionCompleteBool']
        .forEach(function (f) { ntf.scope.enableField(f, false); });
    }
  }`,
    { logic: true },
  );
}

export function ddServerRules() {
  return ruleset(
    'Fleet Daily Driver - PreSaveServer',
    `${SERVER_INIT}

  // Every mandatory check answered, a comment on each failure, the defect described (lib.validateDailyDriver).
  ruleChecks : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      var message = ntf.lib.validateDailyDriver(d);
      if (message) { ntf.errorMessage = message; return; }
      var outcome = ntf.lib.checklistOutcome(d.checksArr, { commentOnFail: true });
      d.ddResult = outcome.result;
      d.defectCount = outcome.failed;
    }
  },

  // A reading below the asset's meter is kept but flagged, and won't update the asset.
  ruleMeter : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf, callback) {
      var d = ntf.document;
      var asset = ntf.lib.first(d.assetRel);
      ntf.lib.byId(ntf, asset.documentId, function (err, current) {
        var problems = ntf.lib.meterProblems({ reading: d.meterReadingNum, assetMeter: current ? current.meterReadingNum : null, maxIncrease: 2000, unit: asset.primaryMeterUnit });
        d.meterExcludedBool = problems.length > 0;
        d.meterExcludedReason = problems.length ? 'Excluded From Asset Update: ' + problems.join(' ') : '';
        // The first save submits the check; the PostSave rule acts once, on that.
        d.transition = d.lastStatus ? null : { from: '', to: 'Submitted', at: new Date().toISOString() };
        d.lastStatus = 'Submitted';
        callback();
      });
    }
  }`,
    { logic: true },
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>>, values: Record<string, Record<string, object>>, requestTemplateId: string }} o
 */
export function ddPostRules({ statuses, values, requestTemplateId }) {
  return ruleset(
    'Fleet Daily Driver - PostSave',
    `
  // A failed check becomes a workshop request (Pending, for triage); an urgent one takes the asset off hire.
  ruleRaiseRequest : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && ntf.document.defectCount > 0; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var asset = lib.first(d.assetRel);
      var priority = lib.first(d.defectPriorityRel) || ${json(values.requestPriority['Non-Urgent – Asset Operational'])};
      var urgent = priority.name === 'Urgent – Asset Out of Service';
      var failed = (d.checksArr || []).filter(function (c) { return c.result === 'fail'; });
      lib.byId(ntf, asset.documentId, function (err, current) {
        var request = {
          appTags: ['fleet', 'request'],
          assetRel: d.assetRel,
          requestTypeRel: [${json(values.requestType['Daily Driver Defect'])}],
          requestReasonRel: [${json(values.requestReason['Driver Defect'])}],
          priorityRel: [priority],
          requestStatusRel: [${json(statuses.requestStatus.Pending)}],
          lastStatus: 'Pending',
          reqDescription: d.defectDescription + '\\n\\n' + failed.map(function (c) { return '- **' + c.question + '**: ' + (c.comment || ''); }).join('\\n') +
            '\\n\\nService requested: ' + (d.serviceRequested || 'In Workshop') + '. Raised by ' + (d.ddRef || 'a Daily Driver check') + '.',
          requestedByRel: d.driverRel,
          dailyDriverRel: [{ documentId: d.documentId, name: d.systemHeader.summaryName }],
          workshopRel: current && current.responsibleWorkshopRel ? current.responsibleWorkshopRel : [],
          disableBooking: urgent ? 'Disable' : 'Do Not Disable',
          createdDate: new Date().toISOString()
        };
        ntf.scope.createDocumentFromTemplate(request, ${json(requestTemplateId)}, ntf.userId, function (err2) {
          if (err2) ntf.logger.error('Raising the defect request failed: ' + (err2.message || err2));
          if (!urgent || !current) { callback(); return; }
          lib.update(ntf, asset.documentId, { hireStatusRel: [${json(statuses.hireStatus['Unavailable For Hire'])}] }, callback);
        });
      });
    }
  },

  // A good reading updates the asset's meter.
  ruleMeter : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && !ntf.document.meterExcludedBool && ntf.document.meterReadingNum; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var asset = lib.first(ntf.document.assetRel);
      lib.byId(ntf, asset.documentId, function (err, current) {
        if (!current || Number(ntf.document.meterReadingNum) <= Number(current.meterReadingNum || 0)) { callback(); return; }
        lib.update(ntf, asset.documentId, { meterReadingNum: Number(ntf.document.meterReadingNum), meterReadingDate: ntf.document.checkDate }, callback);
      });
    }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Workshop request
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>>, values: Record<string, Record<string, object>> }} o
 */
export function requestClientRules({ statuses, values }) {
  return ruleset(
    'Fleet Request - Client',
    `${CLIENT_INIT}
${clientPreSave('validateRequest')}

  // A new request is a Non-Urgent Repair/General Request with booking auto-disabled: Pending for a
  // supervisor to triage, or straight to Open when the workshop raises it.
  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var user = ntf.context.user || {};
      if (!(d.requestedByRel && d.requestedByRel.length)) d.requestedByRel = [{ documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '', email: user.email || null, accountType: user.accountType || null }];
      if (!(d.requestTypeRel && d.requestTypeRel.length)) d.requestTypeRel = [${json(values.requestType['Repair/General Request'])}];
      if (!(d.priorityRel && d.priorityRel.length)) d.priorityRel = [${json(values.requestPriority['Non-Urgent – Asset Operational'])}];
      if (!(d.requestStatusRel && d.requestStatusRel.length)) d.requestStatusRel = [ntf.isWorkshop ? ${json(statuses.requestStatus.Open)} : ${json(statuses.requestStatus.Pending)}];
      if (!d.disableBooking) d.disableBooking = 'Auto Disable';
    }
  },

  // The asset's responsible workshop takes the job.
  ruleWorkshop : {
    ruleCondition : function (ntf) { return ntf.context.fieldChanged === 'assetRel' || (ntf.isSetup && ntf.isNew); },
    ruleAction : function (ntf) {
      var asset = ntf.lib.first(ntf.document.assetRel);
      if (asset && asset.responsibleWorkshopRel && asset.responsibleWorkshopRel.length && !(ntf.document.workshopRel && ntf.document.workshopRel.length)) {
        ntf.document.workshopRel = asset.responsibleWorkshopRel;
      }
    }
  },

  // Drivers report faults; scheduling and assigning is the workshop's.
  ruleWorkshopFields : {
    ruleCondition : function (ntf) { return ntf.isSetup && !ntf.isWorkshop; },
    ruleAction : function (ntf) {
      ['assignedToRel', 'expectedStartDate', 'disableBooking', 'deferredBool', 'deferredReason', 'workshopRel'].forEach(function (f) { ntf.scope.enableField(f, false); });
      ntf.scope.showField('newWorkOrder', false);
    }
  },

  ruleDeferred : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'deferredBool'; },
    ruleAction : function (ntf) {
      ntf.scope.mandateField('deferredReason', !!ntf.document.deferredBool);
    }
  },

  ruleLocked : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'requestStatusRel'; },
    ruleAction : function (ntf) {
      var status = ntf.lib.statusName(ntf.document.requestStatusRel);
      var locked = status === 'Closed' || status === 'Cancelled';
      if (ntf.isSetup && !locked) return;
      ['assetRel', 'requestTypeRel', 'priorityRel', 'requestReasonRel', 'reqDescription', 'assignedToRel', 'expectedStartDate', 'disableBooking', 'workshopRel']
        .forEach(function (f) { ntf.scope.enableField(f, !locked); });
    }
  }`,
    { logic: true },
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function requestServerRules({ statuses }) {
  return ruleset(
    'Fleet Request - PreSaveServer',
    `${SERVER_INIT}

  ruleLoad : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      ntf.status = ntf.lib.statusName(d.requestStatusRel);
      ntf.from = d.lastStatus || '';
      // FLEET: a Pending request with an expected start and completion is Open.
      if (ntf.status === 'Pending' && d.expectedStartDate && d.expectedCompletionDate && ntf.isSupervisor) {
        d.requestStatusRel = [${json(statuses.requestStatus.Open)}];
        ntf.status = 'Open';
      }
    }
  },





  // The checks the browser also runs before saving (lib.validateRequest), enforced here.
  ruleValidate : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var message = ntf.lib.validateRequest(ntf.document, ntf.who);
      if (message) ntf.errorMessage = message;
    }
  },
  // A request closes only when its work orders are complete.
  ruleOpenWorkOrders : {
    ruleCondition : function (ntf) { return ntf.status === 'Closed' && ntf.from !== 'Closed' && !ntf.errorMessage; },
    ruleAction : function (ntf, callback) {
      ntf.lib.search(ntf, { query: { bool: { filter: [{ term: { appTags: 'workOrder' } }, { term: { 'requestRel.documentId': ntf.document.documentId } }], must_not: [{ term: { 'workOrderStatusRel.name': 'Complete' } }] } } }, function (err, open) {
        if (open && open.length) ntf.errorMessage = 'Complete ' + open.map(function (w) { return w.workOrderRef; }).join(', ') + ' before closing the request.';
        callback();
      });
    }
  },

  // Dates of each stage, and the downtime when it closes.
  ruleDates : {
    ruleCondition : function (ntf) { return !ntf.errorMessage && ntf.from !== ntf.status; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var now = new Date(ntf.now).toISOString();
      if (ntf.status === 'Drop Off' && !d.dropOffDate) d.dropOffDate = now;
      if (ntf.status === 'In Progress' && !d.startedDate) d.startedDate = now;
      if (ntf.status === 'Work Complete') d.workCompleteDate = now;
      if (ntf.status === 'Pick Up') d.pickUpDate = now;
      if (ntf.status === 'Closed' || ntf.status === 'Cancelled') d.closedDate = now;
      if (ntf.status === 'Closed') {
        var from = d.dropOffDate || d.startedDate;
        var to = d.workCompleteDate || d.closedDate;
        d.downTimeHours = from ? Math.round(((new Date(to).getTime() - new Date(from).getTime()) / 3600000) * 10) / 10 : 0;
      }
    }
  },

  // Bookings that clash with the expected window, for the workshop to sort out.
  ruleBookingConflicts : {
    ruleCondition : function (ntf) { return !ntf.errorMessage && !!ntf.document.expectedStartDate && !!ntf.document.expectedCompletionDate; },
    ruleAction : function (ntf, callback) {
      var d = ntf.document;
      var asset = ntf.lib.first(d.assetRel);
      if (!asset) { callback(); return; }
      var query = { query: { bool: { filter: [{ term: { appTags: 'booking' } }, { term: { 'assetRel.documentId': asset.documentId } }, { terms: { 'bookingStatusRel.name': ['Asset Reserved', 'Hire Commenced'] } },
        { range: { startDate: { lt: d.expectedCompletionDate } } }, { range: { endDate: { gt: d.expectedStartDate } } }] } }, sort: [{ startDate: 'asc' }] };
      ntf.lib.search(ntf, query, function (err, bookings) {
        d.bookingConflicts = (bookings || []).length
          ? bookings.map(function (b) { return b.bookingRef + ' (' + (b.requestedByRel && b.requestedByRel[0] ? b.requestedByRel[0].name : '') + ', ' + ntf.lib.when(b.startDate) + ')'; }).join('; ')
          : 'None';
        callback();
      });
    }
  },

  ruleTransition : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) { ntf.lib.transition(ntf, 'requestStatusRel'); }
  }`,
    { logic: true },
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function requestPostRules({ statuses }) {
  return ruleset(
    'Fleet Request - PostSave',
    `
  // In the workshop (Drop Off to Work Complete, or booking disabled): Unavailable For Hire. When the
  // last such request is picked up, closed or cancelled: Available For Hire again.
  ruleAssetHireStatus : {
    ruleCondition : function (ntf) { return !!ntf.document.transition; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var to = d.transition.to;
      var asset = lib.first(d.assetRel);
      if (!asset) { callback(); return; }
      var inWorkshop = ${json(IN_WORKSHOP)}.indexOf(to) > -1 || (d.disableBooking === 'Disable' && (to === 'Open' || to === 'Pending'));
      var released = ['Pick Up', 'Closed', 'Cancelled'].indexOf(to) > -1;
      if (!inWorkshop && !released) { callback(); return; }
      lib.byId(ntf, asset.documentId, function (err, current) {
        if (!current) { callback(); return; }
        var hire = lib.statusName(current.hireStatusRel);
        if (inWorkshop) {
          if (hire === 'Unavailable For Hire') { callback(); return; }
          lib.update(ntf, asset.documentId, { hireStatusRel: [${json(statuses.hireStatus['Unavailable For Hire'])}] }, callback);
          return;
        }
        if (hire !== 'Unavailable For Hire') { callback(); return; }
        var others = { query: { bool: { filter: [{ term: { appTags: 'request' } }, { term: { 'assetRel.documentId': asset.documentId } }],
          should: [{ terms: { 'requestStatusRel.name': ${json(IN_WORKSHOP)} } }, { term: { disableBooking: 'Disable' } }], minimum_should_match: 1,
          must_not: [{ term: { documentId: d.documentId } }, { terms: { 'requestStatusRel.name': ['Pick Up', 'Closed', 'Cancelled'] } }] } } };
        lib.search(ntf, others, function (err2, still) {
          if (still && still.length) { callback(); return; }
          lib.update(ntf, asset.documentId, { hireStatusRel: [${json(statuses.hireStatus['Available For Hire'])}] }, callback);
        });
      });
    }
  }`,
  );
}

// ------------------------------------------------------------------------------------------------
// Work order
// ------------------------------------------------------------------------------------------------

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function woClientRules({ statuses }) {
  return ruleset(
    'Fleet Work Order - Client',
    `${CLIENT_INIT}
${clientPreSave('validateWorkOrder')}

  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNew; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var user = ntf.context.user || {};
      if (!(d.workOrderStatusRel && d.workOrderStatusRel.length)) d.workOrderStatusRel = [${json(statuses.workOrderStatus.New)}];
      if (!(d.assignedToRel && d.assignedToRel.length) && ntf.isWorkshop) {
        d.assignedToRel = [{ documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '', email: user.email || null, accountType: user.accountType || null }];
      }
    }
  },

  // The asset comes from the request (its picker is read-only).
  ruleAssetFromRequest : {
    ruleCondition : function (ntf) { return ntf.context.fieldChanged === 'requestRel'; },
    ruleAction : function (ntf) {
      var request = ntf.lib.first(ntf.document.requestRel);
      ntf.document.assetRel = request && request.assetRel ? request.assetRel : [];
    }
  },

  // Service checks belong to PM services; completion details are needed to complete.
  ruleTypeAndStatus : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'workOrderTypeRel' || ntf.context.fieldChanged === 'workOrderStatusRel'; },
    ruleAction : function (ntf) {
      var type = ntf.lib.statusName(ntf.document.workOrderTypeRel);
      var status = ntf.lib.statusName(ntf.document.workOrderStatusRel);
      var pm = type === 'PM Service';
      ntf.scope.showField('serviceChecksArr', pm);
      ntf.scope.mandateField('meterAtServiceNum', pm && status === 'Complete');
      ntf.scope.mandateField('dateAtService', pm && status === 'Complete');
      ntf.scope.mandateField('workCompleted', status === 'Complete');
      ntf.scope.showField('onHoldReason', status === 'On Hold' || !!ntf.document.onHoldReason);
      ntf.scope.mandateField('onHoldReason', status === 'On Hold');
    }
  }`,
    { logic: true },
  );
}

export function woServerRules() {
  return ruleset(
    'Fleet Work Order - PreSaveServer',
    `${SERVER_INIT}

  ruleLoad : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      ntf.status = ntf.lib.statusName(d.workOrderStatusRel);
      ntf.from = d.lastStatus || '';
      var request = ntf.lib.first(d.requestRel);
      if (request && !(d.assetRel && d.assetRel.length) && request.assetRel) d.assetRel = request.assetRel;
    }
  },




  // The checks the browser also runs before saving (lib.validateWorkOrder), enforced here.
  ruleValidate : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var message = ntf.lib.validateWorkOrder(ntf.document, ntf.who);
      if (message) ntf.errorMessage = message;
    }
  },
  // Totals by kind and with GST, from the same function the line items element uses.
  ruleTotals : {
    ruleCondition : function (ntf) { return !ntf.errorMessage; },
    ruleAction : function (ntf) {
      var d = ntf.document;
      var totals = ntf.lib.lineTotals(d.lineItemsArr, 0.1);
      d.partsTotal = totals.parts;
      d.labourTotal = totals.labour;
      d.labourHours = totals.labourHours;
      d.taxTotal = totals.tax;
      d.totalCost = totals.total;
      var now = new Date(ntf.now).toISOString();
      if (ntf.status === 'In Progress' && !d.startedDate) d.startedDate = now;
      if (ntf.status === 'Complete' && ntf.from !== 'Complete') d.completedDate = now;
      if (ntf.status !== 'Complete') d.completedDate = null;
      ntf.lib.transition(ntf, 'workOrderStatusRel');
    }
  }`,
    { logic: true },
  );
}

/**
 * @param {{ statuses: Record<string, Record<string, object>> }} o
 */
export function woPostRules({ statuses }) {
  return ruleset(
    'Fleet Work Order - PostSave',
    `
  // Work starting puts the request In Progress.
  ruleRequestInProgress : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && ntf.document.transition.to === 'In Progress'; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var request = lib.first(ntf.document.requestRel);
      lib.byId(ntf, request.documentId, function (err, current) {
        var status = current ? lib.statusName(current.requestStatusRel) : '';
        if (['Open', 'Drop Off'].indexOf(status) === -1) { callback(); return; }
        lib.update(ntf, request.documentId, { requestStatusRel: [${json(statuses.requestStatus['In Progress'])}] }, callback);
      });
    }
  },

  // The request's last work order completed: the request is Work Complete.
  ruleRequestWorkComplete : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && ntf.document.transition.to === 'Complete'; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var request = lib.first(d.requestRel);
      lib.search(ntf, { query: { bool: { filter: [{ term: { appTags: 'workOrder' } }, { term: { 'requestRel.documentId': request.documentId } }], must_not: [{ term: { 'workOrderStatusRel.name': 'Complete' } }, { term: { documentId: d.documentId } }] } } }, function (err, open) {
        if (open && open.length) { callback(); return; }
        lib.byId(ntf, request.documentId, function (err2, current) {
          if (!current || lib.statusName(current.requestStatusRel) !== 'In Progress') { callback(); return; }
          lib.update(ntf, request.documentId, { requestStatusRel: [${json(statuses.requestStatus['Work Complete'])}] }, callback);
        });
      });
    }
  },

  // A completed PM Service reschedules the asset's next service (late: from when it was due).
  ruleNextService : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && ntf.document.transition.to === 'Complete' && ntf.ruleset.lib.statusName(ntf.document.workOrderTypeRel) === 'PM Service'; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var d = ntf.document;
      var asset = lib.first(d.assetRel);
      lib.byId(ntf, asset.documentId, function (err, current) {
        var plan = current ? lib.first(current.servicePlanRel) : null;
        if (!plan) { callback(); return; }
        var next = lib.nextServiceDue({ serviceDate: d.dateAtService, serviceMeter: d.meterAtServiceNum, dueDate: current.serviceDueDate, dueMeter: current.serviceDueMeterNum, intervalWeeks: plan.weeks, intervalMeter: plan.meter });
        var meter = Math.max(Number(current.meterReadingNum || 0), Number(d.meterAtServiceNum || 0));
        var change = {
          lastServiceDate: d.dateAtService,
          lastServiceMeterNum: Number(d.meterAtServiceNum),
          serviceDueDate: next.dueDate || null,
          serviceDueMeterNum: next.dueMeter === undefined ? null : next.dueMeter,
          meterReadingNum: meter
        };
        change.serviceWarning = lib.serviceWarning({ dueDate: change.serviceDueDate, dueMeter: change.serviceDueMeterNum, meter: meter, leadWeeks: plan.leadWeeks, leadMeter: plan.leadMeter });
        lib.update(ntf, asset.documentId, change, callback);
      });
    }
  },

  // Parts used come out of stock; low stock is flagged for reorder.
  ruleStock : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && ntf.document.transition.to === 'Complete'; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var used = {};
      (ntf.document.lineItemsArr || []).forEach(function (line) {
        var material = line.kind === 'part' && line.materialRel && line.materialRel[0];
        if (material) used[material.documentId] = (used[material.documentId] || 0) + (Number(line.qty) || 0);
      });
      var ids = Object.keys(used);
      var next = function (i) {
        if (i >= ids.length) { callback(); return; }
        lib.byId(ntf, ids[i], function (err, material) {
          if (!material) { next(i + 1); return; }
          var qty = Math.max(0, Number(material.qtyAvailable || 0) - used[ids[i]]);
          lib.update(ntf, ids[i], { qtyAvailable: qty, reorderBool: qty <= Number(material.reorderThreshold || 0) }, function () { next(i + 1); });
        });
      };
      next(0);
    }
  }`,
    { logic: true },
  );
}

// ------------------------------------------------------------------------------------------------
// Fuel and materials
// ------------------------------------------------------------------------------------------------

export function fuelServerRules() {
  return ruleset(
    'Fleet Fuel - PreSaveServer',
    `${SERVER_INIT}

  // Checked like FLEET's fuel import: against the tank, the expected range and the previous fill.
  ruleFuelCheck : {
    ruleCondition : true,
    ruleAction : function (ntf, callback) {
      var lib = ntf.lib;
      var d = ntf.document;
      var asset = lib.first(d.assetRel);
      if (!asset) { ntf.errorMessage = 'Choose the asset.'; callback(); return; }
      lib.byId(ntf, asset.documentId, function (err, current) {
        var previous = { query: { bool: { filter: [{ term: { appTags: 'fuelReceipt' } }, { term: { 'assetRel.documentId': asset.documentId } }, { range: { fuelDate: { lt: d.fuelDate } } }], must_not: [{ term: { documentId: d.documentId } }] } }, sort: [{ fuelDate: 'desc' }], size: 1 };
        lib.search(ntf, previous, function (err2, docs) {
          var last = docs && docs[0];
          var check = lib.fuelCheck({ litres: d.litresNum, meter: d.meterReadingNum, previousMeter: last ? last.meterReadingNum : null, tankCapacity: current ? current.tankCapacityL : null, rangeKm: current ? current.rangeKm : null });
          d.fuelFlags = check.flags;
          d.fuelFlagsText = check.flags.join(', ');
          d.distanceNum = check.distance === undefined ? null : check.distance;
          d.consumptionNum = check.litresPer100km === undefined ? null : check.litresPer100km;
          d.transition = d.lastStatus ? null : { from: '', to: 'Recorded', at: new Date().toISOString() };
          d.lastStatus = 'Recorded';
          callback();
        });
      });
    }
  }`,
    { logic: true },
  );
}

export function fuelPostRules() {
  return ruleset(
    'Fleet Fuel - PostSave',
    `
  // A clean receipt with a higher meter updates the asset.
  ruleMeter : {
    ruleCondition : function (ntf) { return !!ntf.document.transition && !(ntf.document.fuelFlags || []).length; },
    ruleAction : function (ntf, callback) {
      var lib = ntf.ruleset.lib;
      var asset = lib.first(ntf.document.assetRel);
      lib.byId(ntf, asset.documentId, function (err, current) {
        if (!current || Number(ntf.document.meterReadingNum) <= Number(current.meterReadingNum || 0)) { callback(); return; }
        lib.update(ntf, asset.documentId, { meterReadingNum: Number(ntf.document.meterReadingNum), meterReadingDate: ntf.document.fuelDate }, callback);
      });
    }
  }`,
  );
}

export function materialServerRules() {
  return ruleset(
    'Fleet Material - PreSaveServer',
    `
  ruleReorder : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var d = ntf.document;
      d.reorderBool = Number(d.qtyAvailable || 0) <= Number(d.reorderThreshold || 0);
    }
  }`,
  );
}

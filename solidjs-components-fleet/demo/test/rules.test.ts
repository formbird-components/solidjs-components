// The fleet rulesets as the platform runs them: each DSL evaluated to its object (without the
// JayRule include), then the shared validators and the async guard called directly.
import { describe, expect, it } from 'vitest';
// Plain JavaScript modules (the demo seed); Vitest compiles them, tsc doesn't check this folder.
import * as rules from '../lib/rules.mjs';

type Lib = Record<string, (...args: any[]) => any>;
type Ruleset = { name: string; lib: Lib } & Record<string, { ruleAction?: (...args: unknown[]) => unknown }>;

const value = (name: string) => ({ documentId: `id-${name}`, name });
const statusMap = new Proxy({}, { get: (_t, kind: string) => new Proxy({}, { get: (_s, name: string) => ({ ...value(name), kind }) }) });
const STATUSES = statusMap as Record<string, Record<string, object>>;
const VALUES = statusMap as Record<string, Record<string, object>>;

function evaluate(dsl: string): Ruleset {
  const body = dsl.replace('#include "JayRule Ruleset Overlay JS",', '');
  return new Function(`return ${body}`)().ruleset as Ruleset;
}

const all = {
  assetClient: rules.assetClientRules({ statuses: STATUSES }),
  assetServer: rules.assetServerRules({ statuses: STATUSES }),
  bookingClient: rules.bookingClientRules({ statuses: STATUSES, assetFilter: { query: { bool: { filter: [] } } } }),
  bookingServer: rules.bookingServerRules({ statuses: STATUSES }),
  bookingPost: rules.bookingPostRules({ statuses: STATUSES }),
  ddClient: rules.ddClientRules(),
  ddServer: rules.ddServerRules(),
  ddPost: rules.ddPostRules({ statuses: STATUSES, values: VALUES, requestTemplateId: 'template-request' }),
  requestClient: rules.requestClientRules({ statuses: STATUSES, values: VALUES }),
  requestServer: rules.requestServerRules({ statuses: STATUSES }),
  requestPost: rules.requestPostRules({ statuses: STATUSES }),
  woClient: rules.woClientRules({ statuses: STATUSES }),
  woServer: rules.woServerRules(),
  woPost: rules.woPostRules({ statuses: STATUSES }),
  fuelServer: rules.fuelServerRules(),
  fuelPost: rules.fuelPostRules(),
  materialServer: rules.materialServerRules(),
};
const sets = Object.fromEntries(Object.entries(all).map(([key, dsl]) => [key, evaluate(dsl)])) as Record<keyof typeof all, Ruleset>;
const lib = sets.bookingServer.lib;

const DRIVER = { isManager: false, isWorkshop: false, isSupervisor: false };
const MANAGER = { isManager: true, isWorkshop: false, isSupervisor: false };
const TECHNICIAN = { isManager: false, isWorkshop: true, isSupervisor: false };
const SUPERVISOR = { isManager: false, isWorkshop: true, isSupervisor: true };
const status = (name: string) => [value(name)];
const asset = { documentId: 'asset-u301', name: 'U-301', maxBookingHours: 48, primaryMeterUnit: 'km' };

describe('every ruleset', () => {
  it('evaluates, and its async rules complete through the guard', () => {
    for (const [key, set] of Object.entries(sets)) {
      expect(set.name, key).toBeTruthy();
      for (const [ruleKey, rule] of Object.entries(set)) {
        if (!ruleKey.startsWith('rule') || typeof rule?.ruleAction !== 'function') continue;
        const source = String(rule.ruleAction);
        if (/function\s*\(ntf,\s*callback\)/.test(source)) expect(source, `${key}.${ruleKey}`).toContain('callback = ntf.ruleset.lib.once(ntf, callback)');
      }
    }
  });

  it('carries the functions its rules call', () => {
    for (const [key, set] of Object.entries(sets)) {
      const used = new Set([...Object.values(set).flatMap((rule) => (typeof rule === 'object' && rule ? Object.values(rule) : [])).map(String).join('\n').matchAll(/lib\.(\w+)\(/g)].map((m) => m[1]));
      for (const fn of used) expect(typeof set.lib[fn], `${key} uses lib.${fn}`).toBe('function');
    }
  });

  it('is the same validator in the browser and on the server', () => {
    expect(String(sets.bookingClient.lib.validateBooking)).toBe(String(sets.bookingServer.lib.validateBooking));
    expect(String(sets.woClient.lib.validateWorkOrder)).toBe(String(sets.woServer.lib.validateWorkOrder));
  });
});

describe('the async guard', () => {
  it('fails the save once when a callback throws, instead of crashing the server', () => {
    let completed = 0;
    const ntf: Record<string, any> = { ruleset: sets.bookingServer, logger: { error() {} }, userId: 'u' };
    lib.once(ntf, () => completed++);
    ntf.scope = { findDocumentsByElastic: (_q: unknown, _u: unknown, cb: (e: unknown, r: unknown) => void) => cb(null, { data: { hits: { hits: [] } } }) };
    lib.search(ntf, {}, () => {
      throw new Error('boom');
    });
    lib.fail(ntf, new Error('again'));
    expect(completed).toBe(1);
    expect(ntf.errorMessage).toContain('Fleet Booking - PreSaveServer ruleset failed: boom');
  });
});

describe('a new record', () => {
  it('starts where its workflow does, whatever the API is sent', () => {
    const booking = { assetRel: [asset], startDate: '2026-11-20T23:00:00Z', endDate: '2026-11-21T03:00:00Z' };
    expect(lib.validateBooking({ ...booking, bookingStatusRel: status('Hire Commenced'), startMeterNum: 1 }, MANAGER)).toBe('A new booking starts as Asset Reserved.');
    expect(lib.validateBooking({ ...booking, bookingStatusRel: status('Asset Reserved') }, DRIVER)).toBe('');
    expect(lib.validateRequest({ requestStatusRel: status('Open') }, DRIVER)).toBe('A new request starts as Pending, for a workshop supervisor to triage.');
    expect(lib.validateRequest({ requestStatusRel: status('Open') }, TECHNICIAN)).toBe('');
    expect(lib.validateRequest({ requestStatusRel: status('Pending') }, DRIVER)).toBe('');
    expect(lib.validateRequest({ requestStatusRel: status('Closed') }, SUPERVISOR)).toBe('A new request starts as Pending or Open.');
    const wo = { requestRel: [value('REQ-1')], workOrderTypeRel: [value('Repair')] };
    expect(lib.validateWorkOrder({ ...wo, workOrderStatusRel: status('New') }, DRIVER)).toBe('Only the workshop raises work orders.');
    expect(lib.validateWorkOrder({ ...wo, workOrderStatusRel: status('Complete'), workCompleted: 'Done' }, TECHNICIAN)).toBe('A new work order starts as New or In Progress.');
    expect(lib.validateWorkOrder({ ...wo, workOrderStatusRel: status('New') }, TECHNICIAN)).toBe('');
    const newAsset = { allocationStatus: 'Unassigned' };
    expect(lib.validateAsset({ ...newAsset, assetStatusRel: status('Active') }, DRIVER)).toBe('A new asset starts as Commission.');
    expect(lib.validateAsset({ ...newAsset, assetStatusRel: status('Active') }, MANAGER)).toBe('');
    expect(lib.validateAsset({ ...newAsset, assetStatusRel: status('Commission') }, DRIVER)).toBe('');
  });
});

describe('validateBooking', () => {
  const booking = (fields: Record<string, unknown>) => ({ assetRel: [asset], bookingStatusRel: status('Asset Reserved'), startDate: '2026-11-20T23:00:00Z', endDate: '2026-11-21T03:00:00Z', ...fields });
  it('allows only the workflow’s moves', () => {
    expect(lib.validateBooking(booking({ lastStatus: 'Closed' }), DRIVER)).toBe("A booking can't go from Closed to Asset Reserved.");
    expect(lib.validateBooking(booking({ lastStatus: 'Asset Reserved' }), DRIVER)).toBe('');
  });
  it('checks the times, letting managers exceed the maximum', () => {
    const long = booking({ endDate: '2026-11-23T23:00:00Z' });
    expect(lib.validateBooking(long, DRIVER)).toBe('This asset can be booked for at most 48 hours at a time.');
    expect(lib.validateBooking(long, MANAGER)).toBe('');
    expect(lib.validateBooking(booking({ assetRel: [] }), DRIVER)).toBe('Choose the asset to book.');
  });
  it('needs meters to commence and close, and a reason to cancel', () => {
    expect(lib.validateBooking(booking({ lastStatus: 'Asset Reserved', bookingStatusRel: status('Hire Commenced') }), DRIVER)).toBe('Enter the meter reading at the start of the hire.');
    expect(lib.validateBooking(booking({ lastStatus: 'Asset Reserved', bookingStatusRel: status('Hire Commenced'), startMeterNum: 100 }), DRIVER)).toBe('');
    expect(lib.validateBooking(booking({ lastStatus: 'Hire Commenced', bookingStatusRel: status('Closed'), startMeterNum: 100, endMeterNum: 90 }), DRIVER)).toBe('Lower than the start reading (100 km).');
    expect(lib.validateBooking(booking({ lastStatus: 'Asset Reserved', bookingStatusRel: status('Cancelled') }), DRIVER)).toBe('Choose a Reason For Cancellation.');
  });
});

describe('validateRequest', () => {
  const request = (from: string, to: string, extra: Record<string, unknown> = {}) => ({ lastStatus: from, requestStatusRel: status(to), ...extra });
  it('leaves triage, closing and cancelling to supervisors, the rest to the workshop', () => {
    expect(lib.validateRequest(request('Pending', 'Open'), DRIVER)).toBe('Only a workshop supervisor can move a request to Open.');
    expect(lib.validateRequest(request('Pending', 'Open'), TECHNICIAN)).toBe('Only a workshop supervisor can move a request to Open.');
    expect(lib.validateRequest(request('Pending', 'Open'), SUPERVISOR)).toBe('');
    expect(lib.validateRequest(request('Open', 'Drop Off'), DRIVER)).toBe('Only the workshop can move a request to Drop Off.');
    expect(lib.validateRequest(request('Open', 'Drop Off'), TECHNICIAN)).toBe('');
    expect(lib.validateRequest(request('Open', 'Closed'), SUPERVISOR)).toBe("A request can't go from Open to Closed.");
    expect(lib.validateRequest(request('Open', 'Cancelled'), SUPERVISOR)).toBe('Choose a Reason For Closing.');
    expect(lib.validateRequest(request('Open', 'Open', { deferredBool: true }), SUPERVISOR)).toBe('Give the Reason Deferred.');
  });
});

describe('validateWorkOrder', () => {
  const wo = (from: string, to: string, extra: Record<string, unknown> = {}) => ({ requestRel: [value('REQ-1')], lastStatus: from, workOrderStatusRel: status(to), workOrderTypeRel: [value('Repair')], ...extra });
  it('needs the work described, a PM Service’s readings and checks, and a supervisor to reopen', () => {
    expect(lib.validateWorkOrder(wo('In Progress', 'Complete'), TECHNICIAN)).toBe('Describe the Work Completed.');
    expect(lib.validateWorkOrder(wo('In Progress', 'Complete', { workCompleted: 'Done' }), TECHNICIAN)).toBe('');
    const pm = { workOrderTypeRel: [value('PM Service')], workCompleted: 'Done', dateAtService: '2026-11-04', meterAtServiceNum: 100 };
    expect(lib.validateWorkOrder(wo('In Progress', 'Complete', { ...pm, serviceChecksArr: [{ key: 'a', question: 'Oil', result: '' }] }), TECHNICIAN)).toBe('Answer every service check (1 left).');
    expect(lib.validateWorkOrder(wo('In Progress', 'Complete', { ...pm, serviceChecksArr: [{ key: 'a', question: 'Oil', result: 'pass' }] }), TECHNICIAN)).toBe('');
    expect(lib.validateWorkOrder(wo('Complete', 'In Progress'), TECHNICIAN)).toBe('Only a workshop supervisor can reopen a completed work order.');
    expect(lib.validateWorkOrder(wo('New', 'In Progress'), DRIVER)).toBe('Only the workshop can move a work order to In Progress.');
    expect(lib.validateWorkOrder(wo('In Progress', 'On Hold'), TECHNICIAN)).toBe('Give the Reason On Hold.');
  });
});

describe('validateAsset and validateDailyDriver', () => {
  it('keeps the lifecycle for asset managers and the responsible person when allocated', () => {
    const base = { allocationStatus: 'Unassigned', lastStatus: 'Active', assetStatusRel: status('Decommission') };
    expect(lib.validateAsset(base, DRIVER)).toBe('Only an Asset Manager can move an asset from Active to Decommission.');
    expect(lib.validateAsset(base, MANAGER)).toBe('');
    expect(lib.validateAsset({ ...base, lastStatus: 'Active', assetStatusRel: status('Disposed') }, MANAGER)).toBe("An asset can't go from Active to Disposed.");
    expect(lib.validateAsset({ ...base, assetStatusRel: status('Active'), allocationStatus: 'Permanently Assigned' }, MANAGER)).toBe('Choose a Responsible Person, or set the allocation to Unassigned.');
  });

  it('needs the mandatory checks, comments on failures and the defect described', () => {
    const checks = (result: string, comment = '') => [
      { key: 'tyres', question: 'Tyres', mandatory: true, result: 'pass' },
      { key: 'brakes', question: 'Brakes', mandatory: true, result, comment },
    ];
    expect(lib.validateDailyDriver({ checksArr: checks('') })).toBe('Mandatory Check Not Completed: Brakes.');
    expect(lib.validateDailyDriver({ checksArr: checks('fail') })).toBe('Say what is wrong with: Brakes.');
    expect(lib.validateDailyDriver({ checksArr: checks('fail', 'Soft pedal') })).toBe('Describe the defect.');
    expect(lib.validateDailyDriver({ checksArr: checks('fail', 'Soft pedal'), defectDescription: 'Soft', defectPriorityRel: [value('Urgent')] })).toBe('Tick Defect Inspection Complete to submit.');
    expect(lib.validateDailyDriver({ checksArr: checks('pass') })).toBe('');
  });
});

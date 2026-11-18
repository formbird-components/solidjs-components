import { describe, expect, it } from 'vitest';
import { certState, expiryFromIssue, missingCertificates } from '../src/logic/certs';
import { leaveApprovalSteps, leaveBalance, leavePeriodText, staffingBreaches } from '../src/logic/leave';

const DAY = 86_400_000;

describe('leaveBalance', () => {
  it('accrues pro rata from the opening balance and takes off approved and pending days', () => {
    const b = leaveBalance({
      opening: 8,
      accrualPerYear: 20,
      since: '2026-07-01',
      at: '2026-12-31',
      requests: [
        { days: 3, status: 'Approved', first: '2026-09-01' },
        { days: 2, status: 'Pending', first: '2026-12-01' },
        { days: 4, status: 'Rejected' },
        { days: 5, status: 'Cancelled' },
      ],
    });
    expect(b).toEqual({ opening: 8, accrued: 10.03, approved: 3, pending: 2, available: 13.03, perMonth: 1.67 });
  });

  it('scales by FTE, leaves out the request being checked and leave before the opening balance', () => {
    const b = leaveBalance({
      opening: 0,
      accrualPerYear: 20,
      fte: 0.6,
      since: '2026-07-01',
      at: '2027-07-01',
      exclude: 'this',
      requests: [
        { documentId: 'this', days: 5, status: 'Pending' },
        { days: 2, status: 'Approved', first: '2026-06-20' },
      ],
    });
    expect(b.accrued).toBe(12);
    expect(b.available).toBe(12);
    expect(b.perMonth).toBe(1);
  });

  it('does not accrue backwards', () => {
    expect(leaveBalance({ opening: 5, accrualPerYear: 20, since: '2026-07-01', at: '2026-06-01', requests: [] }).available).toBe(5);
  });
});

describe('staffingBreaches', () => {
  const dates = ['2026-12-07', '2026-12-08', '2026-12-09'];
  it('finds the days the team would be below its minimum', () => {
    const breaches = staffingBreaches({
      dates,
      first: '2026-12-07',
      last: '2026-12-09',
      employeeId: 'mei',
      teamSize: 5,
      min: 3,
      others: [
        { employeeId: 'lucy', first: '2026-12-08', last: '2026-12-12' },
        { employeeId: 'james', first: '2026-12-09', last: '2026-12-09', halfFirst: true },
        { employeeId: 'mei', first: '2026-12-01', last: '2026-12-20' },
      ],
    });
    // 8 Dec: Lucy and Mei away, 3 left (the minimum). 9 Dec: James is away for half the day too.
    expect(breaches).toEqual([{ date: '2026-12-09', available: 2.5 }]);
  });

  it('counts this request’s half days as half, and does nothing without a minimum', () => {
    const others = [{ employeeId: 'lucy', first: '2026-12-07', last: '2026-12-07' }];
    expect(staffingBreaches({ dates: ['2026-12-07'], first: '2026-12-07', last: '2026-12-07', halfFirst: true, employeeId: 'mei', teamSize: 4, min: 3, others })).toEqual([
      { date: '2026-12-07', available: 2.5 },
    ]);
    expect(staffingBreaches({ dates: ['2026-12-07'], employeeId: 'mei', teamSize: 4, min: 0, others })).toEqual([]);
  });
});

describe('leaveApprovalSteps', () => {
  const p = (documentId: string) => ({ documentId, name: documentId[0].toUpperCase() + documentId.slice(1) });
  const hr = [p('nadia'), p('tom')];

  it('asks the line manager, and a second approver when staffing breaks', () => {
    expect(leaveApprovalSteps({ employee: p('james'), manager: p('sarah'), skipLevel: p('david'), hr, breaches: [] })).toEqual([
      { id: 'manager', label: 'Line manager', approvers: [p('sarah')] },
    ]);
    const steps = leaveApprovalSteps({
      employee: p('mei'),
      manager: p('sarah'),
      skipLevel: p('david'),
      hr,
      breaches: [{ date: '2026-12-08', available: 2 }, { date: '2026-12-09', available: 2.5 }],
      teamName: 'Parramatta Nursing',
      teamSize: 5,
      min: 3,
    });
    expect(steps.map((s) => [s.id, s.approvers.map((a) => a.documentId)])).toEqual([
      ['manager', ['sarah']],
      ['second', ['david']],
    ]);
    expect(steps[1].reason).toBe('Parramatta Nursing would have 2 of 5 on Tue 8 Dec, Wed 9 Dec, below its minimum of 3.');
  });

  it('never has someone approve their own leave, and falls back to People & Culture', () => {
    expect(leaveApprovalSteps({ employee: p('sarah'), manager: p('sarah'), skipLevel: p('david'), hr, breaches: [] })[0].approvers).toEqual([p('david')]);
    expect(leaveApprovalSteps({ employee: p('margaret'), manager: null, skipLevel: null, hr, breaches: [] })[0].approvers).toEqual(hr);
    expect(leaveApprovalSteps({ employee: p('nadia'), manager: null, hr, breaches: [] })[0].approvers).toEqual([p('tom')]);
  });

  it('adds People & Culture for leave that needs them', () => {
    const steps = leaveApprovalSteps({ employee: p('james'), manager: p('sarah'), hr, breaches: [], needsHr: true, typeName: 'Leave without pay' });
    expect(steps.map((s) => s.id)).toEqual(['manager', 'hr']);
    expect(steps[1].reason).toBe('Leave without pay is approved by People & Culture.');
  });
});

describe('leavePeriodText', () => {
  it('says what a request covers, with its halves', () => {
    expect(leavePeriodText('2026-12-08', '2026-12-10')).toBe('Tue 8 Dec – Thu 10 Dec');
    expect(leavePeriodText('2026-12-08', '2026-12-10', true, true)).toBe('Tue 8 Dec (pm) – Thu 10 Dec (am)');
    expect(leavePeriodText('2026-12-11', '2026-12-11', false, true)).toBe('Fri 11 Dec (am)');
    expect(leavePeriodText('', '2026-12-11')).toBe('');
  });
});

describe('certificates', () => {
  const now = Date.parse('2026-11-18T00:00:00Z');
  it('says where a certificate stands', () => {
    expect(certState('2027-06-01T00:00:00Z', now)).toMatchObject({ state: 'valid', label: 'Valid' });
    expect(certState(new Date(now + 12 * DAY + 3600_000), now)).toEqual({ state: 'expiring', daysLeft: 12, label: 'Expiring' });
    expect(certState('2026-11-01T00:00:00Z', now)).toMatchObject({ state: 'expired', daysLeft: -17 });
    expect(certState('', now)).toEqual({ state: 'none', daysLeft: null, label: 'No expiry' });
    expect(certState(new Date(now + 40 * DAY), now, 60).state).toBe('expiring');
  });

  it('works out the expiry from the issue date', () => {
    expect(expiryFromIssue('2025-03-14T00:00:00.000Z', 12)).toBe('2026-03-14T00:00:00.000Z');
    expect(expiryFromIssue('2026-01-31T00:00:00.000Z', 1)).toBe('2026-02-28T00:00:00.000Z');
    expect(expiryFromIssue('2026-01-31T00:00:00.000Z', 0)).toBe('');
  });

  it('lists required certificates not held in date', () => {
    const required = [{ documentId: 'cpr', name: 'CPR' }, { documentId: 'wwcc', name: 'Working with Children Check' }, { documentId: 'police', name: 'National Police Check' }];
    const held = [{ typeId: 'cpr', expiryDate: '2027-01-01T00:00:00Z' }, { typeId: 'wwcc', expiryDate: '2026-10-01T00:00:00Z' }];
    expect(missingCertificates(required, held, now)).toEqual(['Working with Children Check', 'National Police Check']);
  });

  it('is self-contained, so a ruleset can carry its source', () => {
    for (const fn of [leaveBalance, staffingBreaches, leaveApprovalSteps, leavePeriodText, certState, expiryFromIssue, missingCertificates]) {
      // eslint-disable-next-line no-new-func
      expect(typeof new Function(`return (${String(fn)})`)()).toBe('function');
    }
  });
});

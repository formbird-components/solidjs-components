import { describe, expect, it } from 'vitest';
import { approvalProblems, approvalStatus, canDecide, mergeApprovalChain, type ApprovalChain, type ApprovalStep } from '../src/domain/approval';

const daniel = { documentId: 'daniel', name: 'Daniel Okafor' };
const sophie = { documentId: 'sophie', name: 'Sophie Laurent' };
const marcus = { documentId: 'marcus', name: 'Marcus Webb' };
const grace = { documentId: 'grace', name: 'Grace Kim' };

const plan = (): ApprovalStep[] => [
  { id: 'manager', label: 'Line manager', approvers: [daniel] },
  { id: 'second', label: 'Second approver', reason: 'Below minimum staffing on Tue 9 Dec', approvers: [marcus, sophie] },
];
const chain = (...decisions: Partial<ApprovalStep>[]): ApprovalChain => ({ steps: plan().map((step, i) => ({ ...step, decision: '', ...(decisions[i] ?? {}) })) });

describe('approvalStatus', () => {
  it('waits on the first undecided step, its approvers and delegate', () => {
    expect(approvalStatus(chain())).toMatchObject({ state: 'pending', current: 0, waitingOn: [daniel], approved: 0, total: 2 });
    const delegated = chain({ delegate: grace });
    expect(approvalStatus(delegated).waitingOn).toEqual([daniel, grace]);
    expect(approvalStatus(chain({ decision: 'approved', decidedBy: daniel }))).toMatchObject({ state: 'pending', current: 1, waitingOn: [marcus, sophie], approved: 1 });
  });

  it('is approved when every step is, rejected when one is', () => {
    expect(approvalStatus(chain({ decision: 'approved' }, { decision: 'approved' })).state).toBe('approved');
    expect(approvalStatus(chain({ decision: 'rejected' })).state).toBe('rejected');
    expect(approvalStatus(chain({ decision: 'rejected' })).current).toBe(-1);
    expect(approvalStatus(null).state).toBe('none');
    expect(approvalStatus({ steps: [] }).state).toBe('none');
  });
});

describe('canDecide', () => {
  it('lets the current step’s approvers and delegate decide, nobody else', () => {
    expect(canDecide(chain(), 'daniel')).toBe(true);
    expect(canDecide(chain(), 'marcus')).toBe(false);
    expect(canDecide(chain({ delegate: grace }), 'grace')).toBe(true);
    expect(canDecide(chain({ decision: 'approved' }), 'sophie')).toBe(true);
    expect(canDecide(chain({ decision: 'rejected' }), 'sophie')).toBe(false);
    expect(canDecide(chain({ decision: 'approved' }, { decision: 'approved' }), 'daniel')).toBe(false);
    expect(canDecide(chain(), '')).toBe(false);
  });
});

describe('approvalProblems', () => {
  it('accepts a decision by the current step’s approver', () => {
    expect(approvalProblems(chain(), chain({ decision: 'approved', decidedBy: daniel }), 'daniel')).toEqual([]);
    expect(approvalProblems(chain({ decision: 'approved' }), chain({ decision: 'approved' }, { decision: 'approved', decidedBy: sophie }), 'sophie')).toEqual([]);
  });

  it('refuses someone else, the wrong step, a decision in another name, or two at once', () => {
    expect(approvalProblems(chain(), chain({ decision: 'approved', decidedBy: daniel }), 'marcus')).toEqual(['Only Daniel Okafor can decide the Line manager step.']);
    expect(approvalProblems(chain(), chain({}, { decision: 'approved', decidedBy: marcus }), 'marcus')).toEqual(["It isn't the Second approver step's turn yet."]);
    expect(approvalProblems(chain(), chain({ decision: 'approved', decidedBy: grace }), 'daniel')).toEqual(['A decision is recorded in the name of the person who makes it.']);
    expect(approvalProblems(chain(), chain({ decision: 'approved', decidedBy: daniel }, { decision: 'approved', decidedBy: daniel }), 'daniel')).toContain('Decide one step at a time.');
  });

  it('needs a reason to reject, and keeps decisions', () => {
    expect(approvalProblems(chain(), chain({ decision: 'rejected', decidedBy: daniel }), 'daniel')).toEqual(['Say why you are rejecting it.']);
    expect(approvalProblems(chain(), chain({ decision: 'rejected', decidedBy: daniel, comment: 'Two others are away that week.' }), 'daniel')).toEqual([]);
    expect(approvalProblems(chain({ decision: 'approved' }), chain({ decision: '' }), 'daniel')).toEqual(["The Line manager decision has been made and can't be changed."]);
  });

  it('lets an approver delegate an undecided step to someone else, and the delegate decide', () => {
    expect(approvalProblems(chain(), chain({ delegate: grace, delegatedBy: daniel }), 'daniel')).toEqual([]);
    expect(approvalProblems(chain(), chain({ delegate: grace }), 'grace')).toEqual(['Only an approver of the Line manager step can delegate it.']);
    expect(approvalProblems(chain({}, {}), chain({}, { delegate: marcus }), 'sophie')).toEqual(['Marcus Webb already approves the Second approver step.']);
    expect(approvalProblems(chain({ delegate: grace }), chain({ delegate: grace, decision: 'approved', decidedBy: grace }), 'grace')).toEqual([]);
    expect(approvalProblems(chain({ decision: 'approved' }), chain({ decision: 'approved', delegate: grace }), 'daniel')).toEqual([
      'The Line manager step has been decided: it can\'t be delegated now.',
    ]);
  });

  it('judges a new record’s chain from its own steps', () => {
    expect(approvalProblems(null, chain(), 'aisha')).toEqual([]);
    expect(approvalProblems(null, chain({ decision: 'approved', decidedBy: daniel }), 'daniel')).toEqual([]);
  });
});

describe('mergeApprovalChain', () => {
  it('keeps decisions and delegations of planned steps', () => {
    const merged = mergeApprovalChain(plan(), chain({ decision: 'approved', decidedBy: daniel, decidedAt: '2026-11-05T01:00:00.000Z' }, { delegate: grace, delegatedBy: sophie }));
    expect(merged.steps.map((s) => [s.id, s.decision, s.delegate?.name ?? null])).toEqual([
      ['manager', 'approved', null],
      ['second', '', 'Grace Kim'],
    ]);
  });

  it('drops undecided steps no longer needed, keeps decided ones, adds new ones', () => {
    const managerOnly = plan().slice(0, 1);
    expect(mergeApprovalChain(managerOnly, chain()).steps.map((s) => s.id)).toEqual(['manager']);
    const decidedSecond = { steps: [{ ...plan()[1], decision: 'approved' as const, decidedBy: sophie }] };
    expect(mergeApprovalChain(managerOnly, decidedSecond).steps.map((s) => [s.id, s.decision])).toEqual([
      ['second', 'approved'],
      ['manager', ''],
    ]);
    expect(mergeApprovalChain(plan(), { steps: [{ ...plan()[0], decision: 'approved' as const }] }).steps.map((s) => [s.id, s.decision])).toEqual([
      ['manager', 'approved'],
      ['second', ''],
    ]);
  });

  it('is self-contained, so a ruleset can carry its source', () => {
    for (const fn of [approvalStatus, canDecide, approvalProblems, mergeApprovalChain]) {
      // eslint-disable-next-line no-new-func
      expect(typeof new Function(`return (${String(fn)})`)()).toBe('function');
    }
    // eslint-disable-next-line no-new-func
    const copy = new Function(`return (${String(approvalProblems)})`)();
    expect(copy(chain(), chain({ decision: 'approved', decidedBy: daniel }), 'marcus')).toEqual(['Only Daniel Okafor can decide the Line manager step.']);
  });
});

import { describe, expect, it } from 'vitest';
import { checklistOutcome, type CheckItem } from '../src/domain/checklist';

describe('checklistOutcome', () => {
  const item = (key: string, result: CheckItem['result'], extra: Partial<CheckItem> = {}): CheckItem => ({ key, question: `Check ${key}`, result, ...extra });

  it('passes when every mandatory check is answered and nothing failed', () => {
    const outcome = checklistOutcome([item('a', 'pass', { mandatory: true }), item('b', 'na'), item('c', 'pass')]);
    expect(outcome).toMatchObject({ total: 3, answered: 3, passed: 2, na: 1, failed: 0, complete: true, result: 'Pass' });
  });

  it('reports defects, missing mandatory checks and failures without a comment', () => {
    const outcome = checklistOutcome([item('a', 'fail', { comment: 'Cracked' }), item('b', '', { mandatory: true }), item('c', 'fail')]);
    expect(outcome.missingMandatory).toEqual(['Check b']);
    expect(outcome.failsWithoutComment).toEqual(['Check c']);
    expect(outcome.result).toBe('Incomplete');
    const fixed = checklistOutcome([item('a', 'fail', { comment: 'Cracked' }), item('b', 'pass', { mandatory: true })]);
    expect(fixed.result).toBe('Defects found');
    expect(checklistOutcome([item('c', 'fail')], { commentOnFail: false }).result).toBe('Defects found');
    expect(checklistOutcome([]).result).toBe('Incomplete');
  });

  it('uses the fail label the sheet gives', () => {
    const items = [item('a', 'fail', { comment: 'Frayed lead' }), item('b', 'pass')];
    expect(checklistOutcome(items, { failLabel: 'Hazards found' }).result).toBe('Hazards found');
  });
});

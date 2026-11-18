import { describe, expect, it } from 'vitest';
import { actionDueDate, actionState, actionsSummary, CONTROL_LEVELS, controlRank } from '../src/logic/actions';
import { controlProblem, nextReviewDate } from '../src/logic/hazard';
import { injuryClass, injuryRates, notifiable, reportingDelayHours, TREATMENTS } from '../src/logic/incident';
import { CONSEQUENCES, LIKELIHOODS, MATRIX, RATINGS, residualProblem, riskRating, riskResponse } from '../src/logic/risk';
import { causeProblems, causeSummary, type CauseTree } from '../src/logic/rootcause';

describe('risk matrix', () => {
  it('rates every cell the way the exported matrix shows it', () => {
    for (const l of LIKELIHOODS) for (const c of CONSEQUENCES) {
      expect(riskRating(l.level, c.level)).toEqual({ score: l.level * c.level, rating: MATRIX[l.level - 1][c.level - 1] });
    }
  });

  it('gives nothing for missing or out-of-range levels', () => {
    expect(riskRating(null, 3)).toBeNull();
    expect(riskRating(0, 3)).toBeNull();
    expect(riskRating(3, 6)).toBeNull();
    expect(riskRating(2.5, 3)).toBeNull();
    expect(riskRating('4', '5')).toEqual({ score: 20, rating: 'Extreme' });
  });

  it('asks more, faster, of a higher rating', () => {
    const responses = RATINGS.map((r) => riskResponse(r)!);
    for (let i = 1; i < responses.length; i++) {
      expect(responses[i].actionDays).toBeLessThan(responses[i - 1].actionDays);
      expect(responses[i].respondHours).toBeLessThan(responses[i - 1].respondHours);
      expect(responses[i].notify.length).toBeGreaterThan(responses[i - 1].notify.length);
    }
    expect(riskResponse('High')).toMatchObject({ investigation: 'full', closeBy: 'Manager' });
    expect(riskResponse('Extreme')?.notify).toContain('Executive');
    expect(riskResponse('Unknown')).toBeNull();
  });

  it("refuses a residual risk higher than the inherent one", () => {
    const inherent = { likelihood: 4, consequence: 4, score: 16, rating: 'High' as const };
    expect(residualProblem(inherent, { likelihood: 2, consequence: 4, score: 8, rating: 'Medium' })).toBe('');
    expect(residualProblem(inherent, { likelihood: 5, consequence: 4, score: 20, rating: 'Extreme' })).toMatch(/can't be higher/);
    expect(residualProblem(inherent, { likelihood: 2, consequence: 5, score: 10, rating: 'High' })).toMatch(/neither can go up/);
    expect(residualProblem(inherent, null)).toBe('');
  });
});

describe('incidents', () => {
  it('classes injuries by treatment', () => {
    expect(TREATMENTS.map((t) => injuryClass(t)?.code)).toEqual(['NTI', 'FAI', 'MTI', 'RWI', 'LTI', 'LTI', 'FAT']);
    expect(injuryClass('First aid')).toMatchObject({ recordable: false, lostTime: false });
    expect(injuryClass('Restricted duties')).toMatchObject({ recordable: true, lostTime: false });
    expect(injuryClass('Lost time')).toMatchObject({ recordable: true, lostTime: true });
    expect(injuryClass('')).toBeNull();
  });

  it('finds notifiable incidents and says why', () => {
    expect(notifiable({ type: 'Injury', treatment: 'First aid', natures: [{ name: 'Laceration' }] })).toEqual({ notifiable: false, reasons: [] });
    expect(notifiable({ type: 'Injury', treatment: 'Medical treatment', natures: [{ name: 'Amputation', serious: true }] })).toEqual({
      notifiable: true,
      reasons: ['Serious injury: amputation'],
    });
    expect(notifiable({ type: 'Injury', treatment: 'Hospitalised (in-patient)' }).reasons).toEqual(['Treatment as an in-patient in a hospital']);
    expect(notifiable({ type: 'Dangerous incident', dangerousKind: 'Collapse of a structure' }).reasons).toEqual(['Dangerous incident: collapse of a structure']);
    expect(notifiable({ type: 'Near miss', treatment: 'Fatality' }).reasons).toEqual(['A person died']);
  });

  it('measures the reporting delay and injury rates', () => {
    expect(reportingDelayHours('2026-11-01T00:00:00Z', '2026-11-02T06:00:00Z')).toBe(30);
    expect(reportingDelayHours('', '2026-11-02T06:00:00Z')).toBeNull();
    expect(injuryRates({ lostTime: 2, recordable: 5, hours: 400_000 })).toEqual({ ltifr: 5, trifr: 12.5 });
    expect(injuryRates({ lostTime: 0, recordable: 0, hours: 0 })).toBeNull();
  });
});

describe('corrective actions', () => {
  const now = Date.parse('2026-11-05T00:00:00Z');

  it('ranks controls as the hierarchy lists them', () => {
    for (const level of CONTROL_LEVELS) expect(controlRank(level.name)).toBe(level.rank);
    expect(controlRank('Hope')).toBe(99);
  });

  it('dates actions to the end of the working day', () => {
    // 5 Nov 00:00 UTC is 10 am in eastern Australia; 7 days on, 5 pm there is 07:00 UTC.
    expect(actionDueDate('2026-11-05T00:00:00Z', 7)).toBe('2026-11-12T07:00:00.000Z');
    // 5 Nov 20:00 UTC is already 6 Nov in eastern Australia.
    expect(actionDueDate('2026-11-05T20:00:00Z', 1)).toBe('2026-11-07T07:00:00.000Z');
  });

  it('knows overdue, due soon, done and cancelled', () => {
    expect(actionState({ status: 'Open', dueDate: '2026-11-04T07:00:00Z' }, now)).toBe('overdue');
    expect(actionState({ status: 'In Progress', dueDate: '2026-11-06T07:00:00Z' }, now)).toBe('dueSoon');
    expect(actionState({ status: 'Open', dueDate: '2026-12-01T07:00:00Z' }, now)).toBe('open');
    expect(actionState({ status: 'Verified', dueDate: '2026-11-01T07:00:00Z' }, now)).toBe('done');
    expect(actionState({ status: 'Cancelled' }, now)).toBe('cancelled');
  });

  it('sums up a list, ignoring cancelled actions', () => {
    const summary = actionsSummary(
      [
        { status: 'Open', dueDate: '2026-11-01T07:00:00Z', controlLevel: 'PPE' },
        { status: 'Completed', dueDate: '2026-11-01T07:00:00Z', controlLevel: 'Engineering' },
        { status: 'Verified', controlLevel: 'Administrative' },
        { status: 'Cancelled', controlLevel: 'Eliminate' },
      ],
      now,
    );
    expect(summary).toEqual({ total: 3, open: 1, overdue: 1, done: 2, verified: 1, cancelled: 1, strongestRank: 4 });
    expect(actionsSummary([], now).strongestRank).toBe(99);
  });
});

describe('five whys', () => {
  const tree: CauseTree = {
    problem: 'Forklift struck racking upright',
    nodes: [
      {
        id: 'a',
        text: 'The operator could not see the upright',
        children: [
          {
            id: 'b',
            text: 'The load was stacked above eye level',
            children: [{ id: 'c', text: 'No height limit for loads on the trucks', root: true, category: 'Procedure' }],
          },
        ],
      },
      { id: 'd', text: 'The aisle lights were out', children: [{ id: 'e', text: 'No-one reports faulty lighting', root: true }] },
    ],
  };

  it('counts whys, depth and root causes', () => {
    expect(causeSummary(tree)).toEqual({
      whys: 5,
      depth: 3,
      roots: [
        { text: 'No height limit for loads on the trucks', category: 'Procedure', depth: 3 },
        { text: 'No-one reports faulty lighting', category: '', depth: 2 },
      ],
      blank: 0,
    });
  });

  it('says what an unfinished investigation still needs', () => {
    expect(causeProblems(tree)).toEqual(['Give each root cause a category.', 'Ask why at least 3 times before settling on a root cause.']);
    expect(causeProblems(tree, { minDepth: 2 })).toEqual(['Give each root cause a category.']);
    expect(causeProblems({ problem: '', nodes: [{ id: 'x', text: '' }] })).toEqual([
      'Say what the problem is before asking why.',
      'Ask why it happened, at least once.',
      'One why has no answer: fill it in or remove it.',
    ]);
    expect(causeProblems({ problem: 'Spill', nodes: [{ id: 'x', text: 'Drum leaked' }] })).toEqual(['Mark at least one answer as a root cause.']);
  });
});

describe('hazards', () => {
  it('schedules reviews by residual rating, at month ends too', () => {
    expect(nextReviewDate('2026-01-15T00:00:00Z', 'High')).toBe('2026-04-15T00:00:00.000Z');
    expect(nextReviewDate('2026-01-31T00:00:00Z', 'Extreme')).toBe('2026-02-28T00:00:00.000Z');
    expect(nextReviewDate('2026-01-31T00:00:00Z', 'None')).toBe('');
  });

  it('asks for strong enough controls', () => {
    expect(controlProblem({ inherent: 'High', residual: 'Medium', strongestRank: 4 })).toBe('');
    expect(controlProblem({ inherent: 'High', residual: 'Medium', strongestRank: 5 })).toMatch(/Engineering or above/);
    expect(controlProblem({ inherent: 'High', residual: 'Medium', strongestRank: 5, justification: 'Temporary site' })).toBe('');
    expect(controlProblem({ inherent: 'Medium', residual: 'Low', strongestRank: 6 })).toBe('');
    expect(controlProblem({ inherent: 'Extreme', residual: 'Extreme', strongestRank: 1 })).toMatch(/can't continue/);
    expect(controlProblem({ inherent: 'Low', residual: 'Low', strongestRank: 99 })).toMatch(/at least one control/);
  });
});

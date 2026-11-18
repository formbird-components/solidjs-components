import { describe, expect, it } from 'vitest';
import { compliance, latestCerts, matrixCell, shortName } from '../src/matrix';
import { buildOrgTree, reportingLine, searchPeople, type OrgPerson } from '../src/orgtree';

const now = Date.parse('2026-11-18T00:00:00Z');
const DAY = 86_400_000;

describe('org tree', () => {
  const p = (id: string, managerId = '', title = 'Nurse', team = 'Nursing'): OrgPerson => ({ id, name: id[0].toUpperCase() + id.slice(1), title, team, color: '', managerId });
  const people = [p('margaret'), p('david', 'margaret'), p('sarah', 'david', 'Nurse Unit Manager'), p('james', 'sarah'), p('mei', 'sarah'), p('raj', 'margaret', 'Finance Manager', 'Finance'), p('lost', 'nobody'), p('loopA', 'loopB'), p('loopB', 'loopA')];

  it('arranges people under their managers, bigger teams first', () => {
    const { roots, byId } = buildOrgTree(people);
    expect(roots.map((r) => r.person.id)).toEqual(['margaret', 'loopA', 'loopB', 'lost'].filter((id) => roots.some((r) => r.person.id === id)));
    const margaret = byId.get('margaret')!;
    expect(margaret.size).toBe(5);
    expect(margaret.children.map((c) => c.person.id)).toEqual(['david', 'raj']);
    expect(byId.get('james')!.depth).toBe(3);
  });

  it('gives the reporting line and finds people', () => {
    const { byId } = buildOrgTree(people);
    expect(reportingLine('mei', byId)).toEqual(['margaret', 'david', 'sarah', 'mei']);
    expect(reportingLine('ghost', byId)).toEqual([]);
    expect(searchPeople(people, 'finance')).toEqual(['raj']);
    expect(searchPeople(people, '  ')).toEqual([]);
  });
});

describe('skills matrix', () => {
  const cert = (personId: string, typeId: string, expiryDate: string, issuedDate = '2025-01-01') => ({ documentId: `${personId}-${typeId}-${expiryDate}`, personId, typeId, expiryDate, issuedDate });

  it('keeps the latest certificate of each type', () => {
    const map = latestCerts([cert('james', 'cpr', '2026-01-01'), cert('james', 'cpr', '2027-01-01'), cert('james', 'first-aid', '')]);
    expect(map.get('james')!.get('cpr')!.expiryDate).toBe('2027-01-01');
    expect(map.get('james')!.get('first-aid')!.expiryDate).toBe('');
  });

  it('says what each cell shows', () => {
    const iso = (days: number) => new Date(now + days * DAY).toISOString();
    expect(matrixCell(cert('j', 'cpr', iso(200)), true, now).kind).toBe('valid');
    expect(matrixCell(cert('j', 'cpr', iso(10.5)), true, now)).toMatchObject({ kind: 'expiring', daysLeft: 10 });
    expect(matrixCell(cert('j', 'cpr', iso(-3)), true, now).kind).toBe('expired');
    expect(matrixCell(undefined, true, now).kind).toBe('missing');
    expect(matrixCell(undefined, false, now).kind).toBe('empty');
    expect(matrixCell(cert('j', 'cpr', iso(200)), false, now).kind).toBe('held');
    expect(matrixCell(cert('j', 'cpr', iso(-3)), false, now).kind).toBe('expired');
  });

  it('sums up compliance', () => {
    const cells = [
      { kind: 'valid', required: true, daysLeft: 100 },
      { kind: 'expiring', required: true, daysLeft: 5 },
      { kind: 'missing', required: true, daysLeft: null },
      { kind: 'expired', required: true, daysLeft: -2 },
      { kind: 'held', required: false, daysLeft: 50 },
    ] as const;
    expect(compliance([...cells])).toEqual({ required: 4, ok: 2, expiring: 1, expired: 1, missing: 1, percent: 50 });
    expect(compliance([]).percent).toBe(null);
  });

  it('shortens long type names', () => {
    expect(shortName('Working with Children Check')).toBe('WWCC');
    expect(shortName('CPR')).toBe('CPR');
    expect(shortName('Medication Administration', 'Meds')).toBe('Meds');
  });
});

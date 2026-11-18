import { describe, expect, it } from 'vitest';
import { assetKind, iconSetForField, workKind } from '../src/domain/lookups';
import { daysUntil, dueText, formatDuration, formatMoney, formatNumber } from '../src/host/format';

describe('assetKind', () => {
  it.each([
    ['Panel van', 'van'],
    ['Toyota HiAce', 'van'],
    ['Dual cab ute', 'ute'],
    ['Passenger Vehicle Utility', 'ute'],
    ['Passenger vehicle (sedan)', 'car'],
    ['Pool car', 'car'],
    ['Heavy Vehicle - Truck', 'truck'],
    ['Tipper truck', 'truck'],
    ['Box trailer', 'trailer'],
    ['Plant trailer', 'trailer'],
    ['Forklift', 'forklift'],
    ['Mini excavator', 'excavator'],
    ['Generator 20 kVA', 'generator'],
    ['Scissor lift (EWP)', 'lift'],
    ['Minibus', 'bus'],
    ['Concrete saw', 'equipment'],
  ])('%s → %s', (name, kind) => expect(assetKind(name)).toBe(kind));
});

describe('workKind', () => {
  it.each([
    ['Scheduled service', 'service'],
    ['PM Service', 'service'],
    ['Repair', 'repair'],
    ['Repair/General Request', 'repair'],
    ['Daily Driver Defect', 'repair'],
    ['Breakdown', 'repair'],
    ['Pre/Post Hire Inspection', 'inspection'],
    ['Tyres', 'tyres'],
    ['Accident Damage', 'damage'],
    ['Recall', 'recall'],
    ['Registration and Insurance', 'compliance'],
    ['Diagnose', 'generic'],
  ])('%s → %s', (name, kind) => expect(workKind(name)).toBe(kind));
});

describe('priorityLevel', () => {
  it('reads Formbird FLEET priorities', async () => {
    const { priorityLevel } = await import('../src/domain/lookups');
    expect(priorityLevel('Urgent – Asset Out of Service')).toBe('highest');
    expect(priorityLevel('Non-Urgent – Asset Operational')).toBe('low');
    expect(priorityLevel('Non Urgent')).toBe('low');
  });
});

describe('iconSetForField', () => {
  it('knows asset types and maintenance work before generic types', () => {
    expect(iconSetForField('assetTypeRel')).toBe('asset');
    expect(iconSetForField('workOrderTypeRel')).toBe('work');
    expect(iconSetForField('requestTypeRel')).toBe('work');
    expect(iconSetForField('typeRel')).toBe('type');
    expect(iconSetForField('priorityRel')).toBe('priority');
  });
});

describe('number, money and time formatting', () => {
  it('formats numbers and money, and ignores what is not a number', () => {
    expect(formatNumber(48210)).toBe((48210).toLocaleString());
    expect(formatNumber('12.25')).toBe((12.3).toLocaleString());
    expect(formatNumber('')).toBe('');
    expect(formatNumber(null)).toBe('');
    expect(formatMoney(1240.5)).toContain('1,240.50');
    expect(formatMoney(undefined)).toBe('');
  });

  it('formats durations compactly', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 min');
    expect(formatDuration(150 * 60_000)).toBe('2 h 30 min');
    expect(formatDuration(3 * 3_600_000)).toBe('3 h');
    expect(formatDuration((3 * 24 + 4) * 3_600_000)).toBe('3 d 4 h');
    expect(formatDuration(-1)).toBe('');
  });

  it('says how far away a due date is, by calendar day', () => {
    const now = new Date(2026, 10, 4, 15, 0).getTime();
    expect(dueText(new Date(2026, 10, 4, 9, 0), now)).toBe('today');
    expect(dueText(new Date(2026, 10, 5, 1, 0), now)).toBe('tomorrow');
    expect(dueText(new Date(2026, 10, 12), now)).toBe('in 8 days');
    expect(dueText(new Date(2026, 10, 3), now)).toBe('yesterday');
    expect(dueText(new Date(2026, 9, 30), now)).toBe('5 days ago');
    expect(daysUntil(new Date(2026, 10, 12), now)).toBe(8);
    expect(daysUntil('nope', now)).toBeUndefined();
  });
});

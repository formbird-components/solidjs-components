import { describe, expect, it } from 'vitest';
import { addDayKey, daysBetween, dragRange, groupStaffing, placeItems, weekStart, windowDays, type ScheduleItem } from '../src/schedule';

const item = (documentId: string, rowId: string, first: string, last: string, extra: Partial<ScheduleItem> = {}): ScheduleItem => ({
  documentId,
  rowId,
  first,
  last,
  label: 'Annual leave',
  color: '#3e63dd',
  tentative: false,
  halfFirst: false,
  halfLast: false,
  title: '',
  ...extra,
});

describe('days', () => {
  it('moves and measures day keys, and finds the Monday', () => {
    expect(addDayKey('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-02', '2026-11-16')).toBe(14);
    expect(weekStart('2026-11-18')).toBe('2026-11-16'); // a Wednesday
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // a Sunday
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
  });

  it('lists the visible days with weekends, holidays, today and month starts', () => {
    const days = windowDays('2026-12-21', 14, { today: '2026-12-23', workDays: [1, 2, 3, 4, 5], holidays: new Map([['2026-12-25', 'Christmas Day']]) });
    expect(days).toHaveLength(14);
    expect(days.filter((d) => d.off).map((d) => d.key)).toEqual(['2026-12-26', '2026-12-27', '2027-01-02', '2027-01-03']);
    expect(days.find((d) => d.holiday)?.key).toBe('2026-12-25');
    expect(days.find((d) => d.today)?.key).toBe('2026-12-23');
    expect(days.filter((d) => d.monthStart).map((d) => d.key)).toEqual(['2026-12-21', '2027-01-01']);
  });
});

describe('placeItems', () => {
  it('clips items to the window and keeps their span', () => {
    const { placed } = placeItems([item('a', 'p1', '2026-11-10', '2026-11-20'), item('b', 'p1', '2026-11-28', '2026-12-04'), item('c', 'p2', '2026-12-10', '2026-12-11')], '2026-11-16', 14);
    expect(placed.map((p) => [p.documentId, p.from, p.to, p.clippedStart, p.clippedEnd])).toEqual([
      ['a', 0, 4, true, false],
      ['b', 12, 13, false, true],
    ]);
  });

  it('puts overlapping items of a row in separate lanes, and reuses free lanes', () => {
    const { placed, lanes } = placeItems(
      [item('a', 'p1', '2026-11-16', '2026-11-20'), item('b', 'p1', '2026-11-18', '2026-11-19'), item('c', 'p1', '2026-11-23', '2026-11-24'), item('d', 'p2', '2026-11-18', '2026-11-19')],
      '2026-11-16',
      14,
    );
    expect(Object.fromEntries(placed.map((p) => [p.documentId, p.lane]))).toEqual({ a: 0, b: 1, c: 0, d: 0 });
    expect(lanes.get('p1')).toBe(2);
    expect(lanes.get('p2')).toBe(1);
  });

  it('ignores items without days, or ending before they start', () => {
    expect(placeItems([item('a', 'p1', '', '2026-11-20'), item('b', 'p1', '2026-11-20', '2026-11-18')], '2026-11-16', 14).placed).toEqual([]);
  });
});

describe('groupStaffing', () => {
  const rows = [
    { id: 'p1', name: 'Ana' },
    { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cal' },
    { id: 'p4', name: 'Dee' },
  ];
  const days = windowDays('2026-11-16', 7, { today: '2026-11-16', workDays: [1, 2, 3, 4, 5], holidays: new Map() });

  it('counts who is left each day against the minimum, on work days only', () => {
    const result = groupStaffing({
      rows,
      days,
      min: 3,
      items: [item('a', 'p1', '2026-11-17', '2026-11-18'), item('b', 'p2', '2026-11-18', '2026-11-22'), item('x', 'other', '2026-11-16', '2026-11-22')],
    });
    expect(result.map((d) => d.available)).toEqual([4, 3, 2, 3, 3, 3, 3]);
    expect(result.filter((d) => d.below).map((d) => d.key)).toEqual(['2026-11-18']);
    expect(result[2].names).toEqual(['Ana', 'Ben']);
  });

  it('counts a half day as half, and pending items only when asked', () => {
    const items = [item('a', 'p1', '2026-11-16', '2026-11-17', { halfLast: true }), item('b', 'p2', '2026-11-17', '2026-11-17', { tentative: true })];
    expect(groupStaffing({ rows, days, min: 3, items }).slice(0, 2).map((d) => d.available)).toEqual([3, 3.5]);
    const counting = groupStaffing({ rows, days, min: 3, items, countTentative: true });
    expect(counting[1].available).toBe(2.5);
    expect(counting[1].below).toBe(true);
  });
});

describe('dragRange', () => {
  it('orders the days whichever way the drag went', () => {
    expect(dragRange('2026-11-20', '2026-11-17')).toEqual({ first: '2026-11-17', last: '2026-11-20' });
    expect(dragRange('2026-11-17', '2026-11-17')).toEqual({ first: '2026-11-17', last: '2026-11-17' });
  });
});

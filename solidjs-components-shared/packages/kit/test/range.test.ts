import { describe, expect, it } from 'vitest';
import { dayKey, daysOverlap, dayStart, timeRangeProblems, workingDays } from '../src/domain/range';

const at = (iso: string) => new Date(iso).toISOString();

describe('timeRangeProblems', () => {
  it('accepts a valid range and names what is missing or wrong', () => {
    expect(timeRangeProblems({ start: at('2026-11-04T09:00Z'), end: at('2026-11-04T10:00Z') })).toEqual([]);
    expect(timeRangeProblems({ start: null, end: null })).toEqual(['Choose when the booking starts and ends.']);
    expect(timeRangeProblems({ start: at('2026-11-04T10:00Z'), end: at('2026-11-04T09:00Z') })).toEqual(['The booking must end after it starts.']);
    expect(timeRangeProblems({ start: 'soon', end: 'later' })).toEqual(['The booking times are not valid dates.']);
    expect(timeRangeProblems({ start: at('2026-11-04T09:00Z'), end: at('2026-11-04T09:10Z') })).toEqual(['The booking must be at least 15 minutes long.']);
    expect(timeRangeProblems({ start: at('2026-11-04T10:00Z'), end: at('2026-11-04T09:00Z'), noun: 'job' })).toEqual(['The job must end after it starts.']);
  });

  it('checks the maximum, with the default or the caller’s message', () => {
    const long = { start: at('2026-11-04T09:00Z'), end: at('2026-11-06T09:00Z') };
    expect(timeRangeProblems({ ...long, maxHours: 24 })).toEqual(['The booking can be at most 24 hours long.']);
    expect(timeRangeProblems({ ...long, maxHours: 24, maxText: 'This asset can be booked for at most {max} hours at a time.' })).toEqual([
      'This asset can be booked for at most 24 hours at a time.',
    ]);
    expect(timeRangeProblems({ ...long, defaultMaxHours: 72 })).toEqual([]);
  });
});

describe('dayKey and dayStart', () => {
  it('reads the calendar day of an instant in a time zone', () => {
    // 22:30 UTC on 4 Nov is 9:30 am on 5 Nov in Sydney (daylight time, UTC+11).
    expect(dayKey('2026-11-04T22:30:00Z', 'Australia/Sydney')).toBe('2026-11-05');
    expect(dayKey('2026-11-04T22:30:00Z', 'UTC')).toBe('2026-11-04');
    expect(dayKey('2026-12-25')).toBe('2026-12-25');
    expect(dayKey('')).toBe('');
    expect(dayKey('not a date')).toBe('');
  });

  it('gives the instant a day starts in a time zone, across daylight saving', () => {
    expect(dayStart('2026-11-05', 'Australia/Sydney')).toBe('2026-11-04T13:00:00.000Z');
    expect(dayStart('2026-06-15', 'Australia/Sydney')).toBe('2026-06-14T14:00:00.000Z');
    // Daylight saving starts on 4 Oct 2026 at 2 am: midnight is still standard time.
    expect(dayStart('2026-10-04', 'Australia/Sydney')).toBe('2026-10-03T14:00:00.000Z');
    expect(dayStart('2026-10-05', 'Australia/Sydney')).toBe('2026-10-04T13:00:00.000Z');
    expect(dayStart('2026-11-05', 'UTC')).toBe('2026-11-05T00:00:00.000Z');
    expect(dayStart('5 Nov')).toBe('');
  });

  it('round-trips: the day a day starts on is that day', () => {
    for (const key of ['2026-01-01', '2026-04-05', '2026-10-04', '2027-02-28']) expect(dayKey(dayStart(key, 'Australia/Sydney'), 'Australia/Sydney')).toBe(key);
  });
});

describe('workingDays', () => {
  it('counts Monday to Friday, both ends included', () => {
    // Mon 2 Nov to Fri 13 Nov 2026: two working weeks.
    const range = workingDays({ first: '2026-11-02', last: '2026-11-13' });
    expect(range.days).toBe(10);
    expect(range.calendarDays).toBe(12);
    expect(range.weekends).toBe(2);
    expect(range.dates[0]).toBe('2026-11-02');
    expect(range.dates.at(-1)).toBe('2026-11-13');
  });

  it('skips public holidays on work days and reports them', () => {
    const range = workingDays({
      first: '2026-12-21',
      last: '2026-12-31',
      holidays: [{ date: '2026-12-25', name: 'Christmas Day' }, { date: '2026-12-26', name: 'Boxing Day' }, '2026-12-28'],
    });
    // 21–24, 29–31 (Sat 26 and Sun 27 are weekend; 25 and 28 are holidays on work days).
    expect(range.days).toBe(7);
    expect(range.holidays.map((h) => h.name ?? h.date)).toEqual(['Christmas Day', '2026-12-28']);
  });

  it('takes half a day off for a midday start or finish', () => {
    expect(workingDays({ first: '2026-11-02', last: '2026-11-06', halfFirst: true }).days).toBe(4.5);
    expect(workingDays({ first: '2026-11-02', last: '2026-11-06', halfFirst: true, halfLast: true }).days).toBe(4);
    expect(workingDays({ first: '2026-11-04', last: '2026-11-04', halfLast: true }).days).toBe(0.5);
    expect(workingDays({ first: '2026-11-04', last: '2026-11-04', halfFirst: true, halfLast: true }).days).toBe(0.5);
    // A half on a weekend end changes nothing.
    expect(workingDays({ first: '2026-11-02', last: '2026-11-08', halfLast: true }).days).toBe(5);
  });

  it('reads instants in the time zone, and other work weeks', () => {
    const range = workingDays({ first: dayStart('2026-11-02', 'Australia/Sydney'), last: dayStart('2026-11-03', 'Australia/Sydney'), timeZone: 'Australia/Sydney' });
    expect([range.first, range.last, range.days]).toEqual(['2026-11-02', '2026-11-03', 2]);
    expect(workingDays({ first: '2026-11-02', last: '2026-11-08', workDays: [1, 2, 3, 4] }).days).toBe(4);
  });

  it('counts nothing for a missing or backwards range', () => {
    expect(workingDays({ first: '2026-11-06', last: '2026-11-02' }).days).toBe(0);
    expect(workingDays({ first: '', last: '2026-11-02' }).days).toBe(0);
    expect(workingDays({ first: '2026-11-07', last: '2026-11-08' }).days).toBe(0);
  });

  it('is self-contained, so a ruleset can carry its source', () => {
    for (const fn of [timeRangeProblems, dayKey, dayStart, workingDays, daysOverlap]) {
      // eslint-disable-next-line no-new-func
      const copy = new Function(`return (${String(fn)})`)();
      expect(typeof copy).toBe('function');
    }
    // eslint-disable-next-line no-new-func
    const copy = new Function(`return (${String(workingDays)})`)();
    expect(copy({ first: '2026-11-02', last: '2026-11-06', halfLast: true }).days).toBe(4.5);
  });
});

describe('daysOverlap', () => {
  it('shares a day when the ranges touch or cross', () => {
    expect(daysOverlap({ first: '2026-11-02', last: '2026-11-04' }, { first: '2026-11-04', last: '2026-11-06' })).toBe(true);
    expect(daysOverlap({ first: '2026-11-02', last: '2026-11-03' }, { first: '2026-11-04', last: '2026-11-06' })).toBe(false);
    expect(daysOverlap({ first: '', last: '2026-11-03' }, { first: '2026-11-01', last: '2026-11-06' })).toBe(false);
  });
});

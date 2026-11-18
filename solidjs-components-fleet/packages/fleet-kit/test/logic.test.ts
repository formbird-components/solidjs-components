import { describe, expect, it } from 'vitest';
import { hireCost, hireHours, overlaps } from '../src/logic/booking';
import { fuelCheck, meterProblems } from '../src/logic/meter';
import { lineTotals } from '../src/logic/money';
import { nextServiceDue, serviceRemaining, serviceWarning } from '../src/logic/service';

const at = (iso: string) => new Date(iso).toISOString();
const SYD = 'Australia/Sydney';

describe('overlaps', () => {
  it('finds shared time, but not touching ends', () => {
    expect(overlaps('2026-11-04T09:00Z', '2026-11-04T11:00Z', '2026-11-04T10:00Z', '2026-11-04T12:00Z')).toBe(true);
    expect(overlaps('2026-11-04T09:00Z', '2026-11-04T11:00Z', '2026-11-04T11:00Z', '2026-11-04T12:00Z')).toBe(false);
    expect(overlaps('2026-11-04T09:00Z', '2026-11-04T17:00Z', '2026-11-04T10:00Z', '2026-11-04T11:00Z')).toBe(true);
    expect(overlaps('2026-11-04T09:00Z', '2026-11-04T10:00Z', '2026-11-05T09:00Z', '2026-11-05T10:00Z')).toBe(false);
  });
});

describe('hire', () => {
  it('counts hours to the later of the booked end and the actual close', () => {
    expect(hireHours('2026-11-04T09:00Z', '2026-11-04T11:30Z')).toBe(2.5);
    expect(hireHours('2026-11-04T09:00Z', '2026-11-04T11:00Z', '2026-11-04T12:00Z')).toBe(3);
    expect(hireHours('2026-11-04T09:00Z', '2026-11-04T11:00Z', '2026-11-04T10:00Z')).toBe(2);
  });

  it('charges hourly, capped at the daily rate per calendar day, weekends free', () => {
    // Wednesday 9:00–13:30 Sydney time: 4.5 h × $18 = $81 (under the $95 cap)
    expect(hireCost({ start: '2026-11-03T22:00Z', end: '2026-11-04T02:30Z', hourlyRate: 18, dailyRate: 95, timeZone: SYD })).toBe(81);
    // Wednesday 8:00 to Thursday 17:00 Sydney: two weekdays at the $95 cap
    expect(hireCost({ start: '2026-11-03T21:00Z', end: '2026-11-05T06:00Z', hourlyRate: 18, dailyRate: 95, timeZone: SYD })).toBe(190);
    // Friday 9:00 to Monday 9:00 Sydney: Friday (15 h → cap $95) + Monday (9 h → cap $95); Sat/Sun free
    expect(hireCost({ start: '2026-11-05T22:00Z', end: '2026-11-08T22:00Z', hourlyRate: 18, dailyRate: 95, timeZone: SYD })).toBe(190);
    // Daily rate only: any weekday used costs a day
    expect(hireCost({ start: '2026-11-03T22:00Z', end: '2026-11-03T23:00Z', dailyRate: 120, timeZone: SYD })).toBe(120);
    // An overdue return keeps counting
    expect(hireCost({ start: '2026-11-03T22:00Z', end: '2026-11-03T23:00Z', closed: '2026-11-04T00:00Z', hourlyRate: 20, timeZone: SYD })).toBe(40);
    expect(hireCost({ start: '2026-11-03T22:00Z', end: '2026-11-03T23:00Z', timeZone: SYD })).toBe(0);
  });
});

describe('service due', () => {
  it('counts the next interval from the scheduled date when late, from the actual date when early', () => {
    const early = nextServiceDue({ serviceDate: '2026-10-01T00:00Z', dueDate: '2026-10-15T00:00Z', intervalWeeks: 26 });
    expect(early.dueDate).toBe(at('2027-04-01T00:00Z'));
    const late = nextServiceDue({ serviceDate: '2026-10-20T00:00Z', dueDate: '2026-10-15T00:00Z', intervalWeeks: 26 });
    expect(late.dueDate).toBe(at('2027-04-15T00:00Z'));
  });

  it('does the same on the meter', () => {
    expect(nextServiceDue({ serviceDate: '2026-10-01T00:00Z', serviceMeter: 14_200, dueMeter: 15_000, intervalMeter: 15_000 }).dueMeter).toBe(29_200);
    expect(nextServiceDue({ serviceDate: '2026-10-01T00:00Z', serviceMeter: 15_600, dueMeter: 15_000, intervalMeter: 15_000 }).dueMeter).toBe(30_000);
    expect(nextServiceDue({ serviceDate: '2026-10-01T00:00Z', serviceMeter: 15_600, intervalMeter: 15_000 }).dueMeter).toBe(30_600);
    expect(nextServiceDue({ serviceDate: '2026-10-01T00:00Z', serviceMeter: null, intervalMeter: 15_000 })).toEqual({});
  });

  it('warns on whichever threshold comes first', () => {
    const now = new Date('2026-11-04T00:00Z').getTime();
    expect(serviceWarning({ dueDate: '2026-12-31T00:00Z', dueMeter: 60_000, meter: 50_000, now })).toBe('Not Due');
    expect(serviceWarning({ dueDate: '2026-11-20T00:00Z', dueMeter: 60_000, meter: 50_000, now })).toBe('Due Soon');
    expect(serviceWarning({ dueDate: '2026-12-31T00:00Z', dueMeter: 50_600, meter: 50_000, now })).toBe('Due Soon');
    expect(serviceWarning({ dueDate: '2026-11-01T00:00Z', dueMeter: 60_000, meter: 50_000, now })).toBe('Overdue');
    expect(serviceWarning({ dueMeter: 49_000, meter: 50_000, now })).toBe('Overdue');
    expect(serviceWarning({ now })).toBe('');
    expect(serviceRemaining({ dueDate: '2026-11-14T12:00Z', dueMeter: 50_600, meter: 50_000, now })).toEqual({ meter: 600, days: 10 });
  });
});

describe('meters and fuel', () => {
  it('flags readings below the asset meter, the start reading, or too far above', () => {
    expect(meterProblems({ reading: 48_300, assetMeter: 48_210 })).toEqual([]);
    expect(meterProblems({ reading: 48_100, assetMeter: 48_210 })).toEqual(['Primary Meter < Asset Meter (48,210 km).']);
    expect(meterProblems({ reading: 48_200, minimum: 48_250, unit: 'km' })).toEqual(['Lower than the start reading (48,250 km).']);
    expect(meterProblems({ reading: 50_000, assetMeter: 48_210, maxIncrease: 1000 })[0]).toContain('Range Error');
    expect(meterProblems({ reading: null, assetMeter: 48_210 })).toEqual([]);
  });

  it('checks fuel receipts like the fuel import', () => {
    expect(fuelCheck({ litres: 60, meter: 10_600, previousMeter: 10_000, tankCapacity: 80 })).toEqual({ flags: [], distance: 600, litresPer100km: 10 });
    expect(fuelCheck({ litres: 90, meter: 10_600, previousMeter: 10_000, tankCapacity: 80 }).flags).toEqual(['Tank Capacity Exceeded']);
    expect(fuelCheck({ litres: 60, meter: 12_000, previousMeter: 10_000, rangeKm: 900 }).flags).toEqual(['Expected Range Exceeded']);
    expect(fuelCheck({ litres: 60, meter: 9_000, previousMeter: 10_000 }).flags).toEqual(['Meter Not Increasing']);
  });
});

describe('lineTotals', () => {
  it('totals parts and labour, with GST', () => {
    const totals = lineTotals([
      { id: '1', kind: 'part', description: 'Oil filter', qty: 1, unitCost: 18.5 },
      { id: '2', kind: 'part', description: 'Engine oil 5W-30', qty: 6, unit: 'L', unitCost: 12 },
      { id: '3', kind: 'labour', description: 'Service labour', qty: 1.5, unit: 'h', unitCost: 120 },
      { id: '4', kind: 'other', description: 'Disposal', qty: 1, unitCost: 8 },
    ]);
    expect(totals).toEqual({ parts: 90.5, labour: 180, other: 8, subtotal: 278.5, tax: 27.85, total: 306.35, labourHours: 1.5 });
    expect(lineTotals(null).total).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { assignLanes, axisTicks, blockedUntil, clashes, FOREVER, shiftAnchor, windowFor, xOf } from '../src/calendar';
import { fromInputs, rangeLabel, roundUp, toDateInput, toTimeInput } from '../src/time';

const H = 3_600_000;
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('calendar windows', () => {
  it('shows a local day, or the week from Monday', () => {
    const wednesday = local(2026, 11, 4, 15, 30);
    expect(windowFor('day', wednesday)).toEqual({ start: local(2026, 11, 4), end: local(2026, 11, 5) });
    expect(windowFor('week', wednesday)).toEqual({ start: local(2026, 11, 2), end: local(2026, 11, 9) });
    expect(windowFor('week', local(2026, 11, 8, 9))).toEqual({ start: local(2026, 11, 2), end: local(2026, 11, 9) });
    expect(shiftAnchor('week', wednesday, 1)).toBe(local(2026, 11, 11, 15, 30));
    expect(shiftAnchor('day', wednesday, -1)).toBe(local(2026, 11, 3, 15, 30));
  });

  it('positions times and labels the axis', () => {
    const window = windowFor('day', local(2026, 11, 4));
    expect(xOf(local(2026, 11, 4, 9, 30), window, 40)).toBe(380);
    expect(xOf(local(2026, 11, 3, 23), window, 40)).toBe(0);
    expect(xOf(local(2026, 11, 6), window, 40)).toBe(960);
    expect(axisTicks(window, 6)).toEqual([0, 6, 12, 18].map((h) => local(2026, 11, 4, h)));
  });

  it('stacks overlapping items on lanes and finds clashes', () => {
    const items = [
      { id: 'a', start: 9 * H, end: 12 * H },
      { id: 'b', start: 11 * H, end: 13 * H },
      { id: 'c', start: 12 * H, end: 14 * H },
    ];
    const { lanes, count } = assignLanes(items);
    expect(count).toBe(2);
    expect([lanes.get('a'), lanes.get('b'), lanes.get('c')]).toEqual([0, 1, 0]);
    expect(clashes(items, 10 * H, 11.5 * H).map((i) => i.id)).toEqual(['a', 'b']);
    expect(clashes(items, 10 * H, 11.5 * H, 'a').map((i) => i.id)).toEqual(['b']);
    expect(clashes(items, 14 * H, 15 * H)).toEqual([]);
    // An open-ended block clashes with anything after it starts.
    expect(clashes([{ id: 'out', start: 8 * H, end: 9 * H, until: FOREVER }], 30 * H, 31 * H).map((i) => i.id)).toEqual(['out']);
    // A hire not returned yet blocks the next 24 hours, as the server rule does; an early return frees the rest.
    const now = 20 * H;
    const out = { id: 'out', start: 8 * H, end: 9 * H, until: blockedUntil({ end: 9 * H, overdue: true, now }) };
    expect(clashes([out], now + 23 * H, now + 25 * H).map((i) => i.id)).toEqual(['out']);
    expect(clashes([out], now + 25 * H, now + 26 * H)).toEqual([]);
    const back = { id: 'back', start: 8 * H, end: 17 * H, until: blockedUntil({ end: 17 * H, overdue: false, closed: 12 * H, now }) };
    expect(clashes([back], 13 * H, 15 * H)).toEqual([]);
    expect(clashes([back], 11 * H, 13 * H).map((i) => i.id)).toEqual(['back']);
  });
});

describe('local time inputs', () => {
  it('round-trips date and time inputs', () => {
    const iso = fromInputs('2026-11-04', '09:30')!;
    expect(toDateInput(iso)).toBe('2026-11-04');
    expect(toTimeInput(iso)).toBe('09:30');
    expect(fromInputs('', '09:30')).toBeUndefined();
    expect(roundUp(local(2026, 11, 4, 9, 10), 30)).toBe(local(2026, 11, 4, 9, 30));
    expect(rangeLabel(local(2026, 11, 4, 9), local(2026, 11, 4, 11, 30))).toMatch(/9:00.*11:30/);
  });
});

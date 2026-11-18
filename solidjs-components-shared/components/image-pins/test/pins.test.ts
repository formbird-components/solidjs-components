import { describe, expect, it } from 'vitest';
import { describePin, fraction, freeSpot, INJURY_KINDS, kindColor, NEUTRAL_PIN, parsePins, readableText, tidyPin, toKinds } from '../src/pins';

describe('pins', () => {
  it('reads stored pins, keeping what can be shown and filling ids and views', () => {
    const pins = parsePins(
      [
        { id: 'a', x: 0.25, y: 0.5, view: 'back', region: 'Lower back', kind: 'Cut', note: 'Deep' },
        { x: '0.3', y: 0.123456, view: '', region: ' ', note: '' },
        { id: 'a', x: 2, y: -1 },
        { id: 'b', x: 'left', y: 0.5 },
        null,
        'pin',
      ],
      'front',
    );
    expect(pins).toEqual([
      { id: 'a', x: 0.25, y: 0.5, view: 'back', region: 'Lower back', kind: 'Cut', note: 'Deep' },
      { id: 'pin-2', x: 0.3, y: 0.1235, view: 'front' },
      { id: 'a-3', x: 1, y: 0, view: 'front' },
    ]);
    expect(parsePins(undefined, 'front')).toEqual([]);
    expect(parsePins({ x: 1, y: 1 }, 'front')).toEqual([]);
  });

  it('tidies a pin before it is written', () => {
    expect(tidyPin({ id: 'p', x: 0.123456, y: 1.5, view: 'front', region: ' Chest ', kind: '', note: '  ' })).toEqual({ id: 'p', x: 0.1235, y: 1, view: 'front', region: 'Chest' });
    expect(fraction(Number.NaN)).toBe(0);
  });

  it('reads kinds as objects or names, with a fallback', () => {
    expect(toKinds(['Crack', { name: 'Leak', color: '#3e8ff7' }, { color: 'red' }, '', 4], [])).toEqual([
      { name: 'Crack', color: undefined },
      { name: 'Leak', color: '#3e8ff7' },
    ]);
    expect(toKinds(undefined, INJURY_KINDS).map((k) => k.name)).toEqual(['Cut', 'Bruise', 'Burn', 'Fracture', 'Sprain or strain', 'Pain', 'Other']);
  });

  it("colours a pin by its kind: the definition's colour, else a stable one from the name", () => {
    const kinds = toKinds(['Crack', { name: 'Leak', color: '#3e8ff7' }], []);
    expect(kindColor(kinds, 'leak')).toBe('#3e8ff7');
    expect(kindColor(kinds, 'Crack')).toMatch(/^#[0-9a-f]{6}$/);
    expect(kindColor(kinds, 'Crack')).toBe(kindColor(kinds, 'Crack'));
    expect(kindColor(kinds, 'Unknown')).toBe(NEUTRAL_PIN);
    expect(kindColor(kinds, undefined)).toBe(NEUTRAL_PIN);
  });

  it('picks a readable number colour for a pin', () => {
    expect(readableText('#3e63dd')).toBe('#ffffff');
    expect(readableText('#e5a000')).toBe('#1b1b24');
    expect(readableText('#fff')).toBe('#1b1b24');
    expect(readableText('#000')).toBe('#ffffff');
    expect(readableText('var(--x)')).toBe('#ffffff');
    for (const kind of INJURY_KINDS) expect(['#ffffff', '#1b1b24']).toContain(readableText(kind.color!));
  });

  it('places a new pin at the centre, or nearby when that spot is taken', () => {
    expect(freeSpot({ x: 0.5, y: 0.5 }, [], () => true)).toEqual({ x: 0.5, y: 0.5 });
    const spot = freeSpot({ x: 0.5, y: 0.5 }, [{ x: 0.5, y: 0.5 }], (x) => x >= 0.5);
    expect(spot).not.toEqual({ x: 0.5, y: 0.5 });
    expect(spot.x).toBeGreaterThanOrEqual(0.5);
    expect(Math.hypot(spot.x - 0.5, spot.y - 0.5)).toBeLessThan(0.15);
    // Nowhere allowed: the centre, even if taken.
    expect(freeSpot({ x: 0.5, y: 0.5 }, [{ x: 0.5, y: 0.5 }], () => false)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('describes a pin for buttons and lists', () => {
    expect(describePin({ id: 'p', x: 0, y: 0, view: 'front', region: 'Left knee', kind: 'Cut' }, 2, 'Front')).toBe('Pin 2: Left knee, Cut (Front)');
    expect(describePin({ id: 'p', x: 0, y: 0, view: 'image' }, 1)).toBe('Pin 1: no region');
  });
});

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BODY_VIEWS, regionAt, regionCentre, regionNames } from '../src/body';
import { BODY_REGIONS } from '../src/body-regions';
import { bodyRegionsSource } from './body-regions';

const [front, back] = BODY_VIEWS;
const at = (view: (typeof BODY_VIEWS)[number], x: number, y: number) => regionAt(view, x / view.width, y / view.height);

describe('body figure', () => {
  it('has a front and a back view made of uniquely named regions, every one listed once', () => {
    expect(BODY_VIEWS.map((v) => [v.name, v.label])).toEqual([
      ['front', 'Front'],
      ['back', 'Back'],
    ]);
    for (const view of BODY_VIEWS) {
      const drawn = view.regions.map((r) => r.name);
      expect(new Set(drawn).size).toBe(drawn.length);
      expect([...regionNames(view)].sort()).toEqual([...drawn].sort());
    }
    expect(front.regions).toHaveLength(34);
    expect(back.regions).toHaveLength(30);
    expect(regionNames(front)).toEqual(expect.arrayContaining(['Head', 'Face', 'Neck', 'Chest', 'Abdomen', 'Groin', 'Left hip', 'Right upper arm', 'Left elbow', 'Left lower leg', 'Right foot']));
    expect(regionNames(back)).toEqual(expect.arrayContaining(['Back of head', 'Back of neck', 'Upper back', 'Lower back', 'Left buttock', 'Back of right upper arm', 'Left calf', 'Right heel']));
  });

  it('finds the region under a point, the topmost one where shapes overlap', () => {
    expect(at(front, 100, 15)).toBe('Head');
    expect(at(front, 100, 48)).toBe('Face');
    expect(at(front, 100, 110)).toBe('Chest');
    expect(at(front, 100, 170)).toBe('Abdomen');
    expect(at(front, 100, 205)).toBe('Groin');
    expect(at(back, 100, 110)).toBe('Upper back');
    expect(at(back, 100, 170)).toBe('Lower back');
    expect(at(front, 5, 5)).toBeUndefined();
    expect(at(front, 100, 300)).toBeUndefined(); // between the legs
  });

  it("names sides from the person's point of view", () => {
    expect(front.personLeftOn).toBe('right');
    expect(back.personLeftOn).toBe('left');
    // The person's left thigh is on the viewer's right from the front, and on the viewer's left from behind.
    expect(at(front, 118, 255)).toBe('Left thigh');
    expect(at(front, 82, 255)).toBe('Right thigh');
    expect(at(back, 82, 255)).toBe('Back of left thigh');
    expect(at(back, 118, 255)).toBe('Back of right thigh');
  });

  it('is symmetric: a point and its mirror image are the same part on the other side', () => {
    const flip = (name: string) => name.replace(/\b(Left|Right|left|right)\b/, (side) => ({ Left: 'Right', Right: 'Left', left: 'right', right: 'left' })[side]!);
    for (const view of BODY_VIEWS) {
      for (let y = 4; y < view.height; y += 9) {
        for (let x = 3; x < view.width / 2; x += 7) {
          const here = at(view, x, y);
          const there = at(view, view.width - x, y);
          expect(there === undefined ? undefined : flip(there)).toBe(here);
        }
      }
    }
  });

  it("puts each region's listed centre on that region", () => {
    for (const view of BODY_VIEWS) {
      for (const name of regionNames(view)) {
        const centre = regionCentre(view, name)!;
        expect(centre, `${view.name} ${name}`).toBeDefined();
        expect(regionAt(view, centre.x, centre.y), `${view.name} ${name}`).toBe(name);
      }
    }
    expect(regionCentre(front, 'Tail')).toBeUndefined();
  });

  it('keeps src/body-regions.ts (plain data for demo seeds) in step with the geometry', () => {
    const file = fileURLToPath(new URL('../src/body-regions.ts', import.meta.url));
    const expected = bodyRegionsSource(BODY_VIEWS);
    if (process.env.UPDATE_BODY_REGIONS) writeFileSync(file, expected);
    expect(readFileSync(file, 'utf8'), 'src/body-regions.ts is out of date: run UPDATE_BODY_REGIONS=1 pnpm test').toBe(expected);
    expect(BODY_REGIONS.front.map((r) => r.name)).toEqual(regionNames(front));
    expect(BODY_REGIONS.back.map((r) => r.name)).toEqual(regionNames(back));
    expect(BODY_REGIONS.front.every((r) => r.x > 0 && r.x < 1 && r.y > 0 && r.y < 1)).toBe(true);
  });
});

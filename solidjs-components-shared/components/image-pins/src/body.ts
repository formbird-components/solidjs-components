// The built-in body figure (`figure: "body"`): a neutral, stylised person seen from the front and
// from the back, made of named regions. Every region is a smooth outline in a 200 × 420 box; joints
// (knees, elbows…) and caps (shoulders, the face) are drawn over the segments they join, and a point
// belongs to the topmost region under it, so the regions tile the silhouette without gaps.
//
// Left and right are the PERSON's: on the front view the person's left side is on the viewer's
// right; on the back view it is on the viewer's left.

import { BODY_REGIONS, type BodyRegionCentre } from './body-regions';
import { curve, ellipse, limb, mirrorX, shapeAt, spline, splitByCurve, visibleCentre, type Point, type Polygon, type Shape, type Station } from './geometry';

/** A named region of a figure view. */
export interface FigureRegion extends Shape {
  /** Heading the region is listed under ("Head and neck", "Torso", "Left arm"…). */
  group: string;
}

/** One view of a figure: its size, and its regions in drawing order. */
export interface FigureView {
  name: string;
  label: string;
  width: number;
  height: number;
  /** In drawing order: a point belongs to the last region containing it. */
  regions: FigureRegion[];
  /** Region names grouped and in reading order (head to toe), for lists and selects. */
  groups: { label: string; regions: string[] }[];
  /** Which side of the drawing is the person's left. */
  personLeftOn: 'left' | 'right';
}

export const BODY_WIDTH = 200;
export const BODY_HEIGHT = 420;
const AXIS = BODY_WIDTH / 2;

/** Torso half-width, every 16 units from y = 84 (shoulders) to y = 228 (top of the thighs). */
const TORSO = [37.5, 35.3, 33.6, 31.8, 29.6, 27.8, 28.8, 31.2, 31.6, 30.4];
const torsoHalfWidth = (y: number) => spline(TORSO, (y - 84) / 16);

/** The torso's left edge (as drawn) between two heights, top to bottom. */
const torsoEdge = (from: number, to: number): Point[] => {
  const steps = Math.max(2, Math.round((to - from) / 3));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const y = from + ((to - from) * i) / steps;
    return [AXIS - torsoHalfWidth(y), y] as const;
  });
};

/** An eye: an almond with pointed corners, fuller above than below. */
const almond = (cx: number, cy: number, halfWidth: number, height: number): Point[] => {
  const steps = 10;
  const top = Array.from({ length: steps + 1 }, (_, i) => {
    const x = -1 + (2 * i) / steps;
    return [cx + x * halfWidth, cy - height * (1 - x * x) * 0.62] as const;
  });
  const bottom = top.slice(1, -1).reverse().map(([x]) => {
    const u = (x - cx) / halfWidth;
    return [x, cy + height * (1 - u * u) * 0.42] as const;
  });
  return [...top, ...bottom];
};

/** A point mirrored to the other side of the figure. */
const across = ([x, y]: Point): Point => [2 * AXIS - x, y];

/**
 * A whole-width torso band: the left edge down, across, the right edge up, and an optional top.
 * @param from - Top
 * @param to - Bottom
 * @param top - Points across the top from the drawn right side to the left (default: a straight line)
 */
function torsoBand(from: number, to: number, top: Point[] = []): Point[] {
  const left = torsoEdge(from, to);
  return [...left, ...[...left].reverse().map(across), ...top];
}

/** Centre lines of the drawn-left arm and leg, shoulder to wrist and hip to ankle. */
const ARM: Station[] = [
  { x: 61, y: 98, r: 10.2 },
  { x: 55.8, y: 130, r: 9.2 },
  { x: 50.3, y: 161, r: 8.4 },
  { x: 45.6, y: 190, r: 7.6 },
  { x: 39.6, y: 225, r: 5.4 },
];
const LEG: Station[] = [
  { x: 84, y: 204, r: 16.2 },
  { x: 82.6, y: 250, r: 14.2 },
  { x: 80.6, y: 299, r: 10.9 },
  { x: 81.2, y: 322, r: 10.9 },
  { x: 80.6, y: 350, r: 8.6 },
  { x: 79.6, y: 381, r: 5.8 },
];

/** The drawn-left half of the figure, as outlines keyed by part. Mirrored for the other half. */
function sideParts() {
  /** A joint: a slightly fuller band over the limb with shallow, curved edges. */
  const joint = (stations: Station[], from: number, to: number) => limb(stations, { from, to, grow: 0.3, capStart: 0.32, capEnd: 0.32, samples: 8 });
  return {
    ear: ellipse(82.2, 37, 3.6, 6.6, -0.12, 28),
    // The shoulder is the domed top of the arm, over the corner of the torso.
    shoulder: limb(ARM, { from: 0, to: 0.62, grow: 0.4, capStart: 1, capEnd: 0.42, samples: 10 }),
    upperArm: limb(ARM, { from: 0, to: 2 }),
    elbow: joint(ARM, 1.78, 2.2),
    forearm: limb(ARM, { from: 2, to: 4 }),
    wrist: joint(ARM, 3.82, 4),
    hand: limb(
      [
        { x: 39.4, y: 227, r: 6 },
        { x: 37.3, y: 242, r: 7.3 },
        { x: 35.6, y: 254, r: 6.2 },
      ],
      { capEnd: 1 },
    ),
    thigh: limb(LEG, { from: 0, to: 2 }),
    knee: joint(LEG, 1.78, 2.22),
    lowerLeg: limb(LEG, { from: 2, to: 5 }),
    ankle: joint(LEG, 4.8, 5),
    foot: limb(
      [
        { x: 79.6, y: 382, r: 6.4 },
        { x: 78.4, y: 396, r: 9.2 },
        { x: 77.6, y: 404, r: 9 },
      ],
      { capEnd: 1 },
    ),
    heel: limb(
      [
        { x: 79.6, y: 382, r: 6.4 },
        { x: 79.6, y: 392, r: 7.6 },
        { x: 79.6, y: 396, r: 7.4 },
      ],
      { capEnd: 1 },
    ),
  };
}

const HEAD = { cx: AXIS, cy: 35, rx: 18.4, ry: 24 };
const HEAD_OUTLINE = ellipse(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, 0, 72);
/** The hairline: higher in the middle of the forehead than at the temples. */
const hairline = (x: number) => 23 + 0.022 * (x - AXIS) ** 2;
const NECK: Polygon = [
  [91.4, 46],
  [90.6, 62],
  [89.4, 80],
  [110.6, 80],
  [109.4, 62],
  [108.6, 46],
];

/** Shoulder line from the base of the neck out to the shoulder, on the drawn left. */
const SHOULDER_LINE = curve([AXIS - 10, 72.5], [AXIS - 23, 75], [AXIS - torsoHalfWidth(88), 88], 10);

/** The top of the torso: shoulder line, neckline, shoulder line (drawn right to left). */
function torsoTop(neckDip: number): Point[] {
  const left = SHOULDER_LINE;
  const right = left.map(across);
  return [...[...right].reverse(), ...curve(across(left[0]), [AXIS, 72.5 + neckDip], left[0], 8).slice(1, -1), ...left];
}

/**
 * Builds a view of the body figure.
 * @param side - "front" or "back"
 * @returns The view
 */
function buildView(side: 'front' | 'back'): FigureView {
  const front = side === 'front';
  // The drawn left half is the person's right on the front view and their left on the back view.
  const drawnLeft = front ? 'Right' : 'Left';
  const drawnRight = front ? 'Left' : 'Right';
  const parts = sideParts();
  const regions: FigureRegion[] = [];
  const add = (name: string, group: string, ...polygons: Polygon[]) => regions.push({ name, group, polygons });
  /** A part on both sides, named per side ("Left knee", "Back of left knee"…). */
  const pair = (label: (sideName: string) => string, group: (sideName: string) => string, polygon: Polygon) => {
    add(label(drawnLeft), group(drawnLeft), polygon);
    add(label(drawnRight), group(drawnRight), mirrorX(polygon, AXIS));
  };
  const lower = (sideName: string) => sideName.toLowerCase();
  const arm = (sideName: string) => `${sideName} arm`;
  const leg = (sideName: string) => `${sideName} leg`;
  const headGroup = () => 'Head and neck';
  const torsoGroup = () => 'Torso';

  // Drawing order: what lies behind first.
  pair((s) => `${s} ear`, headGroup, parts.ear);
  pair((s) => (front ? `${s} thigh` : `Back of ${lower(s)} thigh`), leg, parts.thigh);
  pair((s) => (front ? `${s} lower leg` : `${s} calf`), leg, parts.lowerLeg);
  pair((s) => (front ? `${s} foot` : `${s} heel`), leg, front ? parts.foot : parts.heel);
  pair((s) => (front ? `${s} knee` : `Back of ${lower(s)} knee`), leg, parts.knee);
  pair((s) => `${s} ankle`, leg, parts.ankle);
  pair((s) => (front ? `${s} upper arm` : `Back of ${lower(s)} upper arm`), arm, parts.upperArm);
  pair((s) => (front ? `${s} forearm` : `Back of ${lower(s)} forearm`), arm, parts.forearm);
  pair((s) => (front ? `${s} hand` : `Back of ${lower(s)} hand`), arm, parts.hand);
  pair((s) => `${s} elbow`, arm, parts.elbow);
  pair((s) => `${s} wrist`, arm, parts.wrist);
  add(front ? 'Neck' : 'Back of neck', 'Head and neck', NECK);

  if (front) {
    add('Abdomen', 'Torso', torsoBand(142, 190));
    add('Chest', 'Torso', torsoBand(88, 142, torsoTop(7)));
    // The hip is the side of the pelvis, above the crease at the top of the thigh; the groin is
    // the triangle between the creases.
    const groinSide = curve([86, 190], [88.5, 210], [94.5, 222], 8);
    const crease = curve([94.5, 222], [84, 222], [AXIS - torsoHalfWidth(214), 214], 8);
    const hip: Point[] = [...torsoEdge(190, 214).reverse(), ...groinSide.slice(0, -1), ...crease.slice(0, -1)];
    pair((s) => `${s} hip`, torsoGroup, hip.reverse());
    const groinLeft = [...groinSide, ...curve([94.5, 222], [97, 230], [AXIS, 230.5], 6).slice(1)];
    add('Groin', 'Torso', [...groinLeft, ...[...groinLeft].reverse().map(across).slice(1)]);
  } else {
    add('Lower back', 'Torso', torsoBand(148, 196));
    add('Upper back', 'Torso', torsoBand(88, 148, torsoTop(3)));
    // A buttock: from the waistband to the fold at the top of the thigh, the cleft at the middle.
    const fold = curve([AXIS - torsoHalfWidth(222), 222], [AXIS - 24, 248], [AXIS, 234], 12);
    const buttock: Point[] = [[AXIS, 194], ...torsoEdge(194, 222), ...fold.slice(1)];
    pair((s) => `${s} buttock`, torsoGroup, buttock);
  }
  pair((s) => `${s} shoulder`, torsoGroup, parts.shoulder);

  if (front) {
    const [scalp, face] = splitByCurve(HEAD_OUTLINE, hairline);
    add('Face', 'Head and neck', face);
    add('Head', 'Head and neck', scalp);
    pair((s) => `${s} eye`, headGroup, almond(92.6, 36.2, 4, 2.3));
  } else {
    add('Back of head', 'Head and neck', HEAD_OUTLINE);
  }

  // Lists read head to toe, the person's right before their left (as forms usually do).
  const order = (names: string[]) => names.filter((name) => regions.some((r) => r.name === name));
  const sides = ['Right', 'Left'];
  const each = (make: (s: string) => string) => sides.map(make);
  const groups = [
    {
      label: 'Head and neck',
      regions: order(
        front
          ? ['Head', 'Face', ...each((s) => `${s} eye`), ...each((s) => `${s} ear`), 'Neck']
          : ['Back of head', ...each((s) => `${s} ear`), 'Back of neck'],
      ),
    },
    {
      label: 'Torso',
      regions: order(
        front
          ? [...each((s) => `${s} shoulder`), 'Chest', 'Abdomen', ...each((s) => `${s} hip`), 'Groin']
          : [...each((s) => `${s} shoulder`), 'Upper back', 'Lower back', ...each((s) => `${s} buttock`)],
      ),
    },
    ...sides.map((s) => ({
      label: `${s} arm`,
      regions: order(
        front
          ? [`${s} upper arm`, `${s} elbow`, `${s} forearm`, `${s} wrist`, `${s} hand`]
          : [`Back of ${lower(s)} upper arm`, `${s} elbow`, `Back of ${lower(s)} forearm`, `${s} wrist`, `Back of ${lower(s)} hand`],
      ),
    })),
    ...sides.map((s) => ({
      label: `${s} leg`,
      regions: order(
        front
          ? [`${s} thigh`, `${s} knee`, `${s} lower leg`, `${s} ankle`, `${s} foot`]
          : [`Back of ${lower(s)} thigh`, `Back of ${lower(s)} knee`, `${s} calf`, `${s} ankle`, `${s} heel`],
      ),
    })),
  ];

  return {
    name: side,
    label: front ? 'Front' : 'Back',
    width: BODY_WIDTH,
    height: BODY_HEIGHT,
    regions,
    groups,
    personLeftOn: front ? 'right' : 'left',
  };
}

/** The body figure's two views. */
export const BODY_VIEWS: readonly FigureView[] = [buildView('front'), buildView('back')];

/**
 * Every region name of a view, in reading order.
 * @param view - A figure view
 * @returns Names, head to toe
 */
export const regionNames = (view: FigureView): string[] => view.groups.flatMap((group) => group.regions);

/**
 * The region under a point of a view.
 * @param view - A figure view
 * @param x - Fraction of the view's width (0 to 1)
 * @param y - Fraction of the view's height (0 to 1)
 * @returns The region's name, or undefined off the figure
 */
export function regionAt(view: FigureView, x: number, y: number): string | undefined {
  return shapeAt(view.regions, [x * view.width, y * view.height]);
}

const centres = new Map<string, { x: number; y: number } | undefined>();

/**
 * Where a pin for a region goes when it is placed without a pointer: a point well inside the part
 * of the region that shows. The built-in views' points are listed in body-regions.ts (which demo
 * seeds import too), so both place a pin for "Left knee" on the same spot.
 * @param view - A figure view
 * @param region - Region name
 * @returns Fractions of the view's width and height, or undefined for an unknown region
 */
export function regionCentre(view: FigureView, region: string): { x: number; y: number } | undefined {
  const listed = (BODY_REGIONS as Record<string, BodyRegionCentre[] | undefined>)[view.name]?.find((r) => r.name === region);
  if (listed && view.regions.some((r) => r.name === region)) return { x: listed.x, y: listed.y };
  const key = `${view.name}|${region}`;
  if (!centres.has(key)) {
    const point = visibleCentre(view.regions, region);
    centres.set(key, point && { x: point[0] / view.width, y: point[1] / view.height });
  }
  return centres.get(key);
}

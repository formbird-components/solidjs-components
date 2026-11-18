import { For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import {
  assetKind,
  issueTypeKind,
  priorityLevel,
  workKind,
  type AssetKind,
  type IconSet,
  type IssueTypeKind,
  type PriorityLevel,
  type WorkKind,
} from '../domain/lookups';

/** Line icons on a 16×16 grid, stroked with currentColor. */
const LINE_ICONS = {
  'chevron-down': ['M4 6l4 4 4-4'],
  'chevron-up': ['M4 10l4-4 4 4'],
  'chevron-left': ['M10 4L6 8l4 4'],
  check: ['M3.5 8.5l3 3 6-7'],
  x: ['M4.5 4.5l7 7', 'M11.5 4.5l-7 7'],
  plus: ['M8 3.5v9', 'M3.5 8h9'],
  search: ['M12 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0z', 'M10.6 10.6l3.4 3.4'],
  copy: [
    'M6 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z',
    'M10.5 3.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h.5',
  ],
  link: [
    'M6.5 9.5l3-3',
    'M7.4 4.6l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7l-1.2 1.2',
    'M8.6 11.4l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7l1.2-1.2',
  ],
  user: ['M10.75 5a2.75 2.75 0 1 1-5.5 0 2.75 2.75 0 0 1 5.5 0z', 'M2.75 14c.6-2.4 2.7-4 5.25-4s4.65 1.6 5.25 4'],
  alert: ['M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z', 'M8 4.75v3.75', 'M8 11.1v.15'],
  pencil: ['M10.2 2.8a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L6 13H3v-3z', 'M9 4l3 3'],
  'arrow-left': ['M13 8H3.5', 'M7.5 4L3.5 8l4 4'],
  'arrow-up': ['M8 13V3.5', 'M4.5 7L8 3.5 11.5 7'],
  'arrow-down': ['M8 3v9.5', 'M4.5 9L8 12.5 11.5 9'],
  'chevron-right': ['M6 4l4 4-4 4'],
  refresh: ['M11.5 4.5A5 5 0 1 0 12.9 9.6', 'M11.8 2.2v2.6H9.2'],
  download: ['M8 2.5v8', 'M4.5 7.5L8 11l3.5-3.5', 'M3 13.5h10'],
  reply: ['M6.5 4L3 7.5 6.5 11', 'M3 7.5h6a4 4 0 0 1 4 4v1'],
  'thumbs-up': [
    'M2.5 7H5v6.5H2.5z',
    'M5 7l2.6-4.2a1.3 1.3 0 0 1 2.4.7V6.5h2.7a1.3 1.3 0 0 1 1.3 1.5l-.8 4.3a1.5 1.5 0 0 1-1.5 1.2H5',
  ],
  'thumbs-down': [
    'M2.5 9H5V2.5H2.5z',
    'M5 9l2.6 4.2a1.3 1.3 0 0 0 2.4-.7V9.5h2.7a1.3 1.3 0 0 0 1.3-1.5l-.8-4.3a1.5 1.5 0 0 0-1.5-1.2H5',
  ],
  message: ['M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v6a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5v-2.5A1.5 1.5 0 0 1 2.5 10z'],
  calendar: ['M2.8 4.2h10.4v9H2.8z', 'M2.8 7h10.4', 'M5.4 2.6v2.6', 'M10.6 2.6v2.6'],
  clock: ['M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z', 'M8 4.8V8l2.2 1.4'],
  'map-pin': ['M8 14s4.6-4.1 4.6-7.6a4.6 4.6 0 1 0-9.2 0C3.4 9.9 8 14 8 14z', 'M9.6 6.4a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0z'],
  layers: ['M8 2.4l6 3.1-6 3.1-6-3.1z', 'M2.2 8.3L8 11.3l5.8-3', 'M2.2 11L8 14l5.8-3'],
  gauge: ['M2.7 11.6a5.6 5.6 0 1 1 10.6 0', 'M8 9.6l2.6-3.1'],
  wrench: ['M10.7 2.8a3 3 0 0 0-3.6 3.9L2.8 11a1.2 1.2 0 0 0 1.7 1.7l4.3-4.3a3 3 0 0 0 3.9-3.6l-1.7 1.7-1.7-.3-.3-1.7z'],
  fuel: ['M3.4 13.6V3.4h6v10.2', 'M2.4 13.6h8', 'M5 6h3', 'M9.4 6.4l2 1.6v4a1 1 0 0 0 2 0V6.6l-1.6-1.6'],
  crosshair: ['M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0z', 'M8 1.6v3', 'M8 11.4v3', 'M1.6 8h3', 'M11.4 8h3'],
  polygon: ['M3.4 5.2l5-2.4 4.3 5.4-3.1 4.8H4.4z'],
  trash: ['M2.8 4.4h10.4', 'M6.4 4.4V2.8h3.2v1.6', 'M4.3 4.4l.6 8.8h6.2l.6-8.8'],
  info: ['M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z', 'M8 7.3v3.9', 'M8 4.8v.15'],
  list: ['M5.5 4h8', 'M5.5 8h8', 'M5.5 12h8', 'M2.5 4h.01', 'M2.5 8h.01', 'M2.5 12h.01'],
} as const;

export type IconName = keyof typeof LINE_ICONS;

/**
 * A line icon.
 * @param props - name, size (px, default 16) and an optional accessible title
 */
export function Icon(props: { name: IconName; size?: number; title?: string; class?: JSX.ClassValue; strokeWidth?: number }) {
  return (
    <svg
      class={['sj-icon', props.class]}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width={props.strokeWidth ?? 1.6}
      stroke-linecap="round"
      stroke-linejoin="round"
      role={props.title ? 'img' : undefined}
      aria-hidden={props.title ? undefined : 'true'}
    >
      <Show when={props.title}>
        <title>{props.title}</title>
      </Show>
      <For each={LINE_ICONS[props.name] as readonly string[]}>{(d) => <path d={d} />}</For>
    </svg>
  );
}

/** A white glyph on a coloured rounded tile, 16×16. */
export interface Glyph {
  color: string;
  /** Paths stroked in white on the tile. */
  stroke?: string[];
  /** Paths filled in white on the tile. */
  fill?: string[];
}

const TYPE_GLYPHS: Record<IssueTypeKind, Glyph> = {
  bug: { color: '#e5484d', fill: ['M11.2 8a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0z'] },
  story: { color: '#30a46c', fill: ['M5.5 4h5v8.4L8 10.6l-2.5 1.8z'] },
  task: { color: '#3e8ff7', stroke: ['M4.9 8.3l2.1 2.1 4.1-4.6'] },
  epic: { color: '#8e4ec6', fill: ['M9.2 3.2L5.2 8.9h2.7l-1 3.9 4-5.7H8.2z'] },
  subtask: { color: '#2a9fd6', stroke: ['M4.5 4.5h4.5v4.5H4.5z', 'M7 11.5h4.5V7'] },
  feature: { color: '#12a594', stroke: ['M8 4.8v6.4', 'M4.8 8h6.4'] },
  improvement: { color: '#46a758', stroke: ['M8 11.5V4.8', 'M5 7.6L8 4.6l3 3'] },
  support: { color: '#f76b15', stroke: ['M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4', 'M8 11.3v.1'] },
  change: { color: '#d6409f', stroke: ['M4.5 6.2h7l-1.8-1.8', 'M11.5 9.8h-7l1.8 1.8'] },
  generic: { color: '#8b8d98', stroke: ['M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z'] },
};

// Wheels are round-capped dots: a zero-length stroke draws a circle as wide as the line.
const WHEELS = (y: number, ...xs: number[]) => xs.map((x) => `M${x} ${y}v.01`);

const ASSET_GLYPHS: Record<AssetKind, Glyph> = {
  car: { color: '#3e8ff7', stroke: ['M3.4 10.4h9.2', 'M4 10.4V8.6l1.3-2.5h5.4L12 8.6v1.8', ...WHEELS(11.7, 5.6, 10.4)] },
  van: { color: '#12a594', stroke: ['M3.3 10.6V5h6.4l3 2.9v2.7z', 'M9.6 5v2.9h3.1', ...WHEELS(11.9, 5.4, 10.6)] },
  ute: { color: '#f76b15', stroke: ['M3.2 10.5V8.1h5V5.4h2.6l2 2.7v2.4z', ...WHEELS(11.8, 5.3, 10.7)] },
  truck: { color: '#8e4ec6', stroke: ['M2.9 10.6V4.6h7v6', 'M9.9 6.9h2.1l1.3 1.9v1.8H9.9', ...WHEELS(12, 5, 11.2)] },
  bus: { color: '#d6409f', stroke: ['M3.6 11.1V4.3h8.8v6.8z', 'M3.6 7.8h8.8', ...WHEELS(12.5, 5.6, 10.4)] },
  trailer: { color: '#6e56cf', stroke: ['M3 9.7h8V5.8H3z', 'M11 9.7h2.2', ...WHEELS(11.5, 6.8)] },
  forklift: { color: '#e5a000', stroke: ['M3.8 10.8V6.4h3.6l1.1 2.6v1.8', 'M10.9 3.8v7.4', 'M10.9 11.2h2.3', ...WHEELS(11.9, 5, 8)] },
  excavator: { color: '#ca7a00', stroke: ['M3.2 11.6h6.4', 'M3.8 10.2V8.2h4.4v2', 'M8.2 8.2l2.6-3.6 1.8 3.4-1 .8'] },
  generator: { color: '#46a758', stroke: ['M3.6 5.2h8.8v6.4H3.6z', 'M8.6 6.4L7 8.6h2l-1.6 2.2'] },
  lift: { color: '#0090ff', stroke: ['M3.6 5.2h8.8', 'M4.6 6.4l6.8 4.4', 'M11.4 6.4l-6.8 4.4', 'M3.6 12h8.8'] },
  equipment: { color: '#8b8d98', stroke: ['M5 5h6v6H5z', 'M7 8h2'] },
};

const WORK_GLYPHS: Record<WorkKind, Glyph> = {
  service: { color: '#3e8ff7', stroke: ['M4.3 5.4h7.4v6.3H4.3z', 'M4.3 7.6h7.4', 'M6.3 4.2v2.1', 'M9.7 4.2v2.1'] },
  repair: {
    color: '#e5484d',
    stroke: ['M10.7 4.3a2.4 2.4 0 0 0-2.9 3.1l-3.5 3.5a.9.9 0 0 0 1.3 1.3l3.5-3.5a2.4 2.4 0 0 0 3.1-2.9l-1.4 1.4-1.4-.2-.2-1.4z'],
  },
  inspection: { color: '#12a594', stroke: ['M5 4.4h6v7.6H5z', 'M6.5 8.3l1.2 1.2 2-2.4'] },
  tyres: { color: '#6e56cf', stroke: ['M11.2 8a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0z', 'M9.1 8a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0z'] },
  recall: { color: '#f76b15', stroke: ['M5.2 12V4.4', 'M5.2 4.9h6l-1.6 2.1 1.6 2.1h-6'] },
  damage: { color: '#e5484d', stroke: ['M8 4.2l4.2 7.4H3.8z', 'M8 7.3v1.9', 'M8 10.6v.05'] },
  compliance: { color: '#8b8d98', stroke: ['M5.3 4h3.6l2 2v6H5.3z', 'M6.9 8.4h2.4', 'M6.9 10h2.4'] },
  generic: { color: '#8b8d98', stroke: ['M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z'] },
};

/**
 * The tile for a value of an icon set, from its name (or an explicit kind).
 * @param set - Icon family; "priority" and "none" have no tiles
 * @param name - Value name, e.g. "Bug", "Panel van", "Scheduled service"
 * @param kind - Explicit kind, overriding the guess from the name
 * @returns The glyph, or undefined for sets without tiles
 */
export function glyphFor(set: IconSet, name: string, kind?: string): Glyph | undefined {
  if (set === 'type') return TYPE_GLYPHS[(kind as IssueTypeKind) ?? issueTypeKind(name)] ?? TYPE_GLYPHS.generic;
  if (set === 'asset') return ASSET_GLYPHS[(kind as AssetKind) ?? assetKind(name)] ?? ASSET_GLYPHS.equipment;
  if (set === 'work') return WORK_GLYPHS[(kind as WorkKind) ?? workKind(name)] ?? WORK_GLYPHS.generic;
  return undefined;
}

/**
 * A glyph tile as standalone SVG markup, for places that need an image rather than an element
 * (map markers, canvas). Paths are the same as {@link GlyphTile}'s.
 * @param glyph - The glyph
 * @param options - Tile colour override, pixel size, and an outline ring colour
 * @returns SVG markup
 */
export function glyphSvg(glyph: Glyph, options: { color?: string; size?: number; ring?: string } = {}): string {
  const size = options.size ?? 16;
  const ring = options.ring ? `<rect x=".5" y=".5" width="15" height="15" rx="3.5" fill="none" stroke="${options.ring}" stroke-width="1"/>` : '';
  const fill = (glyph.fill ?? []).map((d) => `<path d="${d}" fill="#fff"/>`).join('');
  const stroke = (glyph.stroke ?? [])
    .map((d) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16"><rect width="16" height="16" rx="3.5" fill="${
    options.color ?? glyph.color
  }"/>${ring}${fill}${stroke}</svg>`;
}

/**
 * A coloured rounded tile with a white glyph.
 * @param props - glyph, optional colour override, size, title and class
 */
export function GlyphTile(props: { glyph: Glyph; color?: string; size?: number; title?: string; class?: string }) {
  return (
    <svg class={props.class ?? 'sj-type-icon'} width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 16 16" aria-hidden="true">
      <Show when={props.title}>
        <title>{props.title}</title>
      </Show>
      <rect width="16" height="16" rx="3.5" fill={props.color ?? props.glyph.color} />
      <For each={props.glyph.fill ?? []}>{(d) => <path d={d} fill="#fff" />}</For>
      <For each={props.glyph.stroke ?? []}>
        {(d) => <path d={d} fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />}
      </For>
    </svg>
  );
}

/**
 * Issue type tile (coloured rounded square with a white glyph).
 * @param props - kind, optional colour override and size
 */
export function IssueTypeIcon(props: { kind: IssueTypeKind; color?: string; size?: number; title?: string }) {
  return <GlyphTile glyph={TYPE_GLYPHS[props.kind] ?? TYPE_GLYPHS.generic} color={props.color} size={props.size} title={props.title} />;
}

/**
 * Asset type tile: car, van, ute, truck, trailer, forklift...
 * @param props - kind, optional colour override, size and title
 */
export function AssetIcon(props: { kind: AssetKind; color?: string; size?: number; title?: string }) {
  return (
    <GlyphTile
      glyph={ASSET_GLYPHS[props.kind] ?? ASSET_GLYPHS.equipment}
      color={props.color}
      size={props.size}
      title={props.title}
      class="sj-type-icon sj-asset-icon"
    />
  );
}

/**
 * Maintenance work tile: service, repair, inspection, damage...
 * @param props - kind, optional colour override, size and title
 */
export function WorkIcon(props: { kind: WorkKind; color?: string; size?: number; title?: string }) {
  return (
    <GlyphTile glyph={WORK_GLYPHS[props.kind] ?? WORK_GLYPHS.generic} color={props.color} size={props.size} title={props.title} class="sj-type-icon sj-work-icon" />
  );
}

const PRIORITY_GLYPHS: Record<PriorityLevel, { color: string; paths: string[] }> = {
  highest: { color: '#e5484d', paths: ['M4 8.8l4-3.6 4 3.6', 'M4 12.3l4-3.6 4 3.6'] },
  high: { color: '#f76b15', paths: ['M4 10.2l4-4 4 4'] },
  medium: { color: '#e5a000', paths: ['M3.8 6.5h8.4', 'M3.8 9.5h8.4'] },
  low: { color: '#3e8ff7', paths: ['M4 5.8l4 4 4-4'] },
  lowest: { color: '#3e8ff7', paths: ['M4 3.7l4 3.6 4-3.6', 'M4 7.2l4 3.6 4-3.6'] },
  none: { color: '#8b8d98', paths: ['M5 8h6'] },
};

/**
 * Priority / severity arrows.
 * @param props - level, optional colour override and size
 */
export function PriorityIcon(props: { level: PriorityLevel; color?: string; size?: number }) {
  const glyph = () => PRIORITY_GLYPHS[props.level] ?? PRIORITY_GLYPHS.none;
  return (
    <svg
      class="sj-priority-icon"
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      stroke={props.color ?? glyph().color}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <For each={glyph().paths}>{(d) => <path d={d} />}</For>
    </svg>
  );
}

/** Per-value icon override from a component definition: `{ "Bug": { "icon": "bug", "color": "#e5484d" } }`. */
export interface IconOverride {
  icon?: string;
  color?: string;
}

/**
 * The icon for a lookup value: a tile (issue type, asset type, maintenance work), priority arrows,
 * a colour dot, or nothing.
 * @param props - icon set, value name, optional override (`icon` names the kind) and colour
 */
export function LookupIcon(props: { set: IconSet; name: string; override?: IconOverride; color?: string; title?: string }): JSX.Element {
  const color = () => props.override?.color ?? props.color;
  const glyph = () => glyphFor(props.set, props.name, props.override?.icon);
  return (
    <Show
      when={props.set !== 'none'}
      fallback={
        <Show when={color()}>
          <span class="sj-lookup-dot" style={{ background: color() }} aria-hidden="true" />
        </Show>
      }
    >
      <Show
        when={glyph()}
        fallback={<PriorityIcon level={(props.override?.icon as PriorityLevel) ?? priorityLevel(props.name)} color={color()} />}
      >
        {(tile) => <GlyphTile glyph={tile()} color={color()} title={props.title} />}
      </Show>
    </Show>
  );
}

/** Small loading spinner. */
export function Spinner(props: { label?: string }) {
  return <span class="sj-spinner" role={props.label ? 'status' : undefined} aria-label={props.label} />;
}

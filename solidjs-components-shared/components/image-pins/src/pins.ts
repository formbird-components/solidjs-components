// Pins as the field stores them, and the small rules around them: reading a stored value,
// tidying a pin before it is written, kind colours, and placing a pin without a pointer.

/** A pin as stored: x and y are fractions (0 to 1) of its view's width and height. */
export interface Pin {
  id: string;
  x: number;
  y: number;
  view: string;
  region?: string;
  kind?: string;
  note?: string;
}

/** A pin category; the pin takes its colour. */
export interface PinKind {
  name: string;
  color?: string;
}

/** Default kinds for the body figure. */
export const INJURY_KINDS: readonly PinKind[] = [
  { name: 'Cut', color: '#e5484d' },
  { name: 'Bruise', color: '#8e4ec6' },
  { name: 'Burn', color: '#f76b15' },
  { name: 'Fracture', color: '#3e63dd' },
  { name: 'Sprain or strain', color: '#12a594' },
  { name: 'Pain', color: '#e5a000' },
  { name: 'Other', color: '#6b7280' },
];

/** Colour of a pin with no kind (or a kind the definition no longer lists). */
export const NEUTRAL_PIN = '#5e6475';

/**
 * A fraction kept within 0 to 1, to four places (a tenth of a pixel on a 1000 px image).
 * @param n - Any number
 * @returns The fraction
 */
export const fraction = (n: number): number => Math.round(Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0)) * 10_000) / 10_000;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const number = (value: unknown) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN);

/**
 * Reads a stored value. Entries without a position are left out; an entry without an id gets one
 * from its place in the list, and one without a view goes on the first view.
 * @param raw - The field's value
 * @param defaultView - Name of the first view
 * @returns The pins
 */
export function parsePins(raw: unknown, defaultView: string): Pin[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const pins: Pin[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const e = entry as Record<string, unknown>;
    const x = number(e.x);
    const y = number(e.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    let id = text(e.id) ?? `pin-${index + 1}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    pins.push(tidyPin({ id, x: fraction(x), y: fraction(y), view: text(e.view) ?? defaultView, region: text(e.region), kind: text(e.kind), note: text(e.note) }));
  });
  return pins;
}

/**
 * A pin as it is written: fractions in range, and no empty optional fields.
 * @param pin - A pin
 * @returns A clean copy
 */
export function tidyPin(pin: Pin): Pin {
  const clean: Pin = { id: pin.id, x: fraction(pin.x), y: fraction(pin.y), view: pin.view };
  if (pin.region?.trim()) clean.region = pin.region.trim();
  if (pin.kind?.trim()) clean.kind = pin.kind.trim();
  if (pin.note?.trim()) clean.note = pin.note;
  return clean;
}

/**
 * The kinds a definition lists: `[{ name, color }]` or plain names.
 * @param raw - The definition's `kinds`
 * @param fallback - Kinds when the definition lists none
 * @returns The kinds
 */
export function toKinds(raw: unknown, fallback: readonly PinKind[]): PinKind[] {
  if (!Array.isArray(raw)) return [...fallback];
  return raw
    .map((kind) => (typeof kind === 'string' ? { name: kind } : kind && typeof kind === 'object' ? (kind as PinKind) : undefined))
    .filter((kind): kind is PinKind => !!kind && typeof kind.name === 'string' && !!kind.name.trim())
    .map((kind) => ({ name: kind.name.trim(), color: typeof kind.color === 'string' && kind.color.trim() ? kind.color.trim() : undefined }));
}

/** A stable hue (0–359) from a name (FNV-1a), so a kind keeps its colour everywhere. */
function hueOf(name: string): number {
  let hash = 2166136261;
  for (const char of name.toLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

/** A hue as a hex colour (saturation 58 %, lightness 46 %), for kinds without a colour. */
function hueToHex(hue: number): string {
  const s = 0.58;
  const l = 0.46;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[channel(0), channel(8), channel(4)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A kind's colour: the definition's, or one made from its name so it stays the same everywhere.
 * @param kinds - The definition's kinds
 * @param name - The pin's kind
 * @returns The colour, or the neutral pin colour for no kind or an unknown one
 */
export function kindColor(kinds: readonly PinKind[], name: string | undefined): string {
  if (!name) return NEUTRAL_PIN;
  const kind = kinds.find((k) => k.name.toLowerCase() === name.toLowerCase());
  if (!kind) return NEUTRAL_PIN;
  return kind.color ?? hueToHex(hueOf(kind.name));
}

/**
 * Text colour for a pin's number: white while it keeps 3:1 contrast (the number is bold), else
 * near-black, so amber or light kinds stay readable.
 * @param background - A #rgb or #rrggbb colour (anything else counts as dark)
 * @returns "#ffffff" or "#1b1b24"
 */
export function readableText(background: string): string {
  const hex = background.trim().replace(/^#/, '');
  const full = /^[0-9a-f]{3}$/i.test(hex) ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05) >= 3 ? '#ffffff' : '#1b1b24';
}

/**
 * Where a new pin goes near a point without covering another pin: the point itself if it is free,
 * else the nearest free spot on rings around it that `allowed` accepts (still on the same region).
 * @param centre - Preferred spot (fractions)
 * @param taken - Pins already on the view
 * @param allowed - Whether a spot is acceptable
 * @returns The spot
 */
export function freeSpot(centre: { x: number; y: number }, taken: readonly { x: number; y: number }[], allowed: (x: number, y: number) => boolean): { x: number; y: number } {
  const free = (x: number, y: number) => taken.every((p) => Math.hypot(p.x - x, (p.y - y) * 0.5) > 0.018);
  if (free(centre.x, centre.y)) return { x: fraction(centre.x), y: fraction(centre.y) };
  for (let ring = 1; ring <= 4; ring++) {
    for (let step = 0; step < 8; step++) {
      const angle = (Math.PI / 4) * step + (ring % 2 ? 0 : Math.PI / 8);
      const x = centre.x + Math.cos(angle) * 0.03 * ring;
      const y = centre.y + Math.sin(angle) * 0.015 * ring;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && allowed(x, y) && free(x, y)) return { x: fraction(x), y: fraction(y) };
    }
  }
  return { x: fraction(centre.x), y: fraction(centre.y) };
}

/**
 * What a pin is, in words, for its button and the list: "Pin 2: Left forearm, Cut (Front)".
 * @param pin - The pin
 * @param number - Its number (1-based)
 * @param viewLabel - Its view's label when there are several views
 * @returns The description
 */
export function describePin(pin: Pin, number: number, viewLabel?: string): string {
  const parts = [pin.region ?? 'no region', pin.kind].filter(Boolean).join(', ');
  return `Pin ${number}: ${parts}${viewLabel ? ` (${viewLabel})` : ''}`;
}

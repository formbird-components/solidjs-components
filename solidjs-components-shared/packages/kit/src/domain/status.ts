import type { SourceDocument } from '../host/types';
import { findByName, getPath } from '../host/util';

/** Jira-style status categories; they drive default colours and board columns. */
export type StatusCategory = 'todo' | 'inprogress' | 'done';

export const STATUS_CATEGORIES: readonly StatusCategory[] = ['todo', 'inprogress', 'done'];

/** Default colours per category, used when a status document has no valid colour. */
export const CATEGORY_COLORS: Record<StatusCategory, string> = {
  todo: '#7c7f8f',
  inprogress: '#3e63dd',
  done: '#2f9e5b',
};

const DONE_PATTERN =
  /\b(done|closed?|resolved|complete[d]?|released|shipped|deployed|fixed|cancel+ed|rejected|won'?t\s*(fix|do)|wontfix|duplicate|archived)\b/i;
const PROGRESS_PATTERN =
  /\b(in\s*progress|progress|doing|develop(ment|ing)?|dev|in\s*review|review(ing)?|test(ing)?|qa|verif(y|ying|ication)|assigned|active|started|implement(ing|ation)?|build(ing)?)\b/i;

const isCategory = (value: unknown): value is StatusCategory =>
  typeof value === 'string' && (STATUS_CATEGORIES as readonly string[]).includes(value);

/**
 * The category of a status: an explicit value on the status document wins, then the
 * definition's `categories` map, then a guess from the name (Jira and Mantis vocabularies).
 * @param name - Status name
 * @param overrides - `{ statusName: category }` from the component definition
 * @param explicit - Category stored on the status document, if any
 * @returns The category
 */
export function statusCategory(name: string, overrides?: Record<string, StatusCategory>, explicit?: unknown): StatusCategory {
  if (isCategory(explicit)) return explicit;
  const override = findByName(overrides, name);
  if (isCategory(override)) return override;
  if (DONE_PATTERN.test(name)) return 'done';
  if (PROGRESS_PATTERN.test(name)) return 'inprogress';
  return 'todo';
}

const NAMED_OR_FUNCTIONAL_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(.+\)|[a-z]+)$/i;

/**
 * Returns the value when it is a usable CSS colour, else undefined.
 * @param value - Candidate colour (e.g. a status document's `color`)
 * @returns The trimmed colour or undefined
 */
export function cssColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  if (!color) return undefined;
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', color) ? color : undefined;
  }
  return NAMED_OR_FUNCTIONAL_COLOR.test(color) ? color : undefined;
}

/** Where a status's colour and category come from; the same keys on every element that shows statuses. */
export interface StatusAppearanceOptions {
  /** Colour overrides by status name. */
  colors?: Record<string, string>;
  /** Category overrides by status name. */
  categories?: Record<string, StatusCategory>;
  /** Field on status documents holding a CSS colour. Default "color" (SDMS Status has one). */
  colorField?: string;
  /** Field on status documents holding "todo" | "inprogress" | "done". Default "statusCategory". */
  categoryField?: string;
}

/**
 * How a status looks. Colour: the definition's override, then the status document's own colour,
 * then its category's colour. Category: see {@link statusCategory}.
 * @param name - Status name
 * @param options - Overrides and field names from the component definition
 * @param source - The status document (or a stored value carrying the same fields), when known
 * @returns Category and a valid CSS colour
 */
export function statusAppearance(
  name: string,
  options: StatusAppearanceOptions = {},
  source?: SourceDocument,
): { category: StatusCategory; color: string } {
  const category = statusCategory(name, options.categories, source && getPath(source, options.categoryField ?? 'statusCategory'));
  const color =
    cssColor(findByName(options.colors, name)) ??
    cssColor(source && getPath(source, options.colorField ?? 'color')) ??
    CATEGORY_COLORS[category];
  return { category, color };
}

interface Named {
  documentId: string;
  name: string;
}

/**
 * The statuses an issue can move to from its current one.
 *
 * Sources, first match wins: the current status document's own list of next statuses, then the
 * definition's `transitions` map (`{ "<from>": [...], "*": [...] }`, matched by name). Without
 * either, every status is allowed, which is how SDMS behaves today.
 * @param current - Current status (may be undefined for a new issue)
 * @param all - Every selectable status
 * @param rules - The definition's transitions map
 * @param nextFromDocument - Next statuses stored on the current status document
 * @returns Allowed target statuses, excluding the current one
 */
export function allowedTransitions<T extends Named>(
  current: Partial<Named> | undefined,
  all: T[],
  rules?: Record<string, string[]>,
  nextFromDocument?: Partial<Named>[],
): T[] {
  const others = all.filter((s) => s.documentId !== current?.documentId);
  if (nextFromDocument?.length) {
    const ids = new Set(nextFromDocument.map((n) => n.documentId));
    const names = new Set(nextFromDocument.map((n) => n.name?.toLowerCase()));
    return others.filter((s) => ids.has(s.documentId) || names.has(s.name.toLowerCase()));
  }
  if (rules) {
    const targets = (current?.name && findByName(rules, current.name)) ?? rules['*'];
    if (targets) {
      const allowed = new Set(targets.map((t) => t.toLowerCase()));
      return others.filter((s) => allowed.has(s.name.toLowerCase()));
    }
  }
  return others;
}

/**
 * Whether moving into a status needs a resolution, per `resolution.requiredFor`
 * (status names and/or category names). Defaults to the "done" category.
 * @param target - Status being moved to
 * @param category - Its category
 * @param requiredFor - Names/categories from the definition
 * @returns True when a resolution must be chosen
 */
export function needsResolution(target: { name: string }, category: StatusCategory, requiredFor?: string[]): boolean {
  const list = (requiredFor?.length ? requiredFor : ['done']).map((v) => v.toLowerCase());
  return list.includes(target.name.toLowerCase()) || list.includes(category);
}

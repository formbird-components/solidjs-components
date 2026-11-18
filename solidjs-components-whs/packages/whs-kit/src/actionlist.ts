// What <solid-corrective-actions> needs beyond logic/actions.ts: reading action records from a
// search, the rating of the record they belong to, due dates in a date input, and the values of a
// new action. Element-only: the rulesets embed logic/actions.ts, not this file.

import { controlRank } from './logic/actions';
import { RATINGS, riskResponse, type Rating } from './logic/risk';

/** A related-document value (`{ documentId, name, … }`). */
export interface RelatedValue {
  documentId: string;
  name: string;
  [field: string]: unknown;
}

/** One corrective action, as the list shows it. */
export interface ActionItem {
  documentId: string;
  /** "ACT-31"; empty until the server has numbered it. */
  ref: string;
  title: string;
  status: { name: string; color: string } | null;
  level: { name: string; rank: number } | null;
  owner: { documentId: string; name: string; email: string } | null;
  dueDate: string;
  completedDate: string;
}

/** A record actions are raised against, as `sourceRel` stores it. */
export interface ActionSource {
  documentId: string;
  name: string;
  ref?: string;
  kind: string;
  riskRating?: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
const firstOf = (value: unknown): Record<string, unknown> | undefined => {
  const first = Array.isArray(value) ? value[0] : value;
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : undefined;
};

/**
 * Reads an action record (a search hit) for the list.
 * @param doc - The record
 * @returns The action
 */
export function toActionItem(doc: Record<string, unknown>): ActionItem {
  const status = firstOf(doc.actionStatusRel);
  const level = firstOf(doc.controlLevelRel);
  const owner = firstOf(doc.ownerRel);
  const header = (doc.systemHeader ?? {}) as Record<string, unknown>;
  const ref = text(doc.actionRef);
  const summary = text(header.summaryName);
  const title = text(doc.title) || (ref && summary.startsWith(`${ref}: `) ? summary.slice(ref.length + 2) : summary);
  const levelName = text(level?.name);
  const rank = Number(level?.rank);
  return {
    documentId: text(doc.documentId),
    ref,
    title,
    status: status && text(status.name) ? { name: text(status.name), color: text(status.color) } : null,
    level: levelName ? { name: levelName, rank: Number.isInteger(rank) && rank > 0 ? rank : controlRank(levelName) } : null,
    owner: owner && text(owner.name) ? { documentId: text(owner.documentId), name: text(owner.name), email: text(owner.email) } : null,
    dueDate: text(doc.dueDate),
    completedDate: text(doc.completedDate),
  };
}

/**
 * Orders actions for the list: outstanding ones first, then done (Completed or Verified), then
 * cancelled; each group by due date, earliest first, those without one last, then by reference.
 * @param items - Actions
 * @returns A sorted copy
 */
export function sortActions(items: readonly ActionItem[]): ActionItem[] {
  const group = (item: ActionItem) => {
    const status = item.status?.name ?? '';
    return status === 'Cancelled' ? 2 : status === 'Completed' || status === 'Verified' ? 1 : 0;
  };
  const due = (item: ActionItem) => {
    const time = Date.parse(item.dueDate);
    return Number.isNaN(time) ? Infinity : time;
  };
  return [...items].sort(
    (a, b) => group(a) - group(b) || due(a) - due(b) || a.ref.localeCompare(b.ref, undefined, { numeric: true }) || a.title.localeCompare(b.title),
  );
}

/**
 * The rating a field holds, whatever its shape: a rating name ("High"), a risk value
 * (`{ rating: 'High', … }`) or a related value (`[{ name: 'High' }]`).
 * @param value - The field's value
 * @returns The rating, or '' when there is none
 */
export function ratingOf(value: unknown): Rating | '' {
  const match = (name: unknown): Rating | '' => RATINGS.find((r) => r.toLowerCase() === text(name).trim().toLowerCase()) ?? '';
  if (typeof value === 'string') return match(value);
  const first = firstOf(value);
  if (!first) return '';
  return match(first.rating) || match(first.name);
}

/**
 * The first rating found in several fields (an incident's `riskRating`, or a hazard's
 * `residualRating` and then its `inherentRating`).
 * @param values - The fields' values, in order
 * @returns The rating, or ''
 */
export function firstRating(values: readonly unknown[]): Rating | '' {
  for (const value of values) {
    const rating = ratingOf(value);
    if (rating) return rating;
  }
  return '';
}

/**
 * How long a rating gives to act: "High risk: due within 7 days".
 * @param rating - The record's rating
 * @returns The hint, or '' for no rating
 */
export function dueHint(rating: unknown): string {
  const response = riskResponse(rating);
  if (!response) return '';
  return `${rating} risk: due within ${response.actionDays === 1 ? '1 day' : `${response.actionDays} days`}`;
}

/** Eastern Australia, as actionDueDate counts days (UTC+10). */
const EASTERN_OFFSET = 10 * 3_600_000;

/**
 * The day a due date falls on in eastern Australia (UTC+10, as actionDueDate counts), for a date input.
 * @param iso - The due date
 * @returns "YYYY-MM-DD", or '' when it isn't a date
 */
export function dueDateInput(iso: unknown): string {
  const time = Date.parse(text(iso));
  if (Number.isNaN(time)) return '';
  return new Date(time + EASTERN_OFFSET).toISOString().slice(0, 10);
}

/**
 * A due date picked in a date input: 5 pm in eastern Australia that day (07:00 UTC), as actionDueDate
 * sets them.
 * @param day - "YYYY-MM-DD"
 * @returns ISO date, or '' when the day isn't a date
 */
export function dueDateFromInput(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const time = Date.parse(`${day}T07:00:00.000Z`);
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

/**
 * Whether a record has been saved: fieldtec-web sets `systemHeader.serverCreatedDate` (and the
 * client `createdDate`) on the first save.
 * @param doc - The record
 * @returns True once saved
 */
export function isSavedRecord(doc: unknown): boolean {
  const header = (doc as { systemHeader?: Record<string, unknown> } | null | undefined)?.systemHeader;
  return !!(header && (header.serverCreatedDate || header.createdDate));
}

/** What a new action is made of. */
export interface NewAction {
  title: string;
  level?: RelatedValue | null;
  owner?: RelatedValue | null;
  /** ISO, or '' */
  dueDate?: string;
  /** ISO */
  raisedDate: string;
  /** The Open status value. */
  status?: RelatedValue | null;
  source: ActionSource;
}

/**
 * The values of a new corrective action record, in the safety app's data model. Empty fields are
 * left out rather than stored empty.
 * @param action - Title, control level, owner, due date, when raised, status and the source record
 * @returns Values for createDocument
 */
export function newActionValues(action: NewAction): Record<string, unknown> {
  const source: Record<string, unknown> = { documentId: action.source.documentId, name: action.source.name, kind: action.source.kind };
  if (action.source.ref) source.ref = action.source.ref;
  if (action.source.riskRating) source.riskRating = action.source.riskRating;
  return {
    appTags: ['whs', 'action'],
    title: action.title.trim(),
    ...(action.level ? { controlLevelRel: [action.level] } : {}),
    ...(action.owner ? { ownerRel: [action.owner] } : {}),
    ...(action.dueDate ? { dueDate: action.dueDate } : {}),
    raisedDate: action.raisedDate,
    ...(action.status ? { actionStatusRel: [action.status] } : {}),
    sourceRel: [source],
  };
}

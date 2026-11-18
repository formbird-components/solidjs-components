// What <solid-risk-matrix> needs beyond the rating itself: reading and writing a risk field, the
// response line under the matrix, keyboard movement on the grid, and counting records per cell for
// the heatmap. Element-only: the rulesets embed logic/risk.ts, not this file.

import { riskRating, riskResponse, RATINGS, type Rating } from './logic/risk';

/** A complete risk value, as a risk field stores it. */
export interface RiskCell {
  likelihood: number;
  consequence: number;
  score: number;
  rating: Rating;
}

/** A position on the matrix. */
export interface CellPosition {
  likelihood: number;
  consequence: number;
}

/**
 * The value to store for a likelihood and a consequence.
 * @param likelihood - 1 (Rare) to 5 (Almost certain)
 * @param consequence - 1 (Insignificant) to 5 (Catastrophic)
 * @returns `{ likelihood, consequence, score, rating }`, or null when either is missing or out of range
 */
export function riskValue(likelihood: unknown, consequence: unknown): RiskCell | null {
  const rated = riskRating(likelihood, consequence);
  return rated ? { likelihood: Number(likelihood), consequence: Number(consequence), score: rated.score, rating: rated.rating } : null;
}

/**
 * Reads a stored risk value. The score and rating are worked out again from the likelihood and
 * consequence, so a stale or hand-edited rating never shows.
 * @param raw - The field's value
 * @returns The value, or null when it isn't a complete risk
 */
export function parseRisk(raw: unknown): RiskCell | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as { likelihood?: unknown; consequence?: unknown };
  return riskValue(value.likelihood, value.consequence);
}

/**
 * What a rating asks for, in one line: "Actions due within 7 days · Investigation: full · Notify:
 * Supervisor, WHS Advisor, Site Manager".
 * @param rating - Low, Medium, High or Extreme
 * @returns The line, or '' for an unknown rating
 */
export function responseSummary(rating: unknown): string {
  const response = riskResponse(rating);
  if (!response) return '';
  const investigation = { none: 'none', supervisor: "supervisor's review", full: 'full' }[response.investigation];
  return [
    `Actions due within ${response.actionDays === 1 ? '1 day' : `${response.actionDays} days`}`,
    `Investigation: ${investigation}`,
    `Notify: ${response.notify.join(', ')}`,
  ].join(' · ');
}

/**
 * Where a key moves focus on the matrix. Rows are likelihoods with Almost certain (5) at the top;
 * columns are consequences with Insignificant (1) on the left.
 * @param from - The focused cell
 * @param key - KeyboardEvent.key: arrows, Home, End, PageUp, PageDown
 * @param ctrl - Ctrl or Cmd held (Home and End then go to the first and last cell of the grid)
 * @returns The cell to focus (possibly the same one, at an edge), or null for a key that doesn't move
 */
export function moveCell(from: CellPosition, key: string, ctrl = false): CellPosition | null {
  const clamp = (n: number) => Math.min(5, Math.max(1, n));
  const { likelihood, consequence } = from;
  switch (key) {
    case 'ArrowUp':
      return { likelihood: clamp(likelihood + 1), consequence };
    case 'ArrowDown':
      return { likelihood: clamp(likelihood - 1), consequence };
    case 'ArrowRight':
      return { likelihood, consequence: clamp(consequence + 1) };
    case 'ArrowLeft':
      return { likelihood, consequence: clamp(consequence - 1) };
    case 'Home':
      return { likelihood: ctrl ? 5 : likelihood, consequence: 1 };
    case 'End':
      return { likelihood: ctrl ? 1 : likelihood, consequence: 5 };
    case 'PageUp':
      return { likelihood: 5, consequence };
    case 'PageDown':
      return { likelihood: 1, consequence };
    default:
      return null;
  }
}

/** Key of a cell in heatmap results: "likelihood-consequence". */
export const cellKey = (likelihood: number, consequence: number): string => `${likelihood}-${consequence}`;

/**
 * The value at a dot path, stepping into the first entry of arrays on the way
 * (`residualRisk`, `assessment.residual`, `risksArr.0.residual`).
 */
function valueAt(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.').filter(Boolean)) {
    if (Array.isArray(current) && !/^\d+$/.test(segment)) current = current[0];
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * The risk value of a record.
 * @param doc - The record (a search hit)
 * @param path - Path of its risk field, e.g. "residualRisk"
 * @returns The value, or null when the record has no complete risk there
 */
export function riskAt(doc: unknown, path: string): RiskCell | null {
  return parseRisk(valueAt(doc, path));
}

/** Records counted per cell of the matrix. */
export interface Heatmap<T> {
  /** Records per cell, by `cellKey(likelihood, consequence)`; cells with none are missing. */
  cells: Record<string, T[]>;
  /** Records per rating. */
  byRating: Record<Rating, number>;
  /** Records with a risk value. */
  total: number;
  /** Records without one (not assessed yet), left out of the cells. */
  skipped: number;
}

/**
 * Sorts records into the cells of the matrix by their risk value.
 * @param docs - Records
 * @param path - Path of the risk field in each record
 * @returns The records per cell and per rating
 */
export function heatmap<T>(docs: readonly T[], path: string): Heatmap<T> {
  const result: Heatmap<T> = {
    cells: {},
    byRating: Object.fromEntries(RATINGS.map((r) => [r, 0])) as Record<Rating, number>,
    total: 0,
    skipped: 0,
  };
  for (const doc of docs) {
    const risk = riskAt(doc, path);
    if (!risk) {
      result.skipped++;
      continue;
    }
    (result.cells[cellKey(risk.likelihood, risk.consequence)] ??= []).push(doc);
    result.byRating[risk.rating]++;
    result.total++;
  }
  return result;
}

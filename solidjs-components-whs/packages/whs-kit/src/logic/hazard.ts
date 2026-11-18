// Hazards: when one is next reviewed, and whether its controls are strong enough. Shared by the
// rulesets (embedded as source: keep each function self-contained) and the seed.

/**
 * When a hazard is next reviewed: 1, 3, 6 or 12 months after `from`, by its residual rating
 * (Extreme, High, Medium, Low).
 * @param from - The last review or assessment (ISO or ms)
 * @param rating - Residual rating
 * @returns ISO date, or '' for an unknown rating
 */
export function nextReviewDate(from: unknown, rating: unknown): string {
  const months: Record<string, number> = { Extreme: 1, High: 3, Medium: 6, Low: 12 };
  const add = months[String(rating)];
  if (!add) return '';
  const start = new Date(typeof from === 'number' ? from : Date.parse(String(from)));
  if (Number.isNaN(start.getTime())) return '';
  const next = new Date(start.getTime());
  next.setUTCMonth(next.getUTCMonth() + add);
  // 31 January + 1 month: the last day of February, not 3 March.
  if (next.getUTCDate() !== start.getUTCDate()) next.setUTCDate(0);
  return next.toISOString();
}

/**
 * Whether a hazard's controls are strong enough for its inherent risk. A High or Extreme hazard
 * needs a control at Engineering or above (rank 4 or better) unless a justification says why that
 * isn't reasonably practicable; an Extreme residual risk is never acceptable.
 * @param o - Inherent and residual ratings, the strongest control rank (99: none), the justification
 * @returns A message, or ''
 */
export function controlProblem(o: { inherent?: string | null; residual?: string | null; strongestRank: number; justification?: string | null }): string {
  if (o.residual === 'Extreme') return 'Work can\'t continue with an Extreme residual risk: add controls that lower it first.';
  if (o.strongestRank === 99) return 'Add at least one control before calling the hazard controlled.';
  const serious = o.inherent === 'High' || o.inherent === 'Extreme';
  if (serious && o.strongestRank > 4 && !String(o.justification ?? '').trim()) {
    return `A ${o.inherent} hazard needs a control at Engineering or above, or a justification of why only administrative controls and PPE are reasonably practicable.`;
  }
  return '';
}

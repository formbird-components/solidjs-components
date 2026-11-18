// Risk: likelihood × consequence on a 5 × 5 matrix, and what each rating asks for (who hears about
// it, how fast actions are due, how deep the investigation goes). Shared by <solid-risk-matrix>,
// <solid-corrective-actions>, the rulesets and the seed.
//
// The rulesets embed these functions as their source text (demo/lib/rules.mjs), so every function
// here is self-contained: no imports, no module constants, no calls to other functions in this file.
// The constants are for the elements and templates; test/logic.test.ts checks they agree.

export type Rating = 'Low' | 'Medium' | 'High' | 'Extreme';

/** What a risk field stores (<solid-risk-matrix>). */
export interface RiskValue {
  likelihood?: number | null;
  consequence?: number | null;
  score?: number | null;
  rating?: Rating | '' | null;
}

export interface Level {
  level: number;
  name: string;
  hint: string;
}

export const LIKELIHOODS: Level[] = [
  { level: 1, name: 'Rare', hint: 'Only in exceptional circumstances: less than once in 10 years' },
  { level: 2, name: 'Unlikely', hint: 'Could happen at some time: once in 5 to 10 years' },
  { level: 3, name: 'Possible', hint: 'Might happen: once in 1 to 5 years' },
  { level: 4, name: 'Likely', hint: 'Will probably happen: several times a year' },
  { level: 5, name: 'Almost certain', hint: 'Expected to happen: monthly or more often' },
];

export const CONSEQUENCES: Level[] = [
  { level: 1, name: 'Insignificant', hint: 'No injury, or first aid only; negligible damage' },
  { level: 2, name: 'Minor', hint: 'Medical treatment; minor damage; a spill contained on site' },
  { level: 3, name: 'Moderate', hint: 'Lost time injury; significant damage; a release needing outside help' },
  { level: 4, name: 'Major', hint: 'Serious injury or hospitalisation; major damage; a notifiable incident' },
  { level: 5, name: 'Catastrophic', hint: 'Death or permanent disability; extensive damage' },
];

export const RATINGS: Rating[] = ['Low', 'Medium', 'High', 'Extreme'];

export const RATING_COLORS: Record<Rating, string> = {
  Low: '#2e9d5b',
  Medium: '#c99700',
  High: '#e5711a',
  Extreme: '#d33a3a',
};

/** The matrix: MATRIX[likelihood - 1][consequence - 1]. */
export const MATRIX: Rating[][] = [
  ['Low', 'Low', 'Low', 'Medium', 'High'],
  ['Low', 'Low', 'Medium', 'Medium', 'High'],
  ['Low', 'Medium', 'Medium', 'High', 'Extreme'],
  ['Medium', 'Medium', 'High', 'High', 'Extreme'],
  ['Medium', 'High', 'High', 'Extreme', 'Extreme'],
];

/**
 * The rating of a likelihood and a consequence (1 to 5 each).
 * @param likelihood - 1 (Rare) to 5 (Almost certain)
 * @param consequence - 1 (Insignificant) to 5 (Catastrophic)
 * @returns The score (likelihood × consequence) and rating, or null when either is missing or out of range
 */
export function riskRating(likelihood: unknown, consequence: unknown): { score: number; rating: Rating } | null {
  const l = Number(likelihood);
  const c = Number(consequence);
  if (!Number.isInteger(l) || !Number.isInteger(c) || l < 1 || l > 5 || c < 1 || c > 5) return null;
  const grid = [
    ['Low', 'Low', 'Low', 'Medium', 'High'],
    ['Low', 'Low', 'Medium', 'Medium', 'High'],
    ['Low', 'Medium', 'Medium', 'High', 'Extreme'],
    ['Medium', 'Medium', 'High', 'High', 'Extreme'],
    ['Medium', 'High', 'High', 'Extreme', 'Extreme'],
  ];
  return { score: l * c, rating: grid[l - 1][c - 1] as Rating };
}

/** What a rating asks for. */
export interface RiskResponse {
  /** Hours to triage (move a report to Under Review). */
  respondHours: number;
  /** Days until corrective actions are due. */
  actionDays: number;
  /** Days to finish the investigation (0: none needed). */
  investigationDays: number;
  /** "none", "supervisor" (a supervisor's review and summary) or "full" (a WHS investigation with root causes). */
  investigation: 'none' | 'supervisor' | 'full';
  /** Months between reviews of a hazard at this residual rating. */
  reviewMonths: number;
  /** Roles told straight away, in order of seniority. */
  notify: string[];
  /** Who may close an incident at this rating. */
  closeBy: 'WHS' | 'Manager' | 'Executive';
}

/**
 * What a rating asks for: how fast, how deep, who hears about it and who signs it off.
 * @param rating - Low, Medium, High or Extreme
 * @returns The response, or null for an unknown rating
 */
export function riskResponse(rating: unknown): RiskResponse | null {
  const table: Record<string, RiskResponse> = {
    Low: { respondHours: 72, actionDays: 90, investigationDays: 0, investigation: 'none', reviewMonths: 12, notify: ['Supervisor'], closeBy: 'WHS' },
    Medium: { respondHours: 24, actionDays: 30, investigationDays: 28, investigation: 'supervisor', reviewMonths: 6, notify: ['Supervisor', 'WHS Advisor'], closeBy: 'WHS' },
    High: { respondHours: 4, actionDays: 7, investigationDays: 14, investigation: 'full', reviewMonths: 3, notify: ['Supervisor', 'WHS Advisor', 'Site Manager'], closeBy: 'Manager' },
    Extreme: {
      respondHours: 1,
      actionDays: 1,
      investigationDays: 7,
      investigation: 'full',
      reviewMonths: 1,
      notify: ['Supervisor', 'WHS Advisor', 'Site Manager', 'Executive'],
      closeBy: 'Executive',
    },
  };
  const found = table[String(rating)];
  return found ? { ...found, notify: [...found.notify] } : null;
}

/**
 * Whether a residual risk is no worse than the inherent risk: controls can't make a risk higher.
 * @param inherent - Before controls
 * @param residual - After controls
 * @returns A message when the residual risk is higher, else ''
 */
export function residualProblem(inherent: RiskValue | null | undefined, residual: RiskValue | null | undefined): string {
  const order = ['Low', 'Medium', 'High', 'Extreme'];
  const a = inherent && Number(inherent.likelihood) * Number(inherent.consequence);
  const b = residual && Number(residual.likelihood) * Number(residual.consequence);
  if (!a || !b) return '';
  const ra = order.indexOf(String(inherent!.rating));
  const rb = order.indexOf(String(residual!.rating));
  if (b > a || (ra > -1 && rb > ra)) return 'The residual risk can\'t be higher than the risk before controls.';
  if (Number(residual!.likelihood) > Number(inherent!.likelihood) || Number(residual!.consequence) > Number(inherent!.consequence)) {
    return 'Controls lower the likelihood or the consequence; neither can go up.';
  }
  return '';
}

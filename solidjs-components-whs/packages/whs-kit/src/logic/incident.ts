// Incidents: how an injury is classified for reporting, and whether the regulator must be told.
// Shared by the rulesets (embedded as source: keep each function self-contained) and the seed.
//
// "Notifiable" follows the model WHS laws in Australia (WHS Act 2011, ss 35 to 37): a death, a
// serious injury or illness (in-patient treatment, or immediate treatment for one of the listed
// injuries), or a dangerous incident. The regulator must be told immediately, and the site left
// undisturbed until an inspector arrives or says otherwise.

/** How an injury counts in the injury statistics. */
export interface InjuryClass {
  /** FAT, LTI, RWI, MTI, FAI or NTI. */
  code: string;
  label: string;
  /** Counts towards the total recordable injury frequency rate (TRIFR). */
  recordable: boolean;
  /** Counts towards the lost time injury frequency rate (LTIFR). */
  lostTime: boolean;
}

/** Treatments, from least to most serious (the Treatment lookup's values). */
export const TREATMENTS = ['No treatment', 'First aid', 'Medical treatment', 'Restricted duties', 'Lost time', 'Hospitalised (in-patient)', 'Fatality'];

/**
 * The injury class of a treatment.
 * @param treatment - A Treatment value ("First aid", "Lost time"…)
 * @returns The class, or null when no treatment is recorded
 */
export function injuryClass(treatment: unknown): InjuryClass | null {
  const classes: Record<string, InjuryClass> = {
    'No treatment': { code: 'NTI', label: 'No treatment injury', recordable: false, lostTime: false },
    'First aid': { code: 'FAI', label: 'First aid injury', recordable: false, lostTime: false },
    'Medical treatment': { code: 'MTI', label: 'Medical treatment injury', recordable: true, lostTime: false },
    'Restricted duties': { code: 'RWI', label: 'Restricted work injury', recordable: true, lostTime: false },
    'Lost time': { code: 'LTI', label: 'Lost time injury', recordable: true, lostTime: true },
    'Hospitalised (in-patient)': { code: 'LTI', label: 'Lost time injury (hospitalised)', recordable: true, lostTime: true },
    Fatality: { code: 'FAT', label: 'Fatality', recordable: true, lostTime: true },
  };
  return classes[String(treatment)] ?? null;
}

/** What decides whether an incident is notifiable. */
export interface NotifiableInput {
  /** Incident type ("Injury", "Dangerous incident"…). */
  type?: string | null;
  /** Treatment ("Hospitalised (in-patient)", "Fatality"…). */
  treatment?: string | null;
  /** Natures of the injury; `serious` marks the ones the law lists (amputation, serious burn…). */
  natures?: { name: string; serious?: boolean | null }[] | null;
  /** For a dangerous incident, what happened ("Uncontrolled fire or explosion"…). */
  dangerousKind?: string | null;
}

/**
 * Whether the regulator must be told about an incident, and why.
 * @param incident - Type, treatment, natures of the injury, kind of dangerous incident
 * @returns `notifiable` and the reasons, as people read them
 */
export function notifiable(incident: NotifiableInput): { notifiable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (incident.treatment === 'Fatality') reasons.push('A person died');
  if (incident.treatment === 'Hospitalised (in-patient)') reasons.push('Treatment as an in-patient in a hospital');
  for (const nature of incident.natures ?? []) {
    if (nature && nature.serious) reasons.push(`Serious injury: ${String(nature.name).toLowerCase()}`);
  }
  if (incident.type === 'Dangerous incident') reasons.push(`Dangerous incident${incident.dangerousKind ? `: ${String(incident.dangerousKind).toLowerCase()}` : ''}`);
  return { notifiable: reasons.length > 0, reasons };
}

/**
 * Hours between when an incident happened and when it was reported (negative: reported "before" it
 * happened, which the rules refuse).
 * @param occurred - When it happened (ISO)
 * @param reported - When it was reported (ISO)
 * @returns Hours, or null when either date is missing
 */
export function reportingDelayHours(occurred: unknown, reported: unknown): number | null {
  const a = Date.parse(String(occurred ?? ''));
  const b = Date.parse(String(reported ?? ''));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round(((b - a) / 3_600_000) * 10) / 10;
}

/**
 * Injury frequency rates, per million hours worked.
 * @param counts - Lost time and recordable injuries, and hours worked, over the same period
 * @returns LTIFR and TRIFR, rounded to one decimal; null when no hours were worked
 */
export function injuryRates(counts: { lostTime: number; recordable: number; hours: number }): { ltifr: number; trifr: number } | null {
  if (!counts.hours) return null;
  const rate = (n: number) => Math.round(((n * 1_000_000) / counts.hours) * 10) / 10;
  return { ltifr: rate(counts.lostTime), trifr: rate(counts.recordable) };
}

// Check sheets (fleet's Daily Driver and service checks, safety inspections): what has been answered
// and what the sheet comes to. Shared by <solid-checklist> and the apps' rulesets, which embed
// checklistOutcome as source text, so it must stay self-contained: no imports, no other functions.

/** One check on a sheet, as <solid-checklist> stores it. */
export interface CheckItem {
  key: string;
  question: string;
  category?: string;
  mandatory?: boolean;
  instruction?: string;
  /** "pass" | "fail" | "na"; empty until answered. */
  result?: 'pass' | 'fail' | 'na' | '' | null;
  comment?: string;
  /** Added on the sheet ("Add check") rather than from the check sheet. */
  adhoc?: boolean;
}

/** What a sheet comes to. */
export interface ChecklistOutcome {
  total: number;
  answered: number;
  passed: number;
  failed: number;
  na: number;
  /** Questions of mandatory checks not answered yet. */
  missingMandatory: string[];
  /** Questions of failed checks without a comment (when comments are required on failures). */
  failsWithoutComment: string[];
  /** Every mandatory check answered and every required comment given. */
  complete: boolean;
  /** "Pass", "Incomplete", or the fail label ("Defects found" by default) when a check failed. */
  result: string;
}

/**
 * Sums up a check sheet.
 * @param items - The checks
 * @param options - `commentOnFail`: a failed check needs a comment (default true); `failLabel`: the
 *   result when a check failed (default "Defects found")
 * @returns Counts, what is missing, and the result
 */
export function checklistOutcome(
  items: CheckItem[] | null | undefined,
  options: { commentOnFail?: boolean; failLabel?: string } = {},
): ChecklistOutcome {
  const list = Array.isArray(items) ? items : [];
  const commentOnFail = options.commentOnFail !== false;
  const outcome: ChecklistOutcome = {
    total: list.length,
    answered: 0,
    passed: 0,
    failed: 0,
    na: 0,
    missingMandatory: [],
    failsWithoutComment: [],
    complete: false,
    result: 'Incomplete',
  };
  for (const item of list) {
    if (item.result === 'pass') outcome.passed++;
    else if (item.result === 'fail') outcome.failed++;
    else if (item.result === 'na') outcome.na++;
    if (item.result) outcome.answered++;
    else if (item.mandatory) outcome.missingMandatory.push(item.question);
    if (item.result === 'fail' && commentOnFail && !String(item.comment ?? '').trim()) outcome.failsWithoutComment.push(item.question);
  }
  outcome.complete = list.length > 0 && !outcome.missingMandatory.length && !outcome.failsWithoutComment.length;
  outcome.result = !outcome.complete ? 'Incomplete' : outcome.failed ? options.failLabel || 'Defects found' : 'Pass';
  return outcome;
}

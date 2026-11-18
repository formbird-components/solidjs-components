// Approval chains: the people who must approve a record, in order (a leave request's line manager,
// then a second approver; a purchase's approvers by amount), who is next, delegation, and the
// decisions made. <solid-approval-chain> shows and edits one; the apps' rulesets plan the steps and
// check every change against the saved version with the same functions, which they carry as source
// text (functionsLib). So each function here is self-contained: no imports, no module-level helpers.

/** A person on a chain: an account as related fields store it. */
export interface ApprovalPerson {
  documentId: string;
  name: string;
  [field: string]: unknown;
}

/** One step: who may decide it, and what was decided. */
export interface ApprovalStep {
  /** Stable within the chain ("manager", "second"); rules match steps by it. */
  id: string;
  /** What the step is: "Line manager", "Second approver". */
  label: string;
  /** Why the step is there ("Below minimum staffing on Tue 9 Dec"). */
  reason?: string;
  /** Any one of them decides the step. */
  approvers: ApprovalPerson[];
  decision?: '' | 'approved' | 'rejected';
  decidedBy?: ApprovalPerson | null;
  decidedAt?: string | null;
  comment?: string;
  /** Someone an approver handed the step to; they may decide it too. */
  delegate?: ApprovalPerson | null;
  delegatedBy?: ApprovalPerson | null;
  delegatedAt?: string | null;
}

/** The chain as a record stores it. */
export interface ApprovalChain {
  steps: ApprovalStep[];
}

/** Where a chain stands. */
export interface ApprovalStatus {
  /** none: no steps; pending: waiting on a step; approved: every step approved; rejected: a step rejected. */
  state: 'none' | 'pending' | 'approved' | 'rejected';
  /** The step waiting for a decision, or -1. */
  current: number;
  /** Who can decide the current step: its approvers and its delegate. */
  waitingOn: ApprovalPerson[];
  /** Steps approved. */
  approved: number;
  total: number;
}

/**
 * Where a chain stands: the first undecided step is current; a rejection ends the chain.
 * @param chain - The chain (or anything: a missing chain has no steps)
 * @returns State, current step and who it waits on
 */
export function approvalStatus(chain: ApprovalChain | null | undefined): ApprovalStatus {
  const steps = chain && Array.isArray(chain.steps) ? chain.steps : [];
  const status: ApprovalStatus = { state: steps.length ? 'pending' : 'none', current: -1, waitingOn: [], approved: 0, total: steps.length };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || ({} as ApprovalStep);
    if (step.decision === 'rejected') {
      status.state = 'rejected';
      status.current = -1;
      status.waitingOn = [];
      return status;
    }
    if (step.decision === 'approved') {
      status.approved++;
      continue;
    }
    if (status.current === -1) {
      status.current = i;
      const people = (step.approvers || []).slice();
      if (step.delegate && step.delegate.documentId && !people.some((p) => p && p.documentId === step.delegate!.documentId)) people.push(step.delegate);
      status.waitingOn = people.filter((p) => p && p.documentId);
    }
  }
  if (steps.length && status.approved === steps.length) status.state = 'approved';
  return status;
}

/**
 * Whether a person may decide the current step: one of its approvers, or its delegate.
 * @param chain - The chain
 * @param userId - The person's documentId
 * @returns True when they can approve or reject now
 */
export function canDecide(chain: ApprovalChain | null | undefined, userId: string | null | undefined): boolean {
  if (!userId || !chain || !Array.isArray(chain.steps)) return false;
  for (const step of chain.steps) {
    if (!step) return false;
    if (step.decision === 'rejected') return false;
    if (step.decision === 'approved') continue;
    if ((step.approvers || []).some((p) => p && p.documentId === userId)) return true;
    return !!(step.delegate && step.delegate.documentId === userId);
  }
  return false;
}

/**
 * Problems with the changes between the saved chain and the one being saved, for the person saving:
 * a decision must be on the step that was current, by one of its approvers or its delegate; a
 * rejection needs a comment; decisions can't be undone, and a step can only be delegated by one of
 * its approvers while it is undecided. Steps are matched by id; steps a rule added or removed aren't
 * judged here (the rules plan the steps).
 * @param before - The saved chain (null for a new record)
 * @param after - The chain being saved
 * @param userId - Who is saving
 * @param options - `commentOnReject` (default true)
 * @returns Messages (empty when the changes are fine)
 */
export function approvalProblems(
  before: ApprovalChain | null | undefined,
  after: ApprovalChain | null | undefined,
  userId: string | null | undefined,
  options: { commentOnReject?: boolean } = {},
): string[] {
  const problems: string[] = [];
  const oldSteps = before && Array.isArray(before.steps) ? before.steps : [];
  const newSteps = after && Array.isArray(after.steps) ? after.steps : [];
  const isIn = (people: ApprovalPerson[] | undefined, id: string | null | undefined) => !!id && (people || []).some((p) => p && p.documentId === id);
  // The step that was current before this save.
  let current = -1;
  for (let i = 0; i < oldSteps.length; i++) {
    if (oldSteps[i] && oldSteps[i].decision === 'rejected') break;
    if (oldSteps[i] && oldSteps[i].decision === 'approved') continue;
    current = i;
    break;
  }
  let decisions = 0;
  for (const step of newSteps) {
    if (!step || !step.id) continue;
    const oldIndex = oldSteps.findIndex((s) => s && s.id === step.id);
    const old = oldIndex > -1 ? oldSteps[oldIndex] : null;
    const was = (old && old.decision) || '';
    const now = step.decision || '';
    if (was && now !== was) {
      problems.push(`The ${step.label || step.id} decision has been made and can't be changed.`);
      continue;
    }
    if (!was && now) {
      decisions++;
      const allowed = old ? old.approvers : step.approvers;
      const delegate = old ? old.delegate : step.delegate;
      if (oldIndex !== current) problems.push(`It isn't the ${step.label || step.id} step's turn yet.`);
      else if (!isIn(allowed, userId) && !(delegate && delegate.documentId === userId)) problems.push(`Only ${(allowed || []).map((p) => p.name).join(' or ') || 'its approver'} can decide the ${step.label || step.id} step.`);
      else if (step.decidedBy && step.decidedBy.documentId !== userId) problems.push('A decision is recorded in the name of the person who makes it.');
      if (now === 'rejected' && options.commentOnReject !== false && !String(step.comment || '').trim()) problems.push('Say why you are rejecting it.');
    }
    const oldDelegate = (old && old.delegate && old.delegate.documentId) || '';
    const newDelegate = (step.delegate && step.delegate.documentId) || '';
    if (oldDelegate !== newDelegate) {
      if (was) problems.push(`The ${step.label || step.id} step has been decided: it can't be delegated now.`);
      else if (!isIn(old ? old.approvers : step.approvers, userId)) problems.push(`Only an approver of the ${step.label || step.id} step can delegate it.`);
      else if (newDelegate && isIn(old ? old.approvers : step.approvers, newDelegate)) problems.push(`${step.delegate!.name} already approves the ${step.label || step.id} step.`);
    }
  }
  if (decisions > 1) problems.push('Decide one step at a time.');
  return problems;
}

/**
 * The steps a record needs now, merged with what the saved chain already holds: a planned step keeps
 * its decision and delegation when it was decided or delegated; a step that is no longer needed is
 * dropped while undecided, and kept once decided (the record shows who approved it).
 * @param planned - Steps the rules want, without decisions
 * @param saved - The chain being saved (decisions and delegations)
 * @returns The chain to store
 */
export function mergeApprovalChain(planned: ApprovalStep[], saved: ApprovalChain | null | undefined): ApprovalChain {
  const savedSteps = saved && Array.isArray(saved.steps) ? saved.steps : [];
  const byId: Record<string, ApprovalStep> = {};
  for (const step of savedSteps) if (step && step.id) byId[step.id] = step;
  const steps: ApprovalStep[] = [];
  const seen: Record<string, boolean> = {};
  for (const plan of planned) {
    const old = byId[plan.id];
    seen[plan.id] = true;
    if (old && old.decision) {
      steps.push(old);
      continue;
    }
    steps.push({
      ...plan,
      decision: '',
      decidedBy: null,
      decidedAt: null,
      comment: old && old.comment ? old.comment : '',
      delegate: old && old.delegate ? old.delegate : null,
      delegatedBy: old && old.delegate ? old.delegatedBy || null : null,
      delegatedAt: old && old.delegate ? old.delegatedAt || null : null,
    });
  }
  // Decided steps the plan no longer has stay where they were, before the steps still to come.
  for (let i = 0; i < savedSteps.length; i++) {
    const step = savedSteps[i];
    if (!step || !step.id || seen[step.id] || !step.decision) continue;
    steps.splice(Math.min(i, steps.length), 0, step);
  }
  return { steps };
}

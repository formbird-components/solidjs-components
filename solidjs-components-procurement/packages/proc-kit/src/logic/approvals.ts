// Who approves a purchase: the delegations of authority by amount, plus the steps a request needs
// for what it is (fewer quotes than the amount asks for, going over the cost centre's budget).
// Shared by the rulesets (embedded as source: keep each function self-contained) and the seed; the
// steps feed the kit's approval chain.

/** A person on an approval step. */
export interface Approver {
  documentId: string;
  name: string;
}

/**
 * A delegation of authority: from this amount (ex GST, exclusive), this step is needed. `rule` says
 * who approves it: the cost centre's manager, that manager's own manager, or the people listed.
 */
export interface ApprovalTier {
  id: string;
  label: string;
  /** The step is needed when the amount is above this (0: always). */
  fromAmount: number;
  rule: 'owner' | 'ownerManager' | 'people';
  approvers?: Approver[];
}

/** A step for the kit's approval chain (no decision yet). */
export interface PlannedStep {
  id: string;
  label: string;
  reason?: string;
  approvers: Approver[];
}

/**
 * The approval steps a purchase request needs, in order: the cost centre manager; Procurement when the
 * request has fewer quotes than its amount asks for (or another reason); Finance when it would go over
 * the cost centre's budget; then each higher delegation the amount reaches. Nobody approves their own
 * request, and nobody approves twice: a step whose approvers have all approved an earlier step is
 * left out. A step with nobody left goes to the fallback people (Finance).
 * @param o - The requester, the cost centre's manager and theirs, the amount (ex GST), the tiers, and
 *   what else the request needs
 * @returns The steps
 * @example
 * ```ts
 * purchaseApprovalSteps({ requester, owner: tom, ownerManager: greg, amount: 18900, tiers, finance: [lachlan] });
 * // [{ id: 'manager', … tom }, { id: 'tier-senior', … greg }]
 * ```
 */
export function purchaseApprovalSteps(o: {
  requester: Approver;
  owner?: Approver | null;
  ownerManager?: Approver | null;
  amount: number;
  tiers: ApprovalTier[];
  /** Finance: the override step, and the fallback for a step with nobody left. */
  finance: Approver[];
  procurement?: Approver[];
  /** Why Procurement must approve ("Sole supplier: …"); none: no Procurement step. */
  procurementReasons?: string[];
  /** Over budget: by how much, and what was left. */
  overBudget?: { by: number; remaining: number; costCentre?: string } | null;
}): PlannedStep[] {
  const money = (n: number) => '$' + Math.round(n).toLocaleString('en-AU');
  const pick = (p: Approver | null | undefined): Approver | null => (p && p.documentId ? { documentId: p.documentId, name: p.name } : null);
  const amount = Number(o.amount) || 0;
  const taken: string[] = [];
  const steps: PlannedStep[] = [];
  const add = (step: PlannedStep, fallback: Approver[]) => {
    const unique = (list: (Approver | null)[]) => {
      const seen: string[] = [];
      return list.filter((p): p is Approver => {
        if (!p || p.documentId === o.requester.documentId || seen.indexOf(p.documentId) > -1) return false;
        seen.push(p.documentId);
        return true;
      });
    };
    let people = unique(step.approvers);
    // Everyone left already approves an earlier step: their approval covers this one.
    if (people.length && people.every((p) => taken.indexOf(p.documentId) > -1)) return;
    people = people.filter((p) => taken.indexOf(p.documentId) === -1);
    if (!people.length) people = unique(fallback).filter((p) => taken.indexOf(p.documentId) === -1);
    if (!people.length) return;
    people.forEach((p) => taken.push(p.documentId));
    steps.push({ ...step, approvers: people });
  };
  const sorted = (o.tiers || []).slice().sort((a, b) => (Number(a.fromAmount) || 0) - (Number(b.fromAmount) || 0));
  const approversOf = (tier: ApprovalTier): Approver[] => {
    if (tier.rule === 'owner') {
      // A manager's own request goes to their manager.
      const owner = pick(o.owner);
      return owner && owner.documentId === o.requester.documentId ? [pick(o.ownerManager)].filter((p): p is Approver => !!p) : owner ? [owner] : [];
    }
    if (tier.rule === 'ownerManager') return [pick(o.ownerManager)].filter((p): p is Approver => !!p);
    return (tier.approvers || []).map(pick).filter((p): p is Approver => !!p);
  };
  const first = sorted.filter((t) => !(Number(t.fromAmount) > 0));
  const higher = sorted.filter((t) => Number(t.fromAmount) > 0 && amount > Number(t.fromAmount));
  first.forEach((tier) => add({ id: tier.id, label: tier.label, approvers: approversOf(tier) }, o.finance));
  if (o.procurementReasons && o.procurementReasons.length) {
    add({ id: 'procurement', label: 'Procurement', reason: o.procurementReasons.join(' '), approvers: o.procurement || [] }, o.finance);
  }
  if (o.overBudget && o.overBudget.by > 0) {
    add(
      {
        id: 'finance',
        label: 'Finance override',
        reason: (o.overBudget.costCentre ? o.overBudget.costCentre + ' has ' : 'The cost centre has ') + money(Math.max(0, o.overBudget.remaining)) + ' left this year: this request goes ' + money(o.overBudget.by) + ' over.',
        approvers: o.finance,
      },
      [],
    );
  }
  higher.forEach((tier) => add({ id: tier.id, label: tier.label, reason: 'Above ' + money(Number(tier.fromAmount)) + '.', approvers: approversOf(tier) }, o.finance));
  return steps;
}

// Root cause analysis: a five-whys tree. The problem is the root; each "why?" answer is a node whose
// children answer "why?" about it, so a tree can branch where several things contributed. Leaves
// marked as root causes carry a category. Shared by <solid-root-cause>, the rulesets (embedded as
// source: keep each function self-contained) and the seed.

/** One answer to "why?". */
export interface CauseNode {
  id: string;
  text: string;
  /** People, Procedure, Plant and equipment, Environment, Organisation. */
  category?: string | null;
  /** A root cause: where asking why again stops being useful. */
  root?: boolean;
  children?: CauseNode[];
}

/** What a root cause field stores (<solid-root-cause>). */
export interface CauseTree {
  /** The problem the whys start from (defaults to the record's title). */
  problem?: string | null;
  nodes?: CauseNode[] | null;
}

/** Categories of root causes (the Cause category lookup's values). */
export const CAUSE_CATEGORIES = ['People', 'Procedure', 'Plant and equipment', 'Environment', 'Organisation'];

/** What a tree comes to. */
export interface CauseSummary {
  /** Answers given (non-empty nodes). */
  whys: number;
  /** Longest chain of whys. */
  depth: number;
  roots: { text: string; category: string; depth: number }[];
  /** Nodes with no text. */
  blank: number;
}

/**
 * Sums up a five-whys tree.
 * @param tree - The tree
 * @returns Counts, depth and the root causes
 */
export function causeSummary(tree: CauseTree | null | undefined): CauseSummary {
  const summary: CauseSummary = { whys: 0, depth: 0, roots: [], blank: 0 };
  const walk = (nodes: CauseNode[] | null | undefined, depth: number) => {
    for (const node of nodes ?? []) {
      if (!node) continue;
      const text = String(node.text ?? '').trim();
      if (text) summary.whys++;
      else summary.blank++;
      if (depth > summary.depth) summary.depth = depth;
      if (node.root && text) summary.roots.push({ text, category: String(node.category ?? ''), depth });
      walk(node.children, depth + 1);
    }
  };
  walk(tree?.nodes, 1);
  return summary;
}

/**
 * What stops a tree being a finished investigation.
 * @param tree - The tree
 * @param options - `minDepth`: whys a root cause needs above it, itself included (default 3)
 * @returns Messages; empty when it is complete
 */
export function causeProblems(tree: CauseTree | null | undefined, options: { minDepth?: number } = {}): string[] {
  const minDepth = options.minDepth ?? 3;
  const problems: string[] = [];
  let whys = 0;
  let blank = 0;
  const roots: { category: string; depth: number }[] = [];
  const walk = (nodes: CauseNode[] | null | undefined, depth: number) => {
    for (const node of nodes ?? []) {
      if (!node) continue;
      const text = String(node.text ?? '').trim();
      if (text) whys++;
      else blank++;
      if (node.root && text) roots.push({ category: String(node.category ?? ''), depth });
      walk(node.children, depth + 1);
    }
  };
  walk(tree?.nodes, 1);
  if (!String(tree?.problem ?? '').trim()) problems.push('Say what the problem is before asking why.');
  if (!whys) problems.push('Ask why it happened, at least once.');
  if (blank) problems.push(blank === 1 ? 'One why has no answer: fill it in or remove it.' : `${blank} whys have no answer: fill them in or remove them.`);
  if (whys && !roots.length) problems.push('Mark at least one answer as a root cause.');
  if (roots.some((r) => !r.category)) problems.push('Give each root cause a category.');
  if (roots.some((r) => r.depth < minDepth)) problems.push(`Ask why at least ${minDepth} times before settling on a root cause.`);
  return problems;
}

// What <solid-org-chart> needs: people arranged by who they report to, the reporting line above
// someone, and search. Element-only (the rulesets don't use it).

/** A person on the chart. */
export interface OrgPerson {
  id: string;
  name: string;
  title: string;
  team: string;
  /** The team's colour (CSS), or ''. */
  color: string;
  /** Whom they report to ('' at the top). */
  managerId: string;
}

/** A person and the people who report to them. */
export interface OrgNode {
  person: OrgPerson;
  children: OrgNode[];
  depth: number;
  /** Everyone below them. */
  size: number;
}

/**
 * Builds the reporting tree. People whose manager isn't in the list (or who would close a loop) are
 * roots; reports are ordered by name.
 * @param people - Everyone on the chart
 * @returns The roots, and every node by person id
 */
export function buildOrgTree(people: OrgPerson[]): { roots: OrgNode[]; byId: Map<string, OrgNode> } {
  const byId = new Map<string, OrgNode>();
  for (const person of people) if (person.id && !byId.has(person.id)) byId.set(person.id, { person, children: [], depth: 0, size: 0 });
  // A manager chain that loops back to the person makes them a root, so the tree stays a tree.
  const loops = (id: string) => {
    const seen = new Set<string>([id]);
    for (let at = byId.get(id)?.person.managerId; at && byId.has(at); at = byId.get(at)!.person.managerId) {
      if (seen.has(at)) return true;
      seen.add(at);
    }
    return false;
  };
  const roots: OrgNode[] = [];
  for (const node of byId.values()) {
    const manager = node.person.managerId && node.person.managerId !== node.person.id ? byId.get(node.person.managerId) : undefined;
    if (manager && !loops(node.person.id)) manager.children.push(node);
    else roots.push(node);
  }
  const byName = (a: OrgNode, b: OrgNode) => b.size - a.size || a.person.name.localeCompare(b.person.name);
  const walk = (node: OrgNode, depth: number): number => {
    node.depth = depth;
    node.size = node.children.reduce((sum, child) => sum + 1 + walk(child, depth + 1), 0);
    return node.size;
  };
  roots.forEach((root) => walk(root, 0));
  const sort = (nodes: OrgNode[]) => {
    nodes.sort((a, b) => (a.children.length && !b.children.length ? -1 : !a.children.length && b.children.length ? 1 : byName(a, b)));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return { roots, byId };
}

/**
 * The reporting line from the top down to a person.
 * @param id - The person
 * @param byId - Nodes by id (buildOrgTree)
 * @returns Ids from the root to the person, or [] when they aren't on the chart
 */
export function reportingLine(id: string, byId: Map<string, OrgNode>): string[] {
  const line: string[] = [];
  const seen = new Set<string>();
  for (let at: string | undefined = id; at && byId.has(at) && !seen.has(at); at = byId.get(at)!.person.managerId) {
    seen.add(at);
    line.unshift(at);
  }
  return line;
}

/**
 * People whose name, title or team contains the text (case and accents ignored).
 * @param people - Everyone on the chart
 * @param text - What was typed
 * @returns Matching ids, by name
 */
export function searchPeople(people: OrgPerson[], text: string): string[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(text.trim());
  if (!q) return [];
  return people
    .filter((p) => norm(`${p.name} ${p.title} ${p.team}`).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => p.id);
}

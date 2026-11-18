// Editing a five-whys tree (<solid-root-cause>): reading a stored tree into a shape that is safe to
// edit, and immutable edits by node id. Element-only: the rulesets embed logic/rootcause.ts.

import type { CauseNode, CauseTree } from './logic/rootcause';

/** A tree ready to edit: a problem string, and nodes that all have an id, text and children. */
export interface EditableTree {
  problem: string;
  nodes: CauseNode[];
}

/** Where a node sits in a tree. */
export interface NodePlace {
  node: CauseNode;
  /** 1 for an answer to the problem itself ("Why 1"). */
  depth: number;
  /** The node it answers, or null at the top. */
  parent: CauseNode | null;
  /** Its position among its siblings. */
  index: number;
  /** Its siblings, itself included. */
  siblings: CauseNode[];
}

/**
 * Reads a stored tree. Every node gets an id (missing ones become `why-<position>`, the same every
 * time, so reading a stored value twice gives equal trees), text and a children array; entries
 * that aren't objects are dropped.
 * @param raw - The field's value
 * @returns The tree
 */
export function parseCauseTree(raw: unknown): EditableTree {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CauseTree) : {};
  const seen = new Set<string>();
  const read = (list: unknown, prefix: string): CauseNode[] => {
    if (!Array.isArray(list)) return [];
    return list
      .filter((entry): entry is CauseNode => !!entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry, index) => {
        const position = `${prefix}-${index + 1}`;
        let id = typeof entry.id === 'string' && entry.id ? entry.id : `why${position}`;
        while (seen.has(id)) id = `${id}-${index + 1}`;
        seen.add(id);
        const node: CauseNode = { ...entry, id, text: typeof entry.text === 'string' ? entry.text : String(entry.text ?? '') };
        if (node.root !== true) delete node.root;
        if (node.category === undefined) delete node.category;
        node.children = read(entry.children, position);
        return node;
      });
  };
  return { problem: typeof source.problem === 'string' ? source.problem : '', nodes: read(source.nodes, '') };
}

/**
 * Finds a node and where it sits.
 * @param nodes - The tree's nodes
 * @param id - The node's id
 * @returns Its place, or undefined
 */
export function findNode(nodes: CauseNode[], id: string): NodePlace | undefined {
  const walk = (list: CauseNode[], depth: number, parent: CauseNode | null): NodePlace | undefined => {
    for (let index = 0; index < list.length; index++) {
      const node = list[index];
      if (node.id === id) return { node, depth, parent, index, siblings: list };
      const found = walk(node.children ?? [], depth + 1, node);
      if (found) return found;
    }
    return undefined;
  };
  return walk(nodes, 1, null);
}

/** Copies the path down to the node with `id` and applies `change` to the list holding it. */
function editList(nodes: CauseNode[], id: string | null, change: (list: CauseNode[], index: number) => CauseNode[]): CauseNode[] {
  if (id === null) return change(nodes, -1);
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) return change(nodes, index);
  let changed = false;
  const next = nodes.map((node) => {
    if (changed || !node.children?.length) return node;
    const children = editList(node.children, id, change);
    if (children === node.children) return node;
    changed = true;
    return { ...node, children };
  });
  return changed ? next : nodes;
}

/**
 * Changes one node.
 * @param nodes - The tree's nodes
 * @param id - The node's id
 * @param patch - Fields to set; `undefined` removes a field
 * @returns New nodes (the same array when the id isn't found)
 */
export function updateNode(nodes: CauseNode[], id: string, patch: Partial<CauseNode>): CauseNode[] {
  return editList(nodes, id, (list, index) =>
    list.map((node, i) => {
      if (i !== index) return node;
      const next: CauseNode = { ...node, ...patch };
      for (const key of Object.keys(patch) as (keyof CauseNode)[]) if (patch[key] === undefined) delete next[key];
      return next;
    }),
  );
}

/**
 * Asks why about a node: adds `child` as its last answer.
 * @param nodes - The tree's nodes
 * @param parentId - The node, or null to answer the problem itself
 * @param child - The new node
 * @returns New nodes
 */
export function addChild(nodes: CauseNode[], parentId: string | null, child: CauseNode): CauseNode[] {
  if (parentId === null) return [...nodes, child];
  return editList(nodes, parentId, (list, index) =>
    list.map((node, i) => (i === index ? { ...node, children: [...(node.children ?? []), child] } : node)),
  );
}

/**
 * Adds another cause beside a node (something else that contributed), right after it.
 * @param nodes - The tree's nodes
 * @param id - The node
 * @param sibling - The new node
 * @returns New nodes
 */
export function addSibling(nodes: CauseNode[], id: string, sibling: CauseNode): CauseNode[] {
  return editList(nodes, id, (list, index) => [...list.slice(0, index + 1), sibling, ...list.slice(index + 1)]);
}

/**
 * Removes a node and everything under it.
 * @param nodes - The tree's nodes
 * @param id - The node
 * @returns New nodes
 */
export function removeNode(nodes: CauseNode[], id: string): CauseNode[] {
  return editList(nodes, id, (list, index) => list.filter((_, i) => i !== index));
}

/**
 * How many nodes sit under a node, at any depth.
 * @param node - The node
 * @returns The count
 */
export function countDescendants(node: CauseNode): number {
  return (node.children ?? []).reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

/**
 * Every node in reading order (depth first), with its depth.
 * @param nodes - The tree's nodes
 * @returns The nodes
 */
export function flattenTree(nodes: CauseNode[]): { node: CauseNode; depth: number }[] {
  const out: { node: CauseNode; depth: number }[] = [];
  const walk = (list: CauseNode[], depth: number) => {
    for (const node of list) {
      out.push({ node, depth });
      walk(node.children ?? [], depth + 1);
    }
  };
  walk(nodes, 1);
  return out;
}

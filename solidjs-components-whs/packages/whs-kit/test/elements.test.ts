import { describe, expect, it } from 'vitest';
import {
  dueDateFromInput,
  dueDateInput,
  dueHint,
  firstRating,
  isSavedRecord,
  newActionValues,
  ratingOf,
  sortActions,
  toActionItem,
} from '../src/actionlist';
import { addChild, addSibling, countDescendants, findNode, flattenTree, parseCauseTree, removeNode, updateNode } from '../src/causetree';
import { actionDueDate } from '../src/logic/actions';
import { causeSummary } from '../src/logic/rootcause';
import { cellKey, heatmap, moveCell, parseRisk, responseSummary, riskAt, riskValue } from '../src/matrix';

describe('risk matrix values', () => {
  it('stores likelihood, consequence, score and rating', () => {
    expect(riskValue(4, 4)).toEqual({ likelihood: 4, consequence: 4, score: 16, rating: 'High' });
    expect(riskValue('5', '5')).toEqual({ likelihood: 5, consequence: 5, score: 25, rating: 'Extreme' });
    expect(riskValue(0, 3)).toBeNull();
    expect(riskValue(3, null)).toBeNull();
  });

  it('reads a stored value, re-rating it', () => {
    expect(parseRisk({ likelihood: 2, consequence: 4, score: 99, rating: 'Extreme' })).toEqual({ likelihood: 2, consequence: 4, score: 8, rating: 'Medium' });
    expect(parseRisk({ likelihood: 2 })).toBeNull();
    expect(parseRisk(null)).toBeNull();
    expect(parseRisk('High')).toBeNull();
    expect(parseRisk([{ likelihood: 1, consequence: 1 }])).toBeNull();
  });

  it('says what a rating asks for', () => {
    expect(responseSummary('High')).toBe('Actions due within 7 days · Investigation: full · Notify: Supervisor, WHS Advisor, Site Manager');
    expect(responseSummary('Extreme')).toBe('Actions due within 1 day · Investigation: full · Notify: Supervisor, WHS Advisor, Site Manager, Executive');
    expect(responseSummary('Medium')).toBe("Actions due within 30 days · Investigation: supervisor's review · Notify: Supervisor, WHS Advisor");
    expect(responseSummary('Low')).toBe('Actions due within 90 days · Investigation: none · Notify: Supervisor');
    expect(responseSummary('')).toBe('');
  });

  it('moves around the grid with Almost certain at the top', () => {
    const at = { likelihood: 3, consequence: 3 };
    expect(moveCell(at, 'ArrowUp')).toEqual({ likelihood: 4, consequence: 3 });
    expect(moveCell(at, 'ArrowDown')).toEqual({ likelihood: 2, consequence: 3 });
    expect(moveCell(at, 'ArrowRight')).toEqual({ likelihood: 3, consequence: 4 });
    expect(moveCell(at, 'ArrowLeft')).toEqual({ likelihood: 3, consequence: 2 });
    expect(moveCell({ likelihood: 5, consequence: 5 }, 'ArrowUp')).toEqual({ likelihood: 5, consequence: 5 });
    expect(moveCell({ likelihood: 1, consequence: 1 }, 'ArrowLeft')).toEqual({ likelihood: 1, consequence: 1 });
    expect(moveCell(at, 'Home')).toEqual({ likelihood: 3, consequence: 1 });
    expect(moveCell(at, 'End', true)).toEqual({ likelihood: 1, consequence: 5 });
    expect(moveCell(at, 'Home', true)).toEqual({ likelihood: 5, consequence: 1 });
    expect(moveCell(at, 'PageDown')).toEqual({ likelihood: 1, consequence: 3 });
    expect(moveCell(at, 'Enter')).toBeNull();
  });

  it('counts records per cell and rating, skipping those not assessed', () => {
    const docs = [
      { id: 'a', residualRisk: { likelihood: 2, consequence: 4 } },
      { id: 'b', residualRisk: { likelihood: 2, consequence: 4, score: 8, rating: 'Medium' } },
      { id: 'c', residualRisk: { likelihood: 1, consequence: 5 } },
      { id: 'd' },
      { id: 'e', residualRisk: { likelihood: 9, consequence: 1 } },
    ];
    const map = heatmap(docs, 'residualRisk');
    expect(map.cells[cellKey(2, 4)].map((d) => d.id)).toEqual(['a', 'b']);
    expect(map.cells[cellKey(1, 5)].map((d) => d.id)).toEqual(['c']);
    expect(map.byRating).toEqual({ Low: 0, Medium: 2, High: 1, Extreme: 0 });
    expect(map.total).toBe(3);
    expect(map.skipped).toBe(2);
    expect(riskAt({ risks: [{ residual: { likelihood: 1, consequence: 1 } }] }, 'risks.residual')?.rating).toBe('Low');
  });
});

describe('editing a five-whys tree', () => {
  const stored = {
    problem: 'Forklift struck racking upright',
    nodes: [
      { id: 'w1', text: 'Could not see the upright', children: [{ id: 'w2', text: 'Load above eye level' }] },
      { text: 'Aisle lights out', root: true, category: 'Environment' },
      'junk',
    ],
  };

  it('reads a stored tree, giving every node an id and children', () => {
    const tree = parseCauseTree(stored);
    expect(tree.problem).toBe('Forklift struck racking upright');
    expect(tree.nodes.map((n) => n.id)).toEqual(['w1', 'why-2']);
    expect(tree.nodes[0].children?.[0]).toEqual({ id: 'w2', text: 'Load above eye level', children: [] });
    expect(tree.nodes[1]).toEqual({ id: 'why-2', text: 'Aisle lights out', root: true, category: 'Environment', children: [] });
    expect(parseCauseTree(stored)).toEqual(tree);
    expect(parseCauseTree(null)).toEqual({ problem: '', nodes: [] });
    expect(parseCauseTree({ nodes: [{ id: 'x', text: 'a' }, { id: 'x', text: 'b' }] }).nodes.map((n) => n.id)).toEqual(['x', 'x-2']);
  });

  it('finds nodes with their depth and parent', () => {
    const { nodes } = parseCauseTree(stored);
    const place = findNode(nodes, 'w2')!;
    expect(place.depth).toBe(2);
    expect(place.parent?.id).toBe('w1');
    expect(findNode(nodes, 'nope')).toBeUndefined();
    expect(flattenTree(nodes).map((e) => [e.node.id, e.depth])).toEqual([
      ['w1', 1],
      ['w2', 2],
      ['why-2', 1],
    ]);
  });

  it('asks why, adds causes beside, edits and removes without touching the original', () => {
    const { nodes } = parseCauseTree(stored);
    const before = JSON.stringify(nodes);
    const asked = addChild(nodes, 'w2', { id: 'w3', text: 'No height limit', children: [] });
    expect(findNode(asked, 'w3')?.depth).toBe(3);
    const top = addChild(asked, null, { id: 't', text: '', children: [] });
    expect(top.map((n) => n.id)).toEqual(['w1', 'why-2', 't']);
    const beside = addSibling(top, 'w1', { id: 's', text: '', children: [] });
    expect(beside.map((n) => n.id)).toEqual(['w1', 's', 'why-2', 't']);
    const marked = updateNode(beside, 'w3', { root: true, category: 'Procedure' });
    expect(findNode(marked, 'w3')?.node).toMatchObject({ root: true, category: 'Procedure' });
    const unmarked = updateNode(marked, 'w3', { root: undefined, category: undefined });
    expect(findNode(unmarked, 'w3')?.node).toEqual({ id: 'w3', text: 'No height limit', children: [] });
    expect(countDescendants(findNode(marked, 'w1')!.node)).toBe(2);
    const removed = removeNode(marked, 'w1');
    expect(removed.map((n) => n.id)).toEqual(['s', 'why-2', 't']);
    expect(updateNode(nodes, 'nope', { text: 'x' })).toBe(nodes);
    expect(JSON.stringify(nodes)).toBe(before);
    expect(causeSummary({ problem: 'p', nodes: marked }).depth).toBe(3);
  });
});

describe('corrective actions list', () => {
  const doc = {
    documentId: 'action-31',
    systemHeader: { summaryName: 'ACT-31: Install convex mirrors' },
    actionRef: 'ACT-31',
    title: 'Install convex mirrors',
    actionStatusRel: [{ documentId: 's1', name: 'Open', color: '#3e63dd' }],
    controlLevelRel: [{ documentId: 'c4', name: 'Engineering', rank: 4 }],
    ownerRel: [{ documentId: 'p1', name: 'Daniel Okafor', email: 'daniel.okafor@example.com' }],
    dueDate: '2026-11-04T07:00:00.000Z',
  };

  it('reads action records', () => {
    expect(toActionItem(doc)).toEqual({
      documentId: 'action-31',
      ref: 'ACT-31',
      title: 'Install convex mirrors',
      status: { name: 'Open', color: '#3e63dd' },
      level: { name: 'Engineering', rank: 4 },
      owner: { documentId: 'p1', name: 'Daniel Okafor', email: 'daniel.okafor@example.com' },
      dueDate: '2026-11-04T07:00:00.000Z',
      completedDate: '',
    });
    const bare = toActionItem({ documentId: 'x', systemHeader: { summaryName: 'ACT-9: Fix it' }, actionRef: 'ACT-9', controlLevelRel: [{ name: 'PPE' }] });
    expect(bare).toMatchObject({ title: 'Fix it', status: null, owner: null, level: { name: 'PPE', rank: 6 } });
  });

  it('orders outstanding actions first, each group by due date, undated last', () => {
    const open = toActionItem(doc);
    const items = [
      { ...open, documentId: 'undated', dueDate: '' },
      { ...open, documentId: 'later', dueDate: '2026-12-01T07:00:00.000Z' },
      { ...open, documentId: 'done', dueDate: '2026-10-01T07:00:00.000Z', status: { name: 'Verified', color: '' } },
      { ...open, documentId: 'cancelled', dueDate: '2026-09-01T07:00:00.000Z', status: { name: 'Cancelled', color: '' } },
      open,
    ];
    expect(sortActions(items).map((i) => i.documentId)).toEqual(['action-31', 'later', 'undated', 'done', 'cancelled']);
  });

  it('finds the rating in any field shape, first non-empty wins', () => {
    expect(ratingOf('High')).toBe('High');
    expect(ratingOf('extreme')).toBe('Extreme');
    expect(ratingOf({ likelihood: 2, consequence: 2, score: 4, rating: 'Low' })).toBe('Low');
    expect(ratingOf([{ documentId: 'r', name: 'Medium' }])).toBe('Medium');
    expect(ratingOf('Bad')).toBe('');
    expect(ratingOf(null)).toBe('');
    expect(firstRating([undefined, '', [{ name: 'High' }], 'Low'])).toBe('High');
    expect(firstRating([])).toBe('');
  });

  it('dates actions in eastern Australia, as actionDueDate does', () => {
    const due = actionDueDate('2026-11-05T00:00:00Z', 7);
    expect(dueDateInput(due)).toBe('2026-11-12');
    expect(dueDateFromInput('2026-11-12')).toBe(due);
    // 20:00 UTC is already the next day in eastern Australia.
    expect(dueDateInput('2026-11-05T20:00:00Z')).toBe('2026-11-06');
    expect(dueDateInput('')).toBe('');
    expect(dueDateFromInput('12/11/2026')).toBe('');
    expect(dueHint('High')).toBe('High risk: due within 7 days');
    expect(dueHint('Extreme')).toBe('Extreme risk: due within 1 day');
    expect(dueHint('')).toBe('');
  });

  it('knows a saved record', () => {
    expect(isSavedRecord({ systemHeader: { serverCreatedDate: '2026-11-01T00:00:00Z' } })).toBe(true);
    expect(isSavedRecord({ systemHeader: { createdDate: '2026-11-01T00:00:00Z' } })).toBe(true);
    expect(isSavedRecord({ systemHeader: { summaryName: '' } })).toBe(false);
    expect(isSavedRecord(undefined)).toBe(false);
  });

  it('builds a new action in the data model, leaving out what is empty', () => {
    const source = { documentId: 'incident-12', name: 'INC-12: Forklift struck racking upright', ref: 'INC-12', kind: 'incident', riskRating: 'High' };
    const values = newActionValues({
      title: '  Fit blue spot lights  ',
      level: { documentId: 'c4', name: 'Engineering', rank: 4 },
      owner: { documentId: 'p1', name: 'Daniel Okafor' },
      dueDate: '2026-11-12T07:00:00.000Z',
      raisedDate: '2026-11-05T00:00:00.000Z',
      status: { documentId: 's1', name: 'Open' },
      source,
    });
    expect(values).toEqual({
      appTags: ['whs', 'action'],
      title: 'Fit blue spot lights',
      controlLevelRel: [{ documentId: 'c4', name: 'Engineering', rank: 4 }],
      ownerRel: [{ documentId: 'p1', name: 'Daniel Okafor' }],
      dueDate: '2026-11-12T07:00:00.000Z',
      raisedDate: '2026-11-05T00:00:00.000Z',
      actionStatusRel: [{ documentId: 's1', name: 'Open' }],
      sourceRel: [source],
    });
    expect(newActionValues({ title: 'Toolbox talk', raisedDate: 'r', source: { documentId: 'h', name: 'HAZ-7', kind: 'hazard' } })).toEqual({
      appTags: ['whs', 'action'],
      title: 'Toolbox talk',
      raisedDate: 'r',
      sourceRel: [{ documentId: 'h', name: 'HAZ-7', kind: 'hazard' }],
    });
  });
});

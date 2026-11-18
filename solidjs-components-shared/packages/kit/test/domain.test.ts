import { describe, expect, it } from 'vitest';
import { iconSetForField, issueTypeKind, priorityLevel } from '../src/domain/lookups';
import { allowedTransitions, cssColor, needsResolution, statusCategory } from '../src/domain/status';

const status = (name: string) => ({ documentId: name.toLowerCase().replace(/\W+/g, '-'), name });
const ALL = ['New', 'Assigned', 'In Progress', 'In Review', 'Resolved', 'Closed'].map(status);

describe('statusCategory', () => {
  it.each([
    ['New', 'todo'],
    ['Acknowledged', 'todo'],
    ['Assigned', 'inprogress'],
    ['In Progress', 'inprogress'],
    ['In Review', 'inprogress'],
    ['Testing', 'inprogress'],
    ['Resolved', 'done'],
    ['Closed', 'done'],
    ["Won't Fix", 'done'],
  ])('%s → %s', (name, category) => {
    expect(statusCategory(name)).toBe(category);
  });

  it('prefers the document value, then the definition map', () => {
    expect(statusCategory('Parked', { parked: 'done' })).toBe('done');
    expect(statusCategory('Closed', { Closed: 'todo' }, 'inprogress')).toBe('inprogress');
    expect(statusCategory('Closed', undefined, 'not-a-category')).toBe('done');
  });
});

describe('allowedTransitions', () => {
  const rules = { 'In Progress': ['In Review', 'Resolved'], '*': ['New'] };

  it('uses the rule for the current status, matched by name', () => {
    expect(allowedTransitions(status('in progress'), ALL, { 'in progress': ['Resolved'] }).map((s) => s.name)).toEqual(['Resolved']);
    expect(allowedTransitions(ALL[2], ALL, rules).map((s) => s.name)).toEqual(['In Review', 'Resolved']);
  });

  it('falls back to "*" and then to every other status', () => {
    expect(allowedTransitions(ALL[5], ALL, rules).map((s) => s.name)).toEqual(['New']);
    expect(allowedTransitions(ALL[0], ALL).map((s) => s.name)).toEqual(['Assigned', 'In Progress', 'In Review', 'Resolved', 'Closed']);
    expect(allowedTransitions(undefined, ALL)).toHaveLength(6);
  });

  it('lets next statuses on the status document win over the map', () => {
    expect(allowedTransitions(ALL[2], ALL, rules, [{ documentId: 'closed' }]).map((s) => s.name)).toEqual(['Closed']);
  });
});

describe('needsResolution', () => {
  it('defaults to the done category and also accepts names', () => {
    expect(needsResolution({ name: 'Resolved' }, 'done')).toBe(true);
    expect(needsResolution({ name: 'In Review' }, 'inprogress')).toBe(false);
    expect(needsResolution({ name: 'Closed' }, 'done', ['Resolved'])).toBe(false);
    expect(needsResolution({ name: 'Rejected' }, 'todo', ['rejected'])).toBe(true);
  });
});

describe('cssColor', () => {
  it('accepts CSS colours and rejects junk', () => {
    expect(cssColor(' #3e63dd ')).toBe('#3e63dd');
    expect(cssColor('rgb(1 2 3)')).toBe('rgb(1 2 3)');
    expect(cssColor('')).toBeUndefined();
    expect(cssColor('not-a-colour')).toBeUndefined();
    expect(cssColor(42)).toBeUndefined();
  });
});

describe('lookup icons', () => {
  it.each([
    ['Bug', 'bug'],
    ['New Feature', 'feature'],
    ['Change Request', 'change'],
    ['Sub-task', 'subtask'],
    ['Epic', 'epic'],
    ['User Story', 'story'],
    ['Support', 'support'],
    ['Something else', 'generic'],
  ])('type %s → %s', (name, kind) => {
    expect(issueTypeKind(name)).toBe(kind);
  });

  it.each([
    ['Immediate', 'highest'],
    ['Block', 'highest'],
    ['High', 'high'],
    ['Major', 'high'],
    ['Normal', 'medium'],
    ['Minor', 'low'],
    ['Low', 'low'],
    ['Lowest', 'lowest'],
    ['Trivial', 'lowest'],
    ['Feature', 'none'],
  ])('priority/severity %s → %s', (name, level) => {
    expect(priorityLevel(name)).toBe(level);
  });

  it('guesses the icon set from SDMS field names', () => {
    expect(iconSetForField('typeRel')).toBe('type');
    expect(iconSetForField('priorityRel')).toBe('priority');
    expect(iconSetForField('severityRel')).toBe('priority');
    expect(iconSetForField('tagsRel')).toBe('none');
  });
});

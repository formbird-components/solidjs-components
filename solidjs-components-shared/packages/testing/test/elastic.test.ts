import { describe, expect, it } from 'vitest';
import { matches, pickSource, sortDocs } from '../src/elastic';
import { definitionFor, documents, statuses } from '../src/fixtures';
import { parseFilter } from '../../kit/src/host/query';

const names = (docs: Record<string, unknown>[]) => docs.map((d) => (d.systemHeader as { summaryName: string }).summaryName);

describe('mock Elasticsearch', () => {
  it('runs the SDMS status filter from the sample template: active statuses, indexNum order', () => {
    const request = parseFilter(definitionFor('statusRel').filter, {})!;
    const hits = sortDocs(documents.filter((d) => matches(d, request.query)), request.sort);
    expect(names(hits)).toEqual(names(statuses));
    expect(names(hits)).not.toContain('Retired');
  });

  it('supports should + minimum_should_match, terms, wildcard on .lcase and exists', () => {
    const doc = { systemHeader: { summaryName: 'In Review' }, appTags: ['sdms', 'status'], color: '#fff' };
    expect(matches(doc, { bool: { should: [{ term: { appTags: 'x' } }, { term: { appTags: 'sdms' } }], minimum_should_match: 1 } })).toBe(true);
    expect(matches(doc, { bool: { should: [{ term: { appTags: 'x' } }], minimum_should_match: 1 } })).toBe(false);
    expect(matches(doc, { terms: { appTags: ['a', 'status'] } })).toBe(true);
    expect(matches(doc, { wildcard: { 'systemHeader.summaryName.lcase': '*review*' } })).toBe(true);
    expect(matches(doc, { exists: { field: 'color' } })).toBe(true);
    expect(matches(doc, { exists: { field: 'nope' } })).toBe(false);
  });

  it('matches through arrays of related documents', () => {
    expect(matches({ projectRel: [{ documentId: 'a' }, { documentId: 'b' }] }, { term: { 'projectRel.documentId': 'b' } })).toBe(true);
  });

  it('filters _source like Elasticsearch', () => {
    const doc = { documentId: '1', systemHeader: { summaryName: 'A', templateId: 't' }, color: 'red', other: 1 };
    expect(pickSource(doc, ['documentId', 'systemHeader.summaryName', 'color'])).toEqual({
      documentId: '1',
      systemHeader: { summaryName: 'A' },
      color: 'red',
    });
  });
});

describe('mock Elasticsearch date math', () => {
  const now = new Date(2026, 10, 4, 15, 30).getTime();
  it('resolves now, offsets and rounding like Elasticsearch', async () => {
    const { dateMath } = await import('../src/elastic');
    expect(dateMath('now', now)).toBe(new Date(now).toISOString());
    expect(dateMath('now+14d', now)).toBe(new Date(now + 14 * 86_400_000).toISOString());
    expect(dateMath('now-1h', now)).toBe(new Date(now - 3_600_000).toISOString());
    expect(dateMath('now/d', now)).toBe(new Date(2026, 10, 4).toISOString());
    expect(dateMath('now+1d/d', now)).toBe(new Date(2026, 10, 5).toISOString());
  });

  it('applies date math in range queries', () => {
    const soon = { documentId: 'a', dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString() };
    const later = { documentId: 'b', dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString() };
    const query = { range: { dueDate: { lte: 'now+14d/d' } } };
    expect([soon, later].filter((d) => matches(d, query)).map((d) => d.documentId)).toEqual(['a']);
  });
});

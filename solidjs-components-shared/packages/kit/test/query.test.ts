import { describe, expect, it } from 'vitest';
import {
  documentName,
  extractHits,
  parseFilter,
  toRelatedDoc,
  toRelatedList,
  withRequiredClause,
  withTextSearch,
} from '../src/host/query';
import { renderTemplate } from '../src/host/template';
import { findByName, getPath, initials, jsonEqual } from '../src/host/util';

// The SDMS "New Item" status filter, verbatim.
const SDMS_STATUS_FILTER =
  "{'sort':[{'indexNum':'asc'},{'systemHeader.summaryName':'asc'}],'query':{'bool':{'filter':[{'term':{'systemHeader.systemType': 'document'}},{'term':{'appTags': 'status'}},{'term':{'appTags': 'sdms'}}],'must_not':[{'term':{'inactiveBool': true}}]}}}";

describe('parseFilter', () => {
  it('parses a template filter written with single quotes', () => {
    const request = parseFilter(SDMS_STATUS_FILTER, {});
    expect(request?.sort).toEqual([{ indexNum: 'asc' }, { 'systemHeader.summaryName': 'asc' }]);
    expect((request?.query as { bool: { filter: unknown[] } }).bool.filter).toHaveLength(3);
  });

  it('renders Handlebars against the document', () => {
    const request = parseFilter("{'query':{'term':{'projectRel.documentId':'{{document.projectRel.0.documentId}}'}}}", {
      document: { projectRel: [{ documentId: 'p-1' }] },
    });
    expect(request).toEqual({ query: { term: { 'projectRel.documentId': 'p-1' } } });
  });

  it('accepts an object (ruleset setFilter) and never returns the same instance', () => {
    const filter = { query: { match_all: {} } };
    const request = parseFilter(filter, {});
    expect(request).toEqual(filter);
    expect(request).not.toBe(filter);
  });

  it('returns undefined without a filter and throws on invalid JSON', () => {
    expect(parseFilter(undefined, {})).toBeUndefined();
    expect(parseFilter('', {})).toBeUndefined();
    expect(() => parseFilter('{query:', {})).toThrow(/Invalid filter JSON/);
  });
});

describe('withTextSearch / withRequiredClause', () => {
  it('adds one summaryName wildcard and replaces a previous one', () => {
    const request = withTextSearch(withTextSearch(parseFilter(SDMS_STATUS_FILTER, {})!, 'Prog'), 'Rev');
    const must = (request.query as { bool: { must: unknown[] } }).bool.must;
    expect(must).toEqual([{ wildcard: { 'systemHeader.summaryName.lcase': '*rev*' } }]);
  });

  it('leaves the request alone for blank text', () => {
    const request = parseFilter(SDMS_STATUS_FILTER, {})!;
    expect(withTextSearch(request, '   ')).toEqual(parseFilter(SDMS_STATUS_FILTER, {}));
  });

  it('wraps non-bool queries instead of changing their meaning', () => {
    const request = withRequiredClause({ query: { term: { a: 1 } } }, { term: { b: 2 } });
    expect(request.query).toEqual({ bool: { must: [{ term: { a: 1 } }], filter: [{ term: { b: 2 } }] } });
  });
});

describe('search results and stored values', () => {
  const hit = { documentId: 'x', systemHeader: { summaryName: 'High' }, indexNum: 30, projectRel: [] };

  it('extracts hits from every response shape the host returns', () => {
    expect(extractHits({ hits: { hits: [{ _source: hit }] } })).toEqual([hit]);
    expect(extractHits({ data: { hits: { hits: [{ _source: hit }] } } })).toEqual([hit]);
    expect(extractHits({ data: [hit] })).toEqual([hit]);
    expect(extractHits([hit])).toEqual([hit]);
    expect(extractHits(undefined)).toEqual([]);
  });

  it('stores { documentId, name, ...relatedFields } like sc-related-document', () => {
    expect(toRelatedDoc(hit, { indexNum: 'indexNum', projectRel: 'projectRel', missing: 'nope.path' })).toEqual({
      documentId: 'x',
      name: 'High',
      indexNum: 30,
      projectRel: [],
      missing: null,
    });
  });

  it('names documents by summary name, then name, then id', () => {
    expect(documentName({ documentId: '1', systemHeader: { summaryName: 'A' }, name: 'B' })).toBe('A');
    expect(documentName({ documentId: '1', name: 'B' })).toBe('B');
    expect(documentName({ documentId: '1' })).toBe('Document 1');
  });

  it('normalises field values to entries', () => {
    expect(toRelatedList([{ documentId: 'a', name: 'A' }, null, 'junk', { name: 'no id' }])).toEqual([{ documentId: 'a', name: 'A' }]);
    expect(toRelatedList(undefined)).toEqual([]);
  });
});

describe('util', () => {
  it('renders {{path}} without a global Handlebars', () => {
    expect(renderTemplate('Hi {{ account.name }} ({{doc.items.[1]}})', { account: { name: 'Sam' }, doc: { items: ['a', 'b'] } })).toBe('Hi Sam (b)');
  });

  it('compares JSON values structurally, ignoring undefined keys', () => {
    expect(jsonEqual([{ a: 1, b: undefined }], [{ a: 1 }])).toBe(true);
    expect(jsonEqual([{ a: 1 }], [{ a: 2 }])).toBe(false);
    expect(jsonEqual([], {})).toBe(false);
  });

  it('reads dot paths with array indexes', () => {
    expect(getPath({ a: [{ b: 'c' }] }, 'a.0.b')).toBe('c');
    expect(getPath({ a: null }, 'a.b')).toBeUndefined();
  });

  it('makes avatar initials', () => {
    expect(initials('Priya Natarajan')).toBe('PN');
    expect(initials('mei.chen@example.com')).toBe('MC');
    expect(initials('Sam')).toBe('SA');
    expect(initials('')).toBe('?');
  });

  it('finds definition entries by name, case-insensitively', () => {
    expect(findByName({ "Won't Fix": 1 }, "won't fix")).toBe(1);
    expect(findByName({ a: 1 }, 'b')).toBeUndefined();
  });
});

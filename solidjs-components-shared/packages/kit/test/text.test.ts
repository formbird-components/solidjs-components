import { describe, expect, it } from 'vitest';
import { formatDate, relativeTime, toDate } from '../src/host/format';
import { escapeHtml, renderMarkdown, safeUrl } from '../src/host/markdown';
import { extractTotal, searchClause } from '../src/host/query';
import { pathValues } from '../src/host/util';

describe('renderMarkdown', () => {
  it('renders the inline formatting people type in comments', () => {
    expect(renderMarkdown('**Fixed** in `2.4` and *verified*, ~~not~~ shipped')).toBe(
      '<p><strong>Fixed</strong> in <code>2.4</code> and <em>verified</em>, <del>not</del> shipped</p>',
    );
  });

  it('keeps line breaks inside a paragraph and splits paragraphs on blank lines', () => {
    expect(renderMarkdown('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>');
  });

  it('renders lists, quotes, headings, rules and fenced code', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(renderMarkdown('1. a\n2) b')).toBe('<ol><li>a</li><li>b</li></ol>');
    expect(renderMarkdown('> quoted **text**')).toBe('<blockquote><p>quoted <strong>text</strong></p></blockquote>');
    expect(renderMarkdown('# Title')).toBe('<h3>Title</h3>');
    expect(renderMarkdown('---')).toBe('<hr>');
    expect(renderMarkdown('```\n<b>x</b> **y**\n```')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt; **y**</code></pre>');
  });

  it('links safe URLs and bare https links, opening external ones in a new tab', () => {
    expect(renderMarkdown('[issue](/form/abc)')).toBe('<p><a href="/form/abc">issue</a></p>');
    expect(renderMarkdown('see https://example.com/x?a=1&b=2.')).toBe(
      '<p>see <a href="https://example.com/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">https://example.com/x?a=1&amp;b=2</a>.</p>',
    );
  });

  it('never passes HTML through', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('refuses script URLs, including ones hidden with control characters', () => {
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example']) {
      expect(renderMarkdown(`[x](${url})`)).not.toContain('<a');
    }
  });

  it('escapes quotes in link targets so they cannot add attributes', () => {
    expect(renderMarkdown('[x](https://a.example/"onmouseover="alert(1))')).toContain('href="https://a.example/&quot;onmouseover=&quot;alert');
  });

  it('leaves underscores inside words alone (CommonMark flanking rules)', () => {
    expect(renderMarkdown('call a__b__c and snake_case_name')).toBe('<p>call a__b__c and snake_case_name</p>');
    expect(renderMarkdown('window.__xss=1 and window.__xss=2')).toBe('<p>window.__xss=1 and window.__xss=2</p>');
    expect(renderMarkdown('__bold__ and _em_')).toBe('<p><strong>bold</strong> and <em>em</em></p>');
  });

  it('cannot forge its own placeholders', () => {
    expect(renderMarkdown('\u00000\u0000 `a`')).toBe('<p>0 <code>a</code></p>');
  });
});

describe('safeUrl and escapeHtml', () => {
  it('keeps http(s), mailto and relative URLs', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com');
    expect(safeUrl('mailto:a@example.com')).toBe('mailto:a@example.com');
    expect(safeUrl('form/abc')).toBe('form/abc');
    expect(safeUrl(' javascript:x')).toBeUndefined();
  });

  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('dates', () => {
  const now = new Date(2026, 10, 3, 15, 0, 0).getTime(); // 3 Nov 2026, 15:00 local

  it('reads ISO strings, epoch ms and Dates, and rejects junk', () => {
    expect(toDate('2026-11-03T10:00:00Z')?.toISOString()).toBe('2026-11-03T10:00:00.000Z');
    expect(toDate(0)?.getTime()).toBe(0);
    expect(toDate('not a date')).toBeUndefined();
    expect(toDate('')).toBeUndefined();
    expect(toDate(null)).toBeUndefined();
  });

  it('says how long ago, then falls back to the date', () => {
    const at = (h: number, m = 0) => new Date(now - h * 3_600_000 - m * 60_000);
    expect(relativeTime(at(0, 0), now)).toBe('just now');
    expect(relativeTime(at(0, 1), now)).toBe('1 minute ago');
    expect(relativeTime(at(0, 25), now)).toBe('25 minutes ago');
    expect(relativeTime(at(3), now)).toBe('3 hours ago');
    expect(relativeTime(new Date(2026, 10, 2, 9, 0), now)).toBe('yesterday');
    expect(relativeTime(new Date(2026, 9, 30, 9, 0), now)).toBe('4 days ago');
    expect(relativeTime(new Date(2026, 9, 1, 9, 0), now)).toBe(formatDate(new Date(2026, 9, 1, 9, 0), now));
    expect(relativeTime(undefined, now)).toBe('');
  });

  it('shows hours for anything under 12 hours, even across midnight', () => {
    const lateNight = new Date(2026, 10, 3, 1, 0).getTime();
    expect(relativeTime(new Date(2026, 10, 2, 23, 0), lateNight)).toBe('2 hours ago');
  });

  it('adds the year only for other years', () => {
    expect(formatDate(new Date(2026, 2, 12), now)).not.toMatch(/2026/);
    expect(formatDate(new Date(2025, 2, 12), now)).toMatch(/2025/);
  });
});

describe('pathValues', () => {
  const doc = {
    tagsRel: [{ name: 'ios' }, { name: 'ux' }, { other: 1 }],
    statusRel: [{ name: 'Done', indexNum: 40 }],
    nested: { list: [{ deep: [1, 2] }, { deep: [3] }] },
    empty: '',
  };

  it('reads through arrays at any level and flattens', () => {
    expect(pathValues(doc, 'tagsRel.name')).toEqual(['ios', 'ux']);
    expect(pathValues(doc, 'nested.list.deep')).toEqual([1, 2, 3]);
    expect(pathValues(doc, 'statusRel.0.indexNum')).toEqual([40]);
  });

  it('returns entries for a related field and nothing for missing or empty values', () => {
    expect(pathValues(doc, 'statusRel')).toEqual([{ name: 'Done', indexNum: 40 }]);
    expect(pathValues(doc, 'missing.path')).toEqual([]);
    expect(pathValues(doc, 'empty')).toEqual([]);
  });
});

describe('search box clause', () => {
  const template = "{'query_string':{'query':'*{{{search}}}*','fields':['summary'],'default_operator':'OR'}}";

  it('escapes query_string syntax so the text is searched literally', () => {
    expect(searchClause(template, 'C++ (draft)')).toEqual({
      query_string: { query: '*C\\+\\+ \\(draft\\)*', fields: ['summary'], default_operator: 'OR' },
    });
  });

  it('drops quotes and control characters, which would break the JSON', () => {
    expect(searchClause(template, `it's "quoted"\n`)).toEqual({
      query_string: { query: '*it s quoted*', fields: ['summary'], default_operator: 'OR' },
    });
  });

  it('returns nothing for blank text', () => {
    expect(searchClause(template, '   ')).toBeUndefined();
  });
});

describe('extractTotal', () => {
  it('reads the number fieldtec-web returns, and the ES7 object', () => {
    expect(extractTotal({ data: { hits: { total: 41, hits: [] } } })).toBe(41);
    expect(extractTotal({ hits: { total: { value: 7, relation: 'eq' } } })).toBe(7);
    expect(extractTotal({ data: [] })).toBeUndefined();
    expect(extractTotal(null)).toBeUndefined();
  });
});

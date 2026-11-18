/**
 * A small, safe Markdown renderer for user-written text (comments, descriptions).
 *
 * Supports what people type in issue comments: paragraphs with line breaks, **bold**, *italic*,
 * ~~strike~~, `code`, fenced code blocks, [links](url), bare https:// links, bullet and numbered
 * lists, > quotes, # headings and --- rules. Raw HTML is never passed through: all text is escaped,
 * and links only keep http(s), mailto and relative URLs, so stored text can't inject markup or
 * script into the page.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes text for use in HTML content and attribute values.
 * @param text - Raw text
 * @returns Escaped text
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * The URL a rendered link may point to, or undefined when it isn't allowed.
 * Control characters and whitespace are removed first: browsers ignore them inside URLs, so
 * `java\tscript:` would otherwise slip past a scheme check.
 * @param url - URL as written
 * @returns The cleaned URL, or undefined for other schemes (javascript:, data:, vbscript:...)
 */
export function safeUrl(url: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const cleaned = url.replace(/[\u0000- \u007f]/g, '');
  if (!cleaned || cleaned.startsWith('//')) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1]?.toLowerCase();
  if (scheme === undefined) return cleaned; // relative: /form/..., form/..., #anchor
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto' ? cleaned : undefined;
}

const anchor = (href: string, label: string) => {
  const external = /^https?:/i.test(href);
  return `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
};

/** Bold, strike and italic on text that is already escaped. */
function emphasis(html: string): string {
  return html
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    // Underscores never emphasise inside a word (CommonMark), so snake_case and __proto__ stay text.
    .replace(/(^|[^_\w])__(?=\S)([\s\S]*?\S)__(?![_\w])/g, '$1<strong>$2</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, '$1<em>$2</em>');
}

/** One line of inline Markdown to HTML. */
function inline(text: string): string {
  const slots: string[] = [];
  // Rendered pieces wait in numbered slots, so escaping and emphasis can't touch them.
  const hold = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;
  let out = text
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, _ticks: string, code: string) => hold(`<code>${escapeHtml(code.trim())}</code>`))
    .replace(/\[([^\]\n]+)\]\(([^()\s]+)(?:\s+"[^"\n]*")?\)/g, (match: string, label: string, url: string) => {
      const href = safeUrl(url);
      return href ? hold(anchor(href, emphasis(escapeHtml(label)))) : match;
    })
    .replace(/\bhttps?:\/\/[^\s<]*[^\s<.,:;"')\]!?*_~]/g, (url: string) => hold(anchor(url, escapeHtml(url))));
  out = emphasis(escapeHtml(out));
  return out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => slots[Number(index)] ?? '');
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;

/**
 * Renders Markdown to safe HTML.
 * @param source - Markdown text
 * @returns HTML containing only p, br, strong, em, del, code, pre, a, ul, ol, li, blockquote, h3–h6 and hr
 * @example
 * ```ts
 * renderMarkdown('**Fixed** in `2.4`'); // '<p><strong>Fixed</strong> in <code>2.4</code></p>'
 * ```
 */
export function renderMarkdown(source: string): string {
  // NUL is the slot marker above; it never belongs in text.
  // eslint-disable-next-line no-control-regex
  const lines = String(source ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const isBlockStart = (line: string) =>
    FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || BULLET.test(line) || NUMBERED.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) code.push(lines[i++]);
      i++; // closing fence (or end of text)
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1].length + 2); // # → h3: headings stay modest inside a field
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (RULE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(QUOTE.exec(lines[i++])![1]);
      out.push(`<blockquote>${renderMarkdown(quoted.join('\n'))}</blockquote>`);
      continue;
    }

    const listPattern = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : undefined;
    if (listPattern) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = listPattern.exec(lines[i]);
        if (item) {
          items.push(item[1]);
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          items[items.length - 1] += `\n${lines[i].trim()}`; // indented continuation
        } else {
          break;
        }
        i++;
      }
      const tag = listPattern === BULLET ? 'ul' : 'ol';
      out.push(`<${tag}>${items.map((item) => `<li>${item.split('\n').map(inline).join('<br>')}</li>`).join('')}</${tag}>`);
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !(paragraph.length && isBlockStart(lines[i]))) paragraph.push(lines[i++]);
    out.push(`<p>${paragraph.map((text) => inline(text.trim())).join('<br>')}</p>`);
  }
  return out.join('');
}

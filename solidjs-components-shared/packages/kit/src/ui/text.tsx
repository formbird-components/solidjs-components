import { createMemo } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { formatDateTime, relativeTime, toDate } from '../host/format';
import { renderMarkdown } from '../host/markdown';
import { openDocument } from '../host/session';

/**
 * "3 hours ago", with the exact date and time as its tooltip.
 * @param props - The stored date (ISO string, epoch ms or Date)
 */
export function RelativeTime(props: { value: unknown; class?: JSX.ClassValue }) {
  const date = createMemo(() => toDate(props.value));
  return (
    <time class={props.class} datetime={date()?.toISOString()} title={formatDateTime(date())}>
      {relativeTime(date())}
    </time>
  );
}

/**
 * Click handler that opens links to `/form/<id>` (absolute or relative, like sc-datatables'
 * `form/{{{documentId}}}`) through the app's router instead of reloading the page. Put it on a
 * container; modified clicks (new tab) and other links keep the browser's behaviour.
 * @param event - Click event
 */
export function followDocumentLink(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
  if (!link || (link.target && link.target !== '_self') || !link.href) return;
  let url: URL;
  try {
    url = new URL(link.href); // resolved against the page's <base>
  } catch {
    return;
  }
  const match = /^\/form\/([^/?#]+)\/?$/.exec(url.pathname);
  if (url.origin !== globalThis.location?.origin || !match || url.search || url.hash) return;
  event.preventDefault();
  openDocument(decodeURIComponent(match[1]));
}

/**
 * User-written Markdown, rendered safely (see renderMarkdown: no raw HTML, safe links only).
 * @param props - The text and an extra class
 */
export function Markdown(props: { text: string; class?: JSX.ClassValue }) {
  return <div class={['sj-markdown', props.class]} innerHTML={renderMarkdown(props.text ?? '')} onClick={followDocumentLink} />;
}

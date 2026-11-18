import { documentName, toRelatedDoc } from './query';
import { getService } from './services';
import type { RelatedDoc, SourceDocument } from './types';
import { uid } from './util';

/** Who wrote something, as Formbird stores authorship inside documents (`createdBy` of a note). */
export interface UserRef {
  documentId: string;
  name: string;
}

/**
 * The signed-in user as an authorship value, named the way the host's toolbar names them.
 * @returns `{ documentId, name }`, or undefined when nobody is signed in
 */
export function currentUser(): UserRef | undefined {
  const user = getService('LoggedInUserService')?.user;
  const account = user?.account as SourceDocument | null | undefined;
  if (!account?.documentId) return undefined;
  return { documentId: String(account.documentId), name: user?.welcomeMsg || documentName(account) };
}

/**
 * A new id for an entry stored inside a document (a note's `dataId`), from the host's generator
 * so entries look the same whichever component created them.
 * @returns A unique id
 */
export function nextEntryId(): string {
  const id = getService('OfflineUtilService')?.getNextId?.();
  return typeof id === 'string' && id ? id : uid('entry');
}

/**
 * Whether the signed-in user holds one of these access keys with a right (`Update`, `Delete`...),
 * as sc-note-comment checks `allowNoteEditingKeys`.
 * @param keyIds - Access key ids from a component definition
 * @param right - Right that key must grant
 * @returns True when one of the user's access keys matches
 */
export function hasAccessKey(keyIds: unknown, right: string): boolean {
  if (!Array.isArray(keyIds) || !keyIds.length) return false;
  const control = getService('LoggedInUserService')?.user?.accountControlDocument;
  return (control?.accessKeys ?? []).some((key) => !!key.keyId && keyIds.includes(key.keyId) && (key.rights ?? []).includes(right));
}

/**
 * Saves text as a file through the browser (CSV export and similar).
 * @param fileName - Suggested file name
 * @param text - File content
 * @param type - MIME type
 */
export function downloadText(fileName: string, text: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The signed-in user's account as a related-document entry, ready to store in a user field.
 * @param relatedFields - The field's relatedFields mapping, so "Assign to me" stores the same shape as a pick
 * @returns The entry, or undefined when nobody is signed in
 */
export function currentAccount(relatedFields?: Record<string, string>): RelatedDoc | undefined {
  const account = getService('LoggedInUserService')?.user?.account as SourceDocument | null | undefined;
  if (!account?.documentId) return undefined;
  return toRelatedDoc(account, relatedFields);
}

/** URL path of a document in fieldtec-web (`/form/:id` route). */
export function documentPath(documentId: string): string {
  return `/form/${documentId}`;
}

/** Absolute URL of a document, for copy-link actions. */
export function documentUrl(documentId: string): string {
  const origin = globalThis.location?.origin ?? '';
  return `${origin}${documentPath(documentId)}`;
}

export type OpenMode = 'route' | 'modal' | 'newTab';

/**
 * Opens a document the way fieldtec-web does: in-app navigation, a modal form, or a new tab.
 * @param documentId - Document (or template id, to start a new document from it)
 * @param mode - Where to open it
 */
export function openDocument(documentId: string, mode: OpenMode = 'route'): void {
  if (mode === 'modal') {
    const modal = getService('DocumentModalService');
    if (modal?.openDocumentInModal) {
      void modal.openDocumentInModal(documentId);
      return;
    }
  }
  if (mode === 'newTab') {
    globalThis.open?.(documentUrl(documentId), '_blank', 'noopener');
    return;
  }
  const router = getService('RouterService');
  if (router?.navigateByUrl) router.navigateByUrl(documentPath(documentId));
  else globalThis.location?.assign(documentPath(documentId));
}

/**
 * Starts a new document from a template with some fields already filled, the way the ruleset
 * function `ft3.openNewDocument` does: the values go to fieldtec-web's local storage under
 * `initialData:<templateId>`, where the new form picks them up, then the form opens.
 * @param templateId - Template of the new document
 * @param values - Field values, e.g. `{ assetRel: [{ documentId, name }], startDate: "2026-11-04T09:00:00.000Z" }`
 * @param mode - In-app navigation (default) or a new tab
 * @example
 * ```ts
 * openNewDocument(BOOKING_TEMPLATE, { assetRel: [asset], startDate, endDate });
 * ```
 */
export function openNewDocument(templateId: string, values: Record<string, unknown>, mode: 'route' | 'newTab' = 'route'): void {
  const storage = getService('LocalStorageService');
  const key = `initialData:${templateId}`;
  if (storage?.setItem) storage.setItem(key, JSON.stringify(values));
  else globalThis.localStorage?.setItem(key, JSON.stringify(values));
  openDocument(templateId, mode);
}

/**
 * Shows a toast through the host's NotificationService (falls back to the console).
 * @param kind - success, info or error
 * @param message - Text to show
 */
export function notify(kind: 'success' | 'info' | 'error', message: string): void {
  const service = getService('NotificationService');
  const show = service?.[kind];
  if (show) show.call(service, message);
  else (kind === 'error' ? console.error : console.info)(`[solidjs-components] ${message}`);
}

/**
 * Copies text to the clipboard, with a fallback for pages without the async Clipboard API.
 * @param text - Text to copy
 * @returns True when the copy succeeded
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: fall through to the legacy path.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

// Creating records from an element (a corrective action from its incident, say) and uploading
// files, through the same fieldtec-web services the app's own forms use. The server runs its rules
// on both, so a refused save comes back as an error with the rule's message.

import { getService } from './services';
import type { SourceDocument } from './types';
import { cloneJson } from './util';

/** A file stored with fieldtec-web, as fields that hold files keep it. */
export interface StoredFile {
  fileNo: string;
  fileName: string;
  fileType?: string;
  basePath?: string;
}

/**
 * The message in an error from fieldtec-web's HTTP services: the response body's text or
 * `message`, else the error's own message.
 * @param error - What the service threw or emitted
 * @param fallback - Text when there is nothing better
 * @returns A message for people
 */
export function errorText(error: unknown, fallback: string): string {
  const e = error as { error?: unknown; message?: unknown } | null | undefined;
  const body = e?.error;
  if (typeof body === 'string' && body.trim()) return body.trim();
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown; error?: unknown }).message ?? (body as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

/** A new document id, in the format fieldtec-web generates (a UUID). */
export function newDocumentId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/**
 * Saves a new document with the given template and values. The server runs the template's rules
 * and fills in the header (created date and by, keys); a refused save rejects with their message.
 * Search won't find the new document until Elasticsearch refreshes (about a second), so show the
 * returned document straight away rather than searching for it.
 * @param templateId - Template of the new document
 * @param values - Field values
 * @returns The saved document
 */
export async function createDocument(templateId: string, values: Record<string, unknown>): Promise<SourceDocument> {
  const data = getService('DataService');
  if (!data?.insert) throw new Error('This page cannot create records.');
  const bean: Record<string, unknown> = {
    ...cloneJson(values),
    documentId: newDocumentId(),
    systemHeader: { systemType: 'document', templateId },
  };
  try {
    const saved = await data.insert(bean);
    return (saved && typeof saved === 'object' && (saved as SourceDocument).documentId ? saved : bean) as SourceDocument;
  } catch (error) {
    throw new Error(errorText(error, 'The record could not be saved.'));
  }
}

/**
 * Uploads a file for a document. fieldtec-web stores it and creates the file reference document
 * that lets `api/getFile/<fileNo>` serve it to anyone who can see that document.
 * @param file - The file
 * @param owner - The document it belongs to (may be new and unsaved)
 * @returns How to store it in a field
 */
export function uploadFile(file: File, owner: { documentId?: string; documentName?: string } = {}): Promise<StoredFile> {
  const service = getService('FileProviderService');
  if (!service?.uploadFile) return Promise.reject(new Error('This page cannot upload files.'));
  const fileNo = newDocumentId();
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(new Error(errorText(error, `${file.name} could not be uploaded.`)));
    };
    try {
      service
        .uploadFile!({ fileNo, file, documentId: owner.documentId, documentName: owner.documentName })
        .subscribe({
          next(event) {
            // Online: the HTTP response ({ body }); offline: { data } once the file is queued.
            const e = event as { body?: Record<string, unknown>; data?: Record<string, unknown> } | null;
            const body = e?.body ?? e?.data;
            if (settled || !body || typeof body.fileNo !== 'string') return;
            settled = true;
            resolve({
              fileNo: body.fileNo,
              fileName: file.name,
              fileType: typeof body.fileType === 'string' ? body.fileType : undefined,
              basePath: typeof body.basePath === 'string' ? body.basePath : undefined,
            });
          },
          error: fail,
          complete() {
            fail(new Error(`${file.name} could not be uploaded: the server sent no file number.`));
          },
        });
    } catch (error) {
      fail(error);
    }
  });
}

/**
 * Where to show a stored file from: fieldtec-web's cached copy when it has one (offline), else
 * `api/getFile/<fileNo>`.
 * @param file - The stored file
 * @returns A URL for an `<img>` or a link
 */
export async function fileSource(file: Pick<StoredFile, 'fileNo' | 'fileName'>): Promise<string> {
  const fallback = fileUrl(file.fileNo);
  const service = getService('FileProviderService');
  if (!service?.getFileResources) return fallback;
  try {
    const resources = await service.getFileResources({ fileNo: file.fileNo, fileName: file.fileName });
    if (resources?.base64strData) return resources.base64strData;
    return resources?.url || fallback;
  } catch {
    return fallback;
  }
}

/**
 * The server URL of a stored file, relative to the app (fieldtec-web's `api/getFile` route).
 * @param fileNo - The file's number
 * @returns The URL
 */
export const fileUrl = (fileNo: string): string => `api/getFile/${encodeURIComponent(fileNo)}`;

// Photos and files as the field stores them, and the rules around them: reading the stored value
// (this element's entries and fieldtec-web's own file records), telling images from other files,
// what an upload may be, the size a photo is scaled to, and the count in the header. No DOM here.

/** Who took a photo, as an account reference. */
export interface PersonRef {
  documentId: string;
  name: string;
}

/**
 * A stored file: fieldtec-web's file record (`fileNo`, `fileName`, `fileType`, `basePath`, and on
 * file reference documents `mimeDetailsObj`) plus what this element adds.
 */
export interface PhotoEntry {
  fileNo: string;
  fileName: string;
  fileType?: string;
  basePath?: string;
  caption?: string;
  takenDate?: string;
  takenByRel?: PersonRef[];
  width?: number;
  height?: number;
  mimeDetailsObj?: { contentType?: string };
  [field: string]: unknown;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'heic', 'heif', 'tif', 'tiff', 'ico']);

/**
 * The stored value as a list: an array of entries, or fieldtec-web's single file record. Entries
 * this element can't show are kept, so writing the list back never drops what others stored.
 * @param raw - The field's value
 * @returns The entries (objects only)
 */
export function toEntries(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry));
  if (raw && typeof raw === 'object') return [raw as Record<string, unknown>];
  return [];
}

/** Whether an entry is a stored file this element can show. */
export const isStoredFile = (entry: Record<string, unknown>): entry is PhotoEntry => typeof entry.fileNo === 'string' && !!entry.fileNo;

/**
 * A file name's extension, lower case, without the dot.
 * @param name - File name
 * @returns The extension, or "" when there is none
 */
export function extensionOf(name: unknown): string {
  const match = /\.([a-z0-9]+)$/i.exec(String(name ?? '').trim());
  return match ? match[1].toLowerCase() : '';
}

/**
 * Whether a stored file is an image: from its MIME type when the record has one, else from
 * `fileType` (fieldtec-web stores the extension there) or the file name.
 * @param entry - A stored file
 * @returns True for images
 */
export function isImageEntry(entry: PhotoEntry): boolean {
  const contentType = entry.mimeDetailsObj?.contentType;
  if (typeof contentType === 'string' && contentType.includes('/')) return contentType.toLowerCase().startsWith('image/');
  const fileType = typeof entry.fileType === 'string' ? entry.fileType.toLowerCase().replace(/^\./, '') : '';
  if (fileType.includes('/')) return fileType.startsWith('image/');
  if (fileType) return IMAGE_EXTENSIONS.has(fileType);
  return IMAGE_EXTENSIONS.has(extensionOf(entry.fileName));
}

/**
 * Whether a file matches an `accept` list (as `<input accept>` reads it: `image/*`, `.pdf`,
 * `application/pdf`). Dropped files skip the browser's own check, so the element checks them.
 * @param accept - The accept list; empty or `*` takes anything
 * @param file - Name and MIME type (the type can be empty)
 * @returns True when the file is accepted
 */
export function acceptsFile(accept: string, file: { name: string; type: string }): boolean {
  const tokens = accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length || tokens.some((token) => token === '*' || token === '*/*')) return true;
  const type = (file.type || '').toLowerCase();
  const extension = extensionOf(file.name);
  return tokens.some((token) => {
    if (token.startsWith('.')) return extension === token.slice(1);
    if (token.endsWith('/*')) {
      const family = token.slice(0, -1);
      if (type) return type.startsWith(family);
      return family === 'image/' && IMAGE_EXTENSIONS.has(extension);
    }
    return type === token;
  });
}

/**
 * The size a photo is uploaded at: its own when it fits within `max` × `max`, else scaled down to
 * fit, keeping its shape.
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @param max - Longest side allowed (0 or less: no limit)
 * @returns The size, and whether it changed
 */
export function scaledSize(width: number, height: number, max: number): { width: number; height: number; scaled: boolean } {
  if (!(max > 0) || !(width > 0) || !(height > 0) || (width <= max && height <= max)) return { width, height, scaled: false };
  const ratio = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), scaled: true };
}

/**
 * Whether the element re-encodes an image of this type when it is too big. GIFs (often animated),
 * SVG (vector) and types browsers can't decode (HEIC, TIFF) go up as they are.
 * @param type - MIME type
 * @returns True for JPEG, PNG, WebP and BMP
 */
export const canDownscale = (type: string): boolean => /^image\/(jpeg|png|webp|bmp)$/i.test(type);

/**
 * A file name with another extension: "IMG_0042.PNG" → "IMG_0042.jpg".
 * @param name - File name
 * @param extension - New extension, without the dot
 * @returns The new name
 */
export function withExtension(name: string, extension: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '') || 'photo';
  return `${base}.${extension}`;
}

/**
 * The header's count: "No photos yet", "1 photo", "4 photos", "3 photos · 1 file".
 * @param entries - Stored files
 * @returns The text
 */
export function countText(entries: readonly PhotoEntry[]): string {
  const images = entries.filter(isImageEntry).length;
  const files = entries.length - images;
  const parts = [images ? `${images} photo${images === 1 ? '' : 's'}` : '', files ? `${files} file${files === 1 ? '' : 's'}` : ''].filter(Boolean);
  return parts.join(' · ') || 'No photos yet';
}

/**
 * A new entry for an uploaded file, without empty fields.
 * @param stored - What the upload returned
 * @param extra - Size, when it was taken and by whom
 * @returns The entry to append
 */
export function newEntry(
  stored: { fileNo: string; fileName: string; fileType?: string; basePath?: string },
  extra: { takenDate: string; takenBy?: PersonRef; width?: number; height?: number },
): PhotoEntry {
  const entry: PhotoEntry = { fileNo: stored.fileNo, fileName: stored.fileName };
  if (stored.fileType) entry.fileType = stored.fileType;
  if (stored.basePath) entry.basePath = stored.basePath;
  entry.takenDate = extra.takenDate;
  if (extra.takenBy) entry.takenByRel = [{ documentId: extra.takenBy.documentId, name: extra.takenBy.name }];
  if (extra.width && extra.height) {
    entry.width = extra.width;
    entry.height = extra.height;
  }
  return entry;
}

/**
 * The list with one file's entry changed (the first with that file number); other entries, and
 * fields this element doesn't know, stay as they are.
 * @param list - Stored entries
 * @param fileNo - The file
 * @param patch - Fields to set; an empty caption is removed
 * @returns The new list, or the same list when nothing changed
 */
export function patchEntry(list: readonly Record<string, unknown>[], fileNo: string, patch: { caption?: string }): Record<string, unknown>[] {
  const index = list.findIndex((entry) => entry.fileNo === fileNo);
  if (index < 0) return [...list];
  const next = { ...list[index] };
  const caption = patch.caption?.trim();
  if (caption) next.caption = caption;
  else delete next.caption;
  if ((next.caption ?? '') === (list[index].caption ?? '')) return [...list];
  return list.map((entry, i) => (i === index ? next : entry));
}

/**
 * The list without one file's entry (the first with that file number).
 * @param list - Stored entries
 * @param fileNo - The file
 * @returns The new list
 */
export function removeEntry(list: readonly Record<string, unknown>[], fileNo: string): Record<string, unknown>[] {
  const index = list.findIndex((entry) => entry.fileNo === fileNo);
  return index < 0 ? [...list] : list.filter((_, i) => i !== index);
}

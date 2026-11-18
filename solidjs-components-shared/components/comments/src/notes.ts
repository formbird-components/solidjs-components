/**
 * The data sc-note-comment stores in a notes field (SDMS: `notesCommentsArr`), and the changes
 * <solid-comments> makes to it. Every function returns a new array, leaving its input untouched,
 * and keeps fields it doesn't know about, so documents stay readable by sc-note-comment.
 */

/** Who wrote or changed something: `{ documentId, name }` of their account. */
export interface Author {
  documentId: string;
  name: string;
}

/** A reply under a note (sc-note-comment calls them comments). */
export interface Reply {
  dataId: string;
  detail: string;
  createdBy: Author;
  createdDate: string;
  [field: string]: unknown;
}

export interface Vote {
  dataId: string;
  /** 1 or -1 */
  vote: number;
  createdBy: Author;
  createdDate: string;
}

/** A top-level note. */
export interface Note extends Reply {
  modifiedDate?: string;
  /** Who made the last edit. sc-note-comment overwrites `createdBy` instead; this keeps the author. */
  modifiedBy?: Author;
  /** Earlier versions, newest first. */
  notesHistory?: (Reply & { modifiedDate?: string })[];
  comments?: Reply[];
  votes?: Vote[];
  thumbsUp?: number;
  thumbsDown?: number;
}

export type Order = 'newest' | 'oldest';

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Reads a notes field. Anything that isn't a note object is dropped.
 * @param raw - The stored field value
 * @returns The notes, as stored
 */
export function toNotes(raw: unknown): Note[] {
  return Array.isArray(raw) ? (raw.filter((note) => isObject(note) && (typeof note.detail === 'string' || typeof note.dataId === 'string')) as Note[]) : [];
}

const time = (value: string | undefined) => {
  const t = value ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Notes in display order (by creation date).
 * @param notes - Notes as stored
 * @param order - Newest or oldest first
 * @returns A sorted copy (the stored order is kept for ties)
 */
export function sortNotes(notes: Note[], order: Order): Note[] {
  const sign = order === 'newest' ? -1 : 1;
  return notes.map((note, index) => ({ note, index })).sort((a, b) => sign * (time(a.note.createdDate) - time(b.note.createdDate)) || a.index - b.index).map(({ note }) => note);
}

/**
 * Adds a note at the end of the stored list, as sc-note-comment does.
 * @param notes - Current notes
 * @param detail - Text
 * @param author - Signed-in user
 * @param dataId - New id
 * @param now - ISO timestamp
 * @returns The new list
 */
export function addNote(notes: Note[], detail: string, author: Author, dataId: string, now: string): Note[] {
  return [...copy(notes), { dataId, detail, createdBy: { ...author }, createdDate: now }];
}

/**
 * Adds a reply under a note.
 * @param notes - Current notes
 * @param noteId - dataId of the note replied to
 * @param detail - Text
 * @param author - Signed-in user
 * @param dataId - New id
 * @param now - ISO timestamp
 * @returns The new list (unchanged when the note isn't found)
 */
export function addReply(notes: Note[], noteId: string, detail: string, author: Author, dataId: string, now: string): Note[] {
  const next = copy(notes);
  const note = next.find((n) => n.dataId === noteId);
  if (!note) return next;
  note.comments = [...(note.comments ?? []), { dataId, detail, createdBy: { ...author }, createdDate: now }];
  return next;
}

/**
 * Changes a note's text, keeping the previous version in `notesHistory` (newest first).
 * @param notes - Current notes
 * @param noteId - dataId of the note
 * @param detail - New text
 * @param editor - Signed-in user
 * @param now - ISO timestamp
 * @returns The new list (unchanged when the note isn't found or the text is the same)
 */
export function editNote(notes: Note[], noteId: string, detail: string, editor: Author, now: string): Note[] {
  const next = copy(notes);
  const note = next.find((n) => n.dataId === noteId);
  if (!note || note.detail === detail) return next;
  const previous = {
    dataId: note.dataId,
    detail: note.detail,
    createdBy: note.modifiedBy ? { ...note.modifiedBy } : { ...note.createdBy },
    createdDate: note.createdDate,
    modifiedDate: note.modifiedDate ?? note.createdDate,
  };
  note.notesHistory = [previous, ...(note.notesHistory ?? [])];
  note.detail = detail;
  note.modifiedDate = now;
  note.modifiedBy = { ...editor };
  return next;
}

/**
 * Votes on a note: sets the user's vote, or removes it when they click the same one again.
 * Keeps sc-note-comment's `thumbsUp` / `thumbsDown` counts in step.
 * @param notes - Current notes
 * @param noteId - dataId of the note
 * @param voter - Signed-in user
 * @param direction - 1 (up) or -1 (down)
 * @param dataId - Id for a new vote entry
 * @param now - ISO timestamp
 * @returns The new list
 */
export function voteNote(notes: Note[], noteId: string, voter: Author, direction: 1 | -1, dataId: string, now: string): Note[] {
  const next = copy(notes);
  const note = next.find((n) => n.dataId === noteId);
  if (!note) return next;
  const votes = note.votes ?? [];
  const mine = votes.find((v) => v.createdBy?.documentId === voter.documentId);
  if (mine && mine.vote === direction) note.votes = votes.filter((v) => v !== mine);
  else if (mine) mine.vote = direction;
  else note.votes = [...votes, { dataId, vote: direction, createdBy: { ...voter }, createdDate: now }];
  note.thumbsUp = countVotes(note, 1);
  note.thumbsDown = countVotes(note, -1);
  return next;
}

/**
 * Votes in one direction on a note.
 * @param note - The note
 * @param direction - 1 or -1
 * @returns The count
 */
export function countVotes(note: Note, direction: 1 | -1): number {
  return (note.votes ?? []).filter((v) => v.vote === direction).length;
}

/**
 * The user's own vote on a note.
 * @param note - The note
 * @param userId - Account documentId
 * @returns 1, -1, or 0 when they haven't voted
 */
export function voteOf(note: Note, userId: string | undefined): number {
  return (userId && note.votes?.find((v) => v.createdBy?.documentId === userId)?.vote) || 0;
}

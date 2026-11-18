import { describe, expect, it } from 'vitest';
import { addNote, addReply, countVotes, editNote, sortNotes, toNotes, voteNote, voteOf, type Note } from '../src/notes';

const priya = { documentId: 'account-priya', name: 'Priya Natarajan' };
const alex = { documentId: 'account-alex', name: 'Alex Morgan' };

/** What sc-note-comment stores, including a field this component doesn't know. */
const stored = (): Note[] => [
  { dataId: 'n1', detail: 'First', createdBy: priya, createdDate: '2026-11-01T09:00:00.000Z', pinned: true },
  { dataId: 'n2', detail: 'Second', createdBy: alex, createdDate: '2026-11-02T09:00:00.000Z' },
];

describe('notes field', () => {
  it('reads only note objects', () => {
    expect(toNotes([...stored(), null, 'x', 3, { other: true }])).toHaveLength(2);
    expect(toNotes(undefined)).toEqual([]);
    expect(toNotes({ dataId: 'n1' })).toEqual([]);
  });

  it('sorts by creation date either way without touching the stored order', () => {
    const notes = stored();
    expect(sortNotes(notes, 'newest').map((n) => n.dataId)).toEqual(['n2', 'n1']);
    expect(sortNotes(notes, 'oldest').map((n) => n.dataId)).toEqual(['n1', 'n2']);
    expect(notes.map((n) => n.dataId)).toEqual(['n1', 'n2']);
  });

  it('appends a note the way sc-note-comment does, without changing the input', () => {
    const notes = stored();
    const next = addNote(notes, 'Third', alex, 'n3', '2026-11-03T09:00:00.000Z');
    expect(next.at(-1)).toEqual({ dataId: 'n3', detail: 'Third', createdBy: alex, createdDate: '2026-11-03T09:00:00.000Z' });
    expect(notes).toHaveLength(2);
    expect(next[0].pinned).toBe(true); // unknown fields survive
  });

  it('adds replies under the right note', () => {
    const next = addReply(stored(), 'n1', 'Agreed', alex, 'r1', '2026-11-03T10:00:00.000Z');
    expect(next[0].comments).toEqual([{ dataId: 'r1', detail: 'Agreed', createdBy: alex, createdDate: '2026-11-03T10:00:00.000Z' }]);
    expect(addReply(stored(), 'nope', 'x', alex, 'r2', 'now')).toEqual(stored());
  });

  it('keeps the previous text in notesHistory and the author in createdBy on edit', () => {
    const once = editNote(stored(), 'n2', 'Second, edited', alex, '2026-11-03T11:00:00.000Z');
    const twice = editNote(once, 'n2', 'Second, edited again', priya, '2026-11-03T12:00:00.000Z');
    const note = twice[1];
    expect(note.detail).toBe('Second, edited again');
    expect(note.createdBy).toEqual(alex);
    expect(note.modifiedBy).toEqual(priya);
    expect(note.modifiedDate).toBe('2026-11-03T12:00:00.000Z');
    expect(note.notesHistory?.map((h) => [h.detail, h.createdBy.name, h.modifiedDate])).toEqual([
      ['Second, edited', 'Alex Morgan', '2026-11-03T11:00:00.000Z'],
      ['Second', 'Alex Morgan', '2026-11-02T09:00:00.000Z'],
    ]);
  });

  it('does not record an edit that changes nothing', () => {
    expect(editNote(stored(), 'n1', 'First', alex, 'now')[0].notesHistory).toBeUndefined();
  });

  it('toggles votes and keeps the thumbs counts in step', () => {
    let notes = voteNote(stored(), 'n1', alex, 1, 'v1', 'now');
    expect([countVotes(notes[0], 1), notes[0].thumbsUp, notes[0].thumbsDown, voteOf(notes[0], alex.documentId)]).toEqual([1, 1, 0, 1]);
    notes = voteNote(notes, 'n1', alex, -1, 'v2', 'now');
    expect([notes[0].thumbsUp, notes[0].thumbsDown, notes[0].votes?.length]).toEqual([0, 1, 1]);
    notes = voteNote(notes, 'n1', alex, -1, 'v3', 'now');
    expect([notes[0].thumbsUp, notes[0].thumbsDown, notes[0].votes?.length, voteOf(notes[0], alex.documentId)]).toEqual([0, 0, 0, 0]);
  });
});

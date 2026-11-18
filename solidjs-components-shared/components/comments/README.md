# `<solid-comments>`

A document's comment thread: Markdown, replies, edits and thumbs up / down. It stores the same data
as `sc-note-comment` (SDMS: `notesCommentsArr`), so either component can show the other's comments.

| Option | Default | |
|---|---|---|
| `textEditor` | `"markdown"` | `"markdown"` renders Markdown; any other value shows the text as typed. |
| `disableCommentFunction` | `false` | No replies. |
| `disableVoteFunction` | `false` | No thumbs up / down. |
| `allowNoteEditingKeys` | none | Holders of these access keys with the Update right can edit anyone's comment. Everyone else edits only their own. |
| `order` | `"newest"` | Initial order; the header switches it. |
| `placeholder` | `"Add a comment…"` | |
| `hideLabel` | `false` | |

**Saving.** As with sc-note-comment, comments belong to the document. Adding, replying, editing or
voting changes the field, and fieldtec-web saves it with the rest of the document. Each change shows
**Not saved yet** until then; the mark clears when fieldtec-web broadcasts `document:updated` after
saving. `Ctrl`/`⌘`+`Enter` sends and `Esc` cancels.

**Stored data**, in sc-note-comment's shape:

```json
{
  "dataId": "…",
  "detail": "Markdown text",
  "createdBy": { "documentId": "<account>", "name": "Priya Natarajan" },
  "createdDate": "2026-11-03T09:00:00.000Z",
  "comments": [{ "dataId": "…", "detail": "A reply", "createdBy": {}, "createdDate": "…" }],
  "votes": [{ "dataId": "…", "vote": 1, "createdBy": {}, "createdDate": "…" }],
  "thumbsUp": 1,
  "thumbsDown": 0,
  "modifiedDate": "…",
  "notesHistory": [{ "detail": "Earlier text", "createdBy": {}, "createdDate": "…", "modifiedDate": "…" }]
}
```

Ids come from fieldtec-web's `OfflineUtilService.getNextId()`, as sc-note-comment's do. It behaves
differently in two ways:
- An edit keeps the author in `createdBy` and records the editor in `modifiedBy`, where sc-note-comment
  overwrites `createdBy`.
- Clicking your own vote again removes it.

**Markdown** goes through the kit's renderer: bold, italic, strike-through, code, code blocks, links,
lists, quotes and headings. HTML in a comment is shown as text, and links keep only http(s), mailto
and relative URLs, so a comment can't run script. Links to `/form/<id>` open inside the app.

Not supported yet: @mentions (sc-note-comment's `mention…` options) and links from issue keys.

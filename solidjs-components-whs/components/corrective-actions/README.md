# `<solid-corrective-actions>`

The corrective actions raised against a record (an incident, a hazard or an inspection), listed live,
with a quick form to raise one. Actions are records of their own. The element finds them by search
and creates them through fieldtec-web's `DataService`, so it stores nothing in its own field
(definitions set `disableSave: true`).

**Header.** A progress bar reading "2 of 3 done". Cancelled actions aren't counted, and done means
Completed or Verified. Next to it, an overdue badge ("1 overdue"), and the strongest control in place
("Strongest control in place: Engineering": the most effective level among actions that are Completed or Verified, or "none yet"). These come from `actionsSummary` in whs-kit.

**Each action** is one row:
- its control level, as six bars (as many lit as the control is strong: Eliminate all six, PPE one)
  with the level's name;
- its reference and title, a link that opens it;
- the owner's avatar and name;
- the due date, with "Due in 5 days", "Overdue · yesterday" (red, with a red edge on the row),
  "Due tomorrow" (amber within 3 days) or "Done 3 Nov" (muted), from `actionState`;
- its status as a lozenge in the status colour.

Outstanding actions come first, then done ones, then cancelled ones, each by due date. Cancelled
actions are hidden behind **Show N cancelled**. With no actions, a hint explains the hierarchy of
controls.

| Option | Default | |
|---|---|---|
| `templateId` | required to add | Template of new actions. Without it there is no **Add action**. |
| `sourceKind` | `"record"` | `"incident"`, `"hazard"` or `"inspection"`: stored in `sourceRel.kind`, and used in texts ("Save the incident first…"). |
| `refField` | none | Field of this record with its reference (`"incidentRef"`), stored in `sourceRel.ref`. |
| `ratingField` | none | Field, or list of fields, with the record's rating; the first with a rating wins (`["residualRating", "inherentRating"]`). A rating name, a risk value `{ rating }` or a related value `[{ name }]` all work. It sets the default due date and is stored in `sourceRel.riskRating`. Followed live. |
| `filter` | this record's actions | Elasticsearch request for the actions (Handlebars allowed, e.g. `{{document.documentId}}`). Default: `appTags` `whs` and `action` with `sourceRel.documentId` = this record, sorted by `dueDate` inside the request. |
| `statusValues` | none | Action status values by name, `{ "Open": { "documentId", "name", "color", "statusCategory", "indexNum" }, … }`. A new action gets `[statusValues.Open]` (name matched case-insensitively). |
| `controlLevels` | none | Control level values to choose from, `[{ "documentId", "name", "rank", "indexNum" }]`. Without them the form has no control level choice. A missing `rank` comes from the name (`controlRank`). |
| `people` | active accounts | Elasticsearch request for owners. |
| `canAdd` | `true` | Offer the form. It is also hidden when the element is read-only (`readOnly`, `enabled: false`). |
| `addLabel` | `"Add action"` | |
| `showCancelled` | `false` | Show cancelled actions at first. |
| `openIn` | `"route"` | Where an action opens: `"route"`, `"modal"` or `"newTab"`. Ctrl- or Cmd-click always opens a new tab. |
| `hideLabel` | `false` | |

**Reads.**
- The search asks only for the fields the rows show: `documentId`, `systemHeader.summaryName`,
  `actionRef`, `title`, `actionStatusRel`, `controlLevelRel`, `ownerRel`, `dueDate` and
  `completedDate`. It returns up to 200 actions.
- From this record it reads `documentId`, `systemHeader.summaryName` (stored in `sourceRel.name`;
  falls back to "<ref>: <title>"), `refField`, `ratingField`, and `systemHeader.serverCreatedDate` /
  `createdDate`.

**Refreshing.**
- It searches again after any save in the app (`document:updated`), skipping the save the broadcast
  replays to new subscribers.
- When the save is of this record, a record that was new becomes saved and can take actions.

**A record that has never been saved** has no `systemHeader.serverCreatedDate` or `createdDate`. The
element shows "Save the incident first, then add its actions." and doesn't search.

**Adding.** **Add action** opens a form:
- **Action** (the title).
- **Control level**: radio buttons from Eliminate to PPE, each with its strength bars, and the hint of
  the hovered, focused or chosen level ("Engineering: Change the plant or process…").
- **Owner**: the kit's people picker, with **Assign to me**. It stores
  `{ documentId, name, email, accountType }`.
- **Due**: a date input, defaulted from the rating's `actionDays` with `actionDueDate`, with the hint
  "High risk: due within 7 days". It follows the rating until someone picks a date.

All four are required; the control level only when `controlLevels` is set. **Save** checks them
first, the way `Safety Action - PreSaveServer` would. Every missing field says so at once ("Choose
who owns the action."), and focus moves to the first one. Then:

```js
createDocument(templateId, {
  appTags: ['whs', 'action'], title,
  controlLevelRel: [level], ownerRel: [owner],
  dueDate,                      // 5 pm in eastern Australia (07:00 UTC) on the chosen day, as actionDueDate sets them
  raisedDate: now,              // ISO
  actionStatusRel: [statusValues.Open],
  sourceRel: [{ documentId, name, ref, kind, riskRating }],
})
```

- Empty values are left out rather than stored empty.
- The date input shows a due date's day in eastern Australia (UTC+10), as `actionDueDate` counts
  days.
- The new action shows at once, from the saved document the server returns, because search finds it
  only about a second later. Its reference reads "New" until the server's numbering is found. Focus
  moves to it, the form closes, and the list searches again 1.5 s later.
- A refused save shows the server's message under the form, and keeps everything typed. Escape or
  **Cancel** closes the form.

**Rules it pairs with** (`demo/lib/rules.mjs`, `Safety Action` rules):
- They number new actions (`actionRef`) and default `raisedDate`, `actionStatusRel` (Open) and
  `dueDate`.
- They refuse an action with no source, control level, owner or due date.
- They refuse a due date later than the source's rating allows, unless a manager or WHS advisor
  approves it.
- They roll the actions up onto their source with `actionsSummary`.
- `sourceRel.riskRating` is what they date and rate the action by.

**Example** (incident):

```json
{
  "componentName": "solid-corrective-actions", "name": "incidentActionsList", "label": "Corrective actions",
  "fullWidth": true, "disableSave": true,
  "templateId": "<action template id>", "sourceKind": "incident", "refField": "incidentRef", "ratingField": "riskRating",
  "statusValues": { "Open": { "documentId": "…", "name": "Open", "color": "#3e63dd", "statusCategory": "todo", "indexNum": 10 } },
  "controlLevels": [{ "documentId": "…", "name": "Eliminate", "rank": 1, "indexNum": 10 }],
  "people": "{'sort':[{'systemHeader.summaryName':'asc'}],'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'account'}}]}}}"
}
```

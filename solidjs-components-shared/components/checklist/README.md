# `<solid-checklist>`

A check sheet to answer, such as a Daily Driver pre-start check or a work order's service checks.
Each check is answered **Pass**, **Fail** or **N/A**, and checks are grouped by category. The element
shows progress, pass and fail counts, and the sheet's result: **Pass**, **Defects found** or
**Incomplete**. It writes the whole list, questions and answers, to its field, so the record keeps
the checks as they were asked even if the sheet changes later. In `define` mode it edits the checks
themselves instead (a check sheet, or a service plan's tasks).

| Option | Default | |
|---|---|---|
| `mode` | `"answer"` | `"answer"` or `"define"`. Read once. |
| `items` | none | Checks listed on the definition: `[{ "question", "category", "mandatory", "instruction", "key" }]`. Only `question` is required; a missing `key` is made from the question. They fill the field while it is empty. |
| `itemsFrom` | none | Load the checks from a check sheet: `{ field, documentField, itemsField }`, see below. Read once. |
| `commentOnFail` | `true` | A failed check needs a comment. |
| `failLabel` | `"Defects found"` | The sheet's result when a check failed: "Hazards found" on a safety inspection. |
| `allowNa` | `true` | Offer N/A. |
| `allowAdd` | `false` | Adds an **Add a check…** box for one-off checks. They go under "Added checks" with `adhoc: true`. With `itemsFrom`, the box appears only once there are checks. |
| `answerLabels` | Pass, Fail, N/A | What the answers are called: `{ "pass": "Done", "fail": "Blocked" }` for onboarding tasks. The counts and the "mark the rest" button follow ("Mark the remaining 4 as Done"). Stored answers stay `pass`, `fail` and `na`. |
| `passLabel` | `"Pass"` | The result shown when every check is answered and none failed ("Complete"). Display only: `checklistOutcome` still returns "Pass". |
| `hideLabel` | `false` | |

**`itemsFrom`.**
- `field` is a related-document field of this document. Without `documentField`, its first entry is
  the check sheet.
- With `documentField`, the first entry of `field` is a record that points to the sheet (an asset),
  and `documentField` is the field on that record holding the sheet, e.g. `"checkSheetRel"`. The
  element uses the copy stored in `field` (through its `relatedFields`) when there is one, and
  otherwise loads the record.
- `itemsField` is the field on the sheet that lists the checks (default `"checkItems"`), in the same
  shape as `items`.

Loaded checks replace the list only while nothing has been answered (no result and no comment). If
the list already has answers and the sheet now lists different checks, a note offers **Use its
checks**. That replaces the checks, clears their answers, and keeps the added checks.

**Stored value** (answer mode), one entry per check:

```json
{ "key": "tyres-tread-pressure-and-damage", "question": "Tyres: tread, pressure and damage", "category": "Exterior", "mandatory": true, "instruction": "At least 1.5 mm of tread…", "result": "fail", "comment": "Front left below 1.5 mm" }
```

`result` is `"pass"`, `"fail"`, `"na"` or `""`. An entry without a `key` gets one from its question.
Checks loaded from a sheet or the definition leave out blank questions. Clicking
the selected answer again clears it. **Pass the remaining N** passes every unanswered check. Failed
checks get a comment box, and so does any check that already has a comment.

**Checks.** The element uses `checklistOutcome` from the kit (`packages/kit/src/domain/checklist.ts`)
for the counts and the result. It warns "Mandatory Check Not Completed: …" and "Say what is wrong
with: …", but doesn't block saving. The apps' rulesets carry the same function's source, always
with `commentOnFail: true`. In the fleet demo:
- Daily Driver: `validateDailyDriver` runs in the client PreSave rule and in
  `Fleet Daily Driver - PreSaveServer`. It refuses a sheet with no checks, unanswered mandatory checks,
  or failed checks without a comment. The server stores the result in `ddResult` and the number of
  failed checks in `defectCount`.
- Work order: `validateWorkOrder` refuses to complete a PM Service until every service check is
  answered (mandatory or not) and every failed check has a comment.

In the safety demo, `validateInspection` does the same for a workplace inspection, and its PostSave
rule raises a hazard for each failed check.

**Define mode** edits each check's question, category (with the existing categories suggested),
mandatory flag and instruction. Checks can be added, removed and reordered. It stores
`{ key, question, category, mandatory, instruction }` per check, with no answers. New checks get keys
`check-N`, and editing a question keeps its key. Entries stored without a `key` are shown and saved
back with one made from the question. The check
sheet template (`checkItems`) and the service plan template (`tasks`) use this mode.

**Example** (Daily Driver; the asset picker copies `checkSheetRel` into `assetRel`):

```json
{
  "componentName": "solid-checklist",
  "name": "checksArr",
  "label": "Checks",
  "mandatory": true,
  "fullWidth": true,
  "allowAdd": true,
  "itemsFrom": { "field": "assetRel", "documentField": "checkSheetRel", "itemsField": "checkItems" }
}
```

# `<solid-risk-matrix>`

A 5 × 5 risk matrix: likelihood rows, Almost certain at the top and Rare at the bottom, and
consequence columns, Insignificant on the left and Catastrophic on the right. Cells are tinted by
rating (Low, Medium, High, Extreme) and also show the rating name and score, so colour isn't the only
signal. The element has two modes.

**`assess`** (default): rates the field's risk. Pick a cell, or choose the likelihood and the
consequence in two selects. Under the grid are the rating, the score, and what the rating asks for:
"Actions due within 7 days · Investigation: full · Notify: Supervisor, WHS Advisor, Site Manager".
With `compareField` (the residual risk against the inherent risk), the other risk is a dashed ghost
marker, with an arrow to this field's cell.

**`heatmap`**: a page element (`disableSave`). It counts records per cell by the risk value at
`riskField`, with a total and a count per rating. A cell opens the list of its records.

| Option | Default | |
|---|---|---|
| `mode` | `"assess"` | `"assess"` or `"heatmap"`. Read once. |
| `compareField` | none | Assess: another risk field of this document (e.g. `"inherentRisk"` on the residual risk), shown as a ghost marker. Followed live as it changes. Read once. |
| `compareLabel` | `"Before controls"` | Assess: what the ghost marker is. Used in the key under the grid and in the cell's accessible name. |
| `showResponse` | `true` | Assess: show what the rating asks for under the result. |
| `mandatory` | `false` | Assess: no **Clear**, and Delete doesn't clear. |
| `readOnly`, `enabled: false` | | Assess: the value shows but can't change. The selects and **Clear** go, and the grid is no tab stop. Rulesets can switch this live. |
| `filter` | required | Heatmap: Elasticsearch request for the records to count. Takes a single-quoted JSON string with Handlebars, or an object. |
| `riskField` | required | Heatmap: path of the risk value in each record, e.g. `"residualRisk"`. Arrays on the path use their first entry. |
| `titleField` | `"systemHeader.summaryName"` | Heatmap: what a record is called in a cell's list. |
| `limit` | `500` | Heatmap: most records counted (at most 10,000). Past it, a note says "Counting the first 500 of N". |
| `noun` | `"record"` | Heatmap: what the records are, for the counts ("5 hazards"). |
| `hideLabel` | `false` | |

**Stored value** (assess):

```json
{ "likelihood": 4, "consequence": 4, "score": 16, "rating": "High" }
```

- Likelihood runs from 1 (Rare) to 5 (Almost certain), and consequence from 1 (Insignificant) to
  5 (Catastrophic).
- `score` is likelihood × consequence. `rating` comes from `riskRating` in whs-kit
  (`logic/risk.ts`), the same function the rules use.
- **Clear** writes `null`.
- A stored value is read by its likelihood and consequence alone. A stale or hand-edited score or
  rating is shown re-rated, and stays as stored until someone changes the value.
- Anything that isn't a complete risk reads as "not rated".

**Choosing** (assess).
- **Grid.** Click a cell. From the keyboard, the grid is one tab stop:
  - arrows move;
  - Home and End go to the ends of the row, Ctrl+Home and Ctrl+End to the corners;
  - PageUp and PageDown go to the top and bottom rows;
  - Enter or Space picks;
  - Delete or Backspace clears, when the field isn't mandatory.
- **Accessible names.** Each cell is named by its levels, rating and score ("Likely × Major: High,
  score 16"). It is described by the hints of its two levels, and the chosen cell is
  `aria-selected`.
- **Selects.** The **Likelihood** and **Consequence** selects are the other way to choose. With only
  one chosen, its row or column is outlined, and nothing is written until the other is chosen too.
- **Hints.** Under the grid, the hovered or focused cell (otherwise the value) is explained with the
  hints of its likelihood and consequence ("Likely: Will probably happen: several times a year").
- **Response line.** It comes from `riskResponse`:
  - when actions are due (`actionDays`);
  - how deep the investigation goes: none, a supervisor's review, or full;
  - who is told.

**Compare** (assess, `compareField`).
- The other field's cell gets a dashed marker, with an arrow from it to this field's cell, and a key
  under the grid ("Before controls: Likely × Major · High 16").
- When `residualProblem` objects, its message shows as a warning. The warning appears when the
  residual risk would be higher than the risk before controls, or when its likelihood or consequence
  went up. It doesn't stop the value being written: the hazard rules refuse the save.

**Heatmap.**
- **Counts.** Each cell shows its count, and the fuller a cell, the deeper its tint. Records without
  a complete risk at `riskField` are left out of the cells and counted as "not assessed". The summary
  reads "5 hazards · Extreme 0 · High 1 · Medium 3 · Low 1 · 1 not assessed".
- **Cell lists.** Clicking a cell, or Enter on it, opens a popover listing its records by
  `titleField`. Focus moves to the first link. A link opens the record in the app; Ctrl- or Cmd-click
  opens a new tab. Escape closes the list and returns focus to the cell. Empty cells open nothing.
- **Search.** It asks only for `documentId`, `riskField` and `titleField`.
- **Refreshing.** It counts again after any save in the app (`document:updated`), and on **Count
  again**.

**Rules it pairs with** (`demo/lib/rules.mjs`). The rules embed the same whs-kit functions.
- **Incidents.** The incident rules re-rate `riskAssessment` with `riskRating`. From the rating they
  work out how deep the investigation goes and who closes it.
- **Hazards.** The hazard rules re-rate `inherentRisk` and `residualRisk`, and derive `inherentRating`
  and `residualRating` (with their `…Rel` and `…ScoreNum` fields) and `currentRisk`. They refuse
  a save that `residualProblem` objects to.

**Examples:**

```json
{ "componentName": "solid-risk-matrix", "name": "residualRisk", "label": "Risk once the controls are in place", "fullWidth": true, "compareField": "inherentRisk", "compareLabel": "Before controls" }
```

```json
{
  "componentName": "solid-risk-matrix", "name": "hazardHeatmap", "label": "Hazards by residual risk", "mode": "heatmap", "disableSave": true,
  "filter": "{'query':{'bool':{'filter':[{'term':{'appTags':'whs'}},{'term':{'appTags':'hazard'}}]}}}",
  "riskField": "residualRisk", "noun": "hazard"
}
```

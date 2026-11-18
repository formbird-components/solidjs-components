# `<solid-resource-schedule>`

Rows of people (or assets) by day, with their records as bars across the days: the HR app's leave
calendar. The dispatch board, a roster or hire availability would be the same element configured
differently. It stores nothing.

**What it shows.**
- A toolbar: earlier / **Today** / later (a week at a time, four weeks in longer views), the dates
  shown, a badge when any team is below its minimum ("2 days below minimum"), the view lengths
  (**2 weeks**, **4 weeks**…) and **New** (`newLabel`) when there is a `templateId`.
- A header of days: weekday and date, the month where it starts, weekends shaded, public holidays
  hatched (their name on hover), today circled.
- With `groupField`, rows grouped under a header per group (a team): its size and minimum, and for
  each work day how many are left. Fewer than the minimum shows red, with who is away on hover.
  Tentative records (pending requests) count too, unless `countTentative` is false.
- Each row: avatar, name (a link), a second line, and figures (`rowFigures`, e.g. annual leave
  available, red below `warnBelow`). The signed-in person's row is tinted.
- Records as bars in their colour (`colorField`, or one made from the label), labelled, linked to the
  record, with a tooltip ("Annual leave · Pending · Wed 25 Nov – Fri 27 Nov · 3 days"). Tentative
  ones are hatched with a dashed edge; half days fill half the day; records running past the edge are
  squared off; overlapping records of a row stack in lanes.
- A key of the labels shown, tentative, public holiday and below minimum.

**Starting a record.** With `templateId`, drag across free days in a row you may use (your own with
`createFor: "me"`, anyone's with `"anyone"`): the days highlight and a bar asks to confirm ("You: Mon
7 Dec – Wed 9 Dec · 3 working days"). Confirming opens a new record with the row and the days filled
in (`openNewDocument`): the row as a related value (`newRowField`, with `rowValueFields`), and the
start and end as the starts of the first and last day in `timeZone`. **New** in the toolbar starts
one for you without days.

It searches again when the days shown change and after any save in the app (`document:updated`).

| Option | Default | |
|---|---|---|
| `rowFilter` | active accounts | Elasticsearch request for the rows. |
| `rowLabelField`, `rowDetailField` | summary name, none | Paths for the name and the second line. |
| `groupField`, `groupMinField` | none | Group rows by this path (`teamRel.name`); the group's minimum, read from its rows (`teamRel.minOnDutyNum`). |
| `rowFigures` | none | `[{ label, path, unit, warnBelow }]`, shown as chips beside the name. |
| `filter` | none | Elasticsearch request for the records. The element adds the visible days: starting before the day after the last, ending on or after the first. |
| `rowField` | `employeeRel.documentId` | Path on a record to its row. |
| `startField`, `endField` | `startDate`, `endDate` | A record's first and last day (instants read in `timeZone`; the end is the last day, included). |
| `startHalfField`, `endHalfField` | none | Booleans: starts / ends at midday. |
| `labelField`, `colorField`, `statusField` | none | What a bar says, its colour, its status (tooltip). |
| `tentativeStatuses` | `[]` | Statuses drawn hatched (`["Pending"]`). |
| `countTentative` | `true` | Count tentative records in who is left. |
| `timeZone` | the browser's | The days' zone (the company's). |
| `holidays`, `workDays` | none, Monday to Friday | As on `<solid-date-range>`. |
| `days`, `views` | `14`, `[14, 28]` | Days shown at first, and the lengths offered. |
| `templateId`, `createFor`, `newRowField`, `rowValueFields`, `newLabel` | none, `"me"`, first part of `rowField`, none, `"New"` | Starting records, see above. |
| `openIn` | `"route"` | Where a record opens: `"route"`, `"modal"` or `"newTab"`. |
| `hideLabel` | `false` | |

The maths (visible days, lanes, who is left per day) is in `src/schedule.ts`, with unit tests. The
HR app's browser test drives the built element. Fleet's booking calendar (hours, not days) could be
rebuilt on it.

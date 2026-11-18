# `<solid-date-range>`

When something starts and ends, held in two fields of the document. Two modes:

- **Date and time** (default): a booking's start and completion, a workshop job's expected start and
  completion. Each row has a date input and a list of times. Moving the start keeps the duration,
  quick-duration buttons set the end, and the range is checked with the kit's time range rules.
- **Days** (`mode: "days"`): leave, a roster period. A first and last day, optional half days, and the
  working days counted without weekends and public holidays, shown as a strip of days.

The element is bound to the start field (`name`) and writes the end to `endField`. It started in the
fleet app and moved here when the HR app needed it for leave.

## Options

| Option | Default | |
|---|---|---|
| `mode` | `"datetime"` | `"datetime"` or `"days"`. Read once. |
| `endField` | `"endDate"` | Field the end is written to. Read once. |
| `startLabel`, `endLabel` | `"Starts"`, `"Ends"`; `"First day"`, `"Last day"` | Row labels. |
| `noun` | `"booking"`; `"leave"` | What the range is of, in the messages ("The job must end after it starts."). |
| `warnPast` | `true` | Warn when a record that hasn't been saved yet starts in the past (date and time: more than 5 minutes ago; days: before today). |
| `presets` | `[1, 2, 4, 8]`; `[1, 2, 5, 10]` | Quick lengths: hours, or working days. |
| `hideLabel` | `false` | |

**Date and time only**

| Option | Default | |
|---|---|---|
| `stepMinutes` | `30` | Minutes between the times in the lists (at least 5). A stored time that is off the step is listed as well. |
| `defaultHours` | `2` | Length given to the range when the start is set and there is no valid end yet. |
| `minMinutes` | `15` | Shortest range. |
| `maxHours` | none | Longest range, in hours. |
| `maxHoursFrom` | none | Dot path to a field of this document holding the longest range, e.g. `"assetRel.0.maxBookingHours"`. A positive number there wins over `maxHours`. The value has to be stored on this document, e.g. copied in by the asset picker's `relatedFields`. Read once. |
| `maxText` | `"The <noun> can be at most {max} hours long."` | The message for a range that is too long; `{max}` receives the hours. Fleet's booking says "This asset can be booked for at most {max} hours at a time." |

**Days only**

| Option | Default | |
|---|---|---|
| `timeZone` | the browser's | IANA zone the days are in, normally the company's (`"Australia/Sydney"`). The stored instants are the starts of the days in this zone, so a person in another zone picks the same days. |
| `holidays` | none | Public holidays: `"2026-12-25"` or `{ "date": "2026-12-25", "name": "Christmas Day" }`. They aren't working days, and they show hatched in the strip with their name. |
| `workDays` | `[1, 2, 3, 4, 5]` | Days of the week that are worked, 0 (Sunday) to 6 (Saturday). |
| `startHalfField`, `endHalfField` | none | Boolean fields for half days. With them, switches **Starts at midday** and **Ends at midday** appear under the dates. Read once. |
| `daysField` | none | Field the working-day count is written to (e.g. `"daysNum"`), whenever the range changes. Read once. |

## Date and time

**Editing.** Picking a date with no time yet takes the next step from now (09:12 → 09:30). A preset
keeps the start (or uses the next step from now if there is none) and sets the end that many hours
later. **Until 5 pm** ends the range at 17:00 on the start's day, or on the next day if the start is
17:00 or later. Changing the end changes only the end.

**Stored value.** Both fields hold ISO strings in UTC (`"2026-11-05T22:30:00.000Z"`). ISO strings and
epoch milliseconds are read. Dates and times are shown and entered in the browser's time zone.

**Checks.** `timeRangeProblems` from the kit (`packages/kit/src/domain/range.ts`): both ends set,
valid dates, end after start, at least `minMinutes` long, at most the maximum. The element adds the
"starts in the past" warning (`warnPast`). Problems show as a warning under the inputs, and nothing is
shown while both fields are empty. The element doesn't block saving.

On fleet's bookings, the same function runs in `validateBooking`, which the booking's client PreSave
rule and `Fleet Booking - PreSaveServer` call while the booking is Asset Reserved. The rule uses the
asset's `maxBookingHours` from the stored `assetRel`, or 72 hours if the asset has none. It differs
from the element in three ways:
- The rule always uses the 15-minute minimum and ignores `minMinutes`.
- The rule lets asset managers go over the maximum, but the element still shows them the warning.
- The rule doesn't check for a past start. Instead, the PreSaveServer moves a new booking's past
  start to now and sets `startAdjustedBool`.

**Read-only** shows the range as text ("Wed 5 Nov, 9:00 am – 11:00 am") with the duration.

## Days

**Editing.**
- Two date inputs, **First day** and **Last day**. Moving the first day keeps the length of the range;
  a range with no last day becomes one day. The last day can't be picked before the first.
- With `startHalfField` / `endHalfField`, **Starts at midday** and **Ends at midday**. A one-day range
  has one half at most: turning one on turns the other off.
- Quick lengths count working days from the first day (or from the next working day if there is
  none): **1 day**, **2 days**, **1 week** (5), **2 weeks** (10). They clear the halves.
- Under the dates, a strip of the range's days (up to 42, then "+N"): working days in the accent
  colour, weekends grey, public holidays hatched (their name on hover), and a half day half filled.
- The count: "4.5 working days · 7 calendar days · Christmas Day".

**Stored value.**
- The start field holds the first day, the end field the **last day** (included, not the day after).
  Both are ISO instants of 00:00 that day in `timeZone`: `"2026-11-04T13:00:00.000Z"` is 5 Nov in
  Sydney.
- The half-day fields hold `true` or `false`; `daysField` the count (`4.5`), or `null` when a day is
  missing.

**Counting.** `workingDays` from the kit: work days of the week, less holidays on work days, less half
a day for a midday start or finish; a one-day range with a half is half a day. `dayKey` and
`dayStart` convert between instants and days in a time zone. Rulesets carry these functions as
source, so a leave rule counts exactly what the form showed.

**Checks.** "Choose the first and last day", "The last day can't be before the first", "These days
are all weekends or public holidays", and the past-start warning for a new record. They don't block
saving; the app's rules decide.

**Read-only** shows "Mon 3 Nov – Fri 7 Nov (until midday)" and "4.5 working days".

## Examples

Booking (fleet):

```json
{
  "componentName": "solid-date-range",
  "name": "startDate",
  "label": "When",
  "endField": "endDate",
  "mandatory": true,
  "fullWidth": true,
  "startLabel": "Booking Start",
  "endLabel": "Booking Completion",
  "maxHours": 72,
  "maxHoursFrom": "assetRel.0.maxBookingHours",
  "maxText": "This asset can be booked for at most {max} hours at a time."
}
```

Leave (HR):

```json
{
  "componentName": "solid-date-range",
  "name": "startDate",
  "label": "When",
  "mode": "days",
  "endField": "endDate",
  "startHalfField": "startHalfBool",
  "endHalfField": "endHalfBool",
  "daysField": "daysNum",
  "timeZone": "Australia/Sydney",
  "holidays": [{ "date": "2026-12-25", "name": "Christmas Day" }, { "date": "2026-12-28", "name": "Boxing Day (additional day)" }],
  "mandatory": true,
  "fullWidth": true
}
```

# `<solid-date-range>`

When something starts and ends, held in two fields of the document: a booking's start and
completion, or a workshop request's expected start and completion. Each row has a date input and a
list of times. Moving the start keeps the duration. Quick-duration buttons set the end from the
start. The duration is shown, and the range is checked with the booking time rules.

The element is bound to the start field (`name`) and writes the end to `endField`.

| Option | Default | |
|---|---|---|
| `endField` | `"endDate"` | Field the end is written to. |
| `startLabel`, `endLabel` | `"Starts"`, `"Ends"` | Row labels. |
| `noun` | `"booking"` | What the range is of, in the messages ("The job must end after it starts."). The workshop request uses `"job"`. |
| `stepMinutes` | `30` | Minutes between the times in the lists (at least 5). A stored time that is off the step is listed as well. |
| `presets` | `[1, 2, 4, 8]` | Quick durations in hours. Values under 1 show as minutes (`0.5` → "30 min"). An **Until 5 pm** button is always added. |
| `defaultHours` | `2` | Length given to the range when the start is set and there is no valid end yet. |
| `minMinutes` | `15` | Shortest range. |
| `maxHours` | none | Longest range, in hours. |
| `maxHoursFrom` | none | Dot path to a field of this document holding the longest range, e.g. `"assetRel.0.maxBookingHours"`. A positive number there wins over `maxHours`. The value has to be stored on this document, e.g. copied in by the asset picker's `relatedFields`. |
| `warnPast` | `true` | Warn when a record that hasn't been saved yet starts more than 5 minutes ago. |
| `hideLabel` | `false` | |

`endField` and `maxHoursFrom` are read once, when the element starts.

**Editing.** Picking a date with no time yet takes the next step from now (09:12 → 09:30). A preset
keeps the start (or uses the next step from now if there is none) and sets the end that many hours
later. **Until 5 pm** ends the range at 17:00 on the start's day, or on the next day if the start is
17:00 or later. Changing the end changes only the end.

**Stored value.** Both fields hold ISO strings in UTC (`"2026-11-05T22:30:00.000Z"`). ISO strings and
epoch milliseconds are read. Dates and times are shown and entered in the browser's time zone.

**Checks.** `bookingTimeProblems` from fleet-kit (`logic/booking.ts`): both ends set, valid dates, end
after start, at least `minMinutes` long, at most the maximum. The element adds the "starts in the past"
warning (`warnPast`). Problems show as a warning under the inputs, and nothing is shown while both
fields are empty. The element doesn't block saving.

On bookings, the same function runs in `validateBooking`, which the booking's client PreSave rule and
`Fleet Booking - PreSaveServer` call while the booking is Asset Reserved. The rule uses the asset's
`maxBookingHours` from the stored `assetRel`, or 72 hours if the asset has none. It differs from the
element in three ways:
- The rule always uses the 15-minute minimum and ignores `minMinutes`.
- The rule lets asset managers go over the maximum, but the element still shows them the warning.
- The rule doesn't check for a past start. Instead, the PreSaveServer moves a new booking's past
  start to now and sets `startAdjustedBool`.

The messages name the range by `noun`; the server rule always says "booking".

**Read-only.** When the field is disabled (`enabled: false` or `readOnly`, also when set by a
ruleset), the element shows the range as text ("Wed 5 Nov, 9:00 am – 11:00 am") with the duration.

**Example** (booking):

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
  "maxHoursFrom": "assetRel.0.maxBookingHours"
}
```

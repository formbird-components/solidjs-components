# `<solid-booking-calendar>`

Fleet bookings on a timeline, in two modes.

**`page`** (default): one row per asset, grouped by location, for a day or a week (from Monday).
Bookings are bars in their status colour; workshop requests that take an asset out are block-outs.
A hire still out past its end is drawn up to now and marked **Hire Overdue**. Drag across free time
on a row, or press its **+**, to choose a period: a popover shows it and any clash, and **Book**
opens a new booking with the asset and times filled in. Clicking a bar opens the booking or
request; clicking an asset opens the asset. The toolbar has Today, previous/next, Day/Week, an asset
search, **Available for hire** and Reload.

**`field`**: on a booking form. Says whether the booking's asset is free for the whole period, shows
its other bookings on a strip of the days the period covers (up to a week), and lists the clashes.
When no asset is chosen, or it clashes or is unavailable, it lists up to 12 free assets (same type
first); clicking one puts it in the booking's asset field.

| Option | Default | |
|---|---|---|
| `mode` | `"page"` | `"page"` or `"field"`. Read once. |
| `assetFilter` | required | Elasticsearch request for the assets (Handlebars allowed). Up to 300, sorted by location, then ID. |
| `bookingFilter` | none | Bookings to show. The element narrows it to the assets and the visible window. |
| `blockFilter` | none | Block-outs (workshop requests), narrowed the same way. |
| `assetFields`, `bookingFields`, `blockFields` | see below | Field names on those documents; give only the ones that differ. |
| `assetValueFields` | `{}` | Fields copied into the asset value a booking stores, `{ storedKey: "source.path" }`, matching the booking's asset picker `relatedFields`. The value is `[{ documentId, name, …these }]`. |
| `overdueStatus` | `"Hire Commenced"` | A booking in this status, past its end and with no closed date, is overdue and blocks the asset until it is closed. |
| `bookingTemplateId` | none | Page mode: template new bookings open from. Without it there is no dragging and no **+**. |
| `assetField`, `startField`, `endField` | `"assetRel"`, `"startDate"`, `"endDate"` | The booking's asset and time fields: filled on a new booking (page), followed on this booking (field). |
| `view` | `"day"` | Page mode: starting view, `"day"` or `"week"`. |
| `slotMinutes` | `30` | Page mode: dragging snaps to this (at least 5). |
| `dayStartHour` | `7` | Page mode: hour the day view scrolls to (later in the day, to an hour before now). |
| `height` | `"70vh"` | Page mode: maximum height of the grid, which scrolls inside it. |
| `hideLabel` | `false` | Page mode: the heading reads "Booking calendar" instead of `label`. Field mode: no label. |

| Fields | Keys and defaults |
|---|---|
| `assetFields` | `id` `assetId`, `type` `assetTypeRel`, `location` `locationRel`, `hireStatus` `hireStatusRel`, `iconKind` `assetTypeRel.0.iconKind` |
| `bookingFields` | `asset` `assetRel`, `start` `startDate`, `end` `endDate`, `status` `bookingStatusRel`, `ref` `bookingRef`, `person` `requestedByRel`, `closed` `closedDate` |
| `blockFields` | `asset` `assetRel`, `start` `expectedStartDate`, `end` `expectedCompletionDate`, `ref` `requestRef`, `status` `requestStatusRel` |

- An asset whose hire status name contains "unavailable" is shaded, has no **+**, is hidden by
  **Available for hire** and is never offered as free. Dragging on it still works, with a warning.
- **Book** is disabled while the period overlaps anything on the row. Every booking `bookingFilter`
  returns counts, including ones drawn faded because their status says closed or cancelled.
- Field mode writes only `assetField`, when a free asset is picked (not while the field is
  disabled), and leaves the booking being edited out of the clashes. Page mode writes nothing.
- Both modes reload after any save in the app (`document:updated`).

```json
{
  "componentName": "solid-booking-calendar", "name": "bookingCalendar", "label": "Booking calendar",
  "fullWidth": true, "disableSave": true, "hideLabel": true, "height": "64vh",
  "bookingTemplateId": "<booking template id>",
  "assetFilter": "{'query':{'bool':{'filter':[{'term':{'appTags':'asset'}},{'term':{'bookableBool':true}}]}}}",
  "assetFields": { "iconKind": "iconKind" },
  "assetValueFields": { "assetId": "assetId", "registration": "registration", "iconKind": "iconKind" },
  "bookingFilter": "{'query':{'bool':{'filter':[{'term':{'appTags':'booking'}}],'must_not':[{'term':{'bookingStatusRel.name':'Cancelled'}}]}}}",
  "blockFilter": "{'query':{'bool':{'filter':[{'term':{'appTags':'request'}},{'terms':{'requestStatusRel.name':['Drop Off','In Progress','Work Complete']}}]}}}"
}
```

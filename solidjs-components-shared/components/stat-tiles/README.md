# `<solid-stat-tiles>`

A row of counts for a dashboard: assets on hire, urgent defects, services due. Each tile shows how
many documents its Elasticsearch filter matches (an exact total), or how many days since the latest
match ("days since a lost time injury"), coloured by a tone, and can link to the page or list behind
it. Display only: it writes nothing.

| Option | Default | |
|---|---|---|
| `tiles` | `[]` | Tiles, see below. Tiles without a `label` are skipped. |
| `refreshSeconds` | `0` | Count again every N seconds. `0`: no timer. |
| `hideLabel` | `false` | Hides the heading, and with it the **Count again** button. The heading also needs a `label`. |

## Tiles

| Key | |
|---|---|
| `label` | "On Hire", "Urgent defects". |
| `filter` | Elasticsearch request to count: a single-quoted JSON string with Handlebars (`{{account.documentId}}`), or an object. |
| `tone` | Colour of the number and the side bar: `neutral` (default), `good`, `warn`, `bad`, `info` or `accent`. |
| `zeroTone` | Tone when the number is 0, e.g. `good` for "nothing overdue", `bad` for "0 days since". |
| `measure` | `"count"` (default), or `"daysSince"`: whole days since the latest match's `dateField`. Its date becomes the hint ("Last: 12 Oct"); with no match the tile shows "–" and "None recorded". |
| `dateField` | For `daysSince`: the date field to look at, e.g. `"occurredDate"`. The search asks for that match only, sorted inside the request (Formbird's search takes the sort there). |
| `goodFrom` | The `good` tone once the number reaches this, e.g. 30 days without a lost time injury (and when nothing was ever recorded). |
| `color` | CSS colour for the tile instead of its tone (`tone` and `zeroTone` are then ignored). |
| `icon` | A line icon (`"clock"`), or a tile from an icon set as `"set:name"` (`"asset:Panel Van"`, `"work:Repair"`); the sets are `type`, `asset`, `work` and `priority`. Always a string: Formbird indexes template definitions, and a field can't be both text and object. |
| `link` | documentId of the page or template the tile opens (`/form/<id>`, through the app's router; Ctrl/⌘-click opens a new tab). |
| `hint` | Small text under the number. |

Tiles count when the element appears, when a ruleset changes `tiles`, after any save in the app
(`document:updated`), every `refreshSeconds`, and on **Count again**. A tile whose filter is missing
or whose search fails shows "–", with the error on hover.

```json
{
  "componentName": "solid-stat-tiles", "name": "fleetTiles", "label": "Today",
  "fullWidth": true, "disableSave": true, "refreshSeconds": 120,
  "tiles": [
    { "label": "Available For Hire", "tone": "good", "icon": "asset:Panel Van", "link": "<assets page id>",
      "filter": "{'query':{'bool':{'filter':[{'term':{'appTags':'asset'}},{'term':{'hireStatusRel.name':'Available For Hire'}}]}}}" },
    { "label": "Hire Overdue", "tone": "bad", "zeroTone": "good", "icon": "clock", "hint": "Not returned by their booking end",
      "link": "<bookings page id>",
      "filter": "{'query':{'bool':{'filter':[{'term':{'appTags':'booking'}},{'term':{'bookingStatusRel.name':'Hire Commenced'}},{'range':{'endDate':{'lt':'now'}}}]}}}" }
  ]
}
```

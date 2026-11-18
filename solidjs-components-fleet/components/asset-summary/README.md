# `<solid-asset-summary>`

The header of an asset form: type icon, fleet ID, make, model and year, the registration plate,
type, location and responsible person, the lifecycle and hire status lozenges, and three facts:
meter reading (with when it was read), next service, and registration. Quick-action buttons below
start a booking, a Daily Driver check or a fault report with this asset filled in.

Display only: it writes nothing. It reads the asset's fields from the document and follows them as
rulesets and other components change them, so the header updates before the save. `label` is not
shown.

| Option | Default | |
|---|---|---|
| `fields` | below | Field names on the asset, by role. Give only the ones that differ. |
| `actions` | none | Quick actions `[{ label, icon, templateId, values, primary }]`, see below. |
| `leadWeeks` | `4` | Next service is "Due Soon" this many weeks before the due date… |
| `leadMeter` | `1000` | …or this far before the due meter reading. The service plan's own leads win over both. |

| `fields` key | Default | |
|---|---|---|
| `id`, `make`, `model`, `year` | `assetId`, `make`, `model`, `yearNum` | Title. Without an ID, make or model it reads "New asset". |
| `registration` | `registration` | Plate. |
| `type`, `location`, `responsible` | `assetTypeRel`, `locationRel`, `responsiblePersonRel` | Related values, shown by name. The type's stored `iconKind` picks the icon. |
| `status`, `hireStatus` | `assetStatusRel`, `hireStatusRel` | Lozenges in their status colour. |
| `meter`, `unit`, `meterDate` | `meterReadingNum`, `primaryMeterUnit`, `meterReadingDate` | Unit `"hours"` shows hours; anything else km. |
| `serviceDueDate`, `serviceDueMeter` | `serviceDueDate`, `serviceDueMeterNum` | Next service, below. |
| `regDue` | `regDueDate` | Registration: "Expired" in red once past, amber within 30 days, "Not registered" without a date. |
| `servicePlan` | `servicePlanRel` | The service plan. Its stored `leadWeeks` and `leadMeter` (picker `relatedFields`) set when the next service is "Due Soon", as the rules do when they store the asset's warning. |

**Next service** is Overdue (red), Due Soon (amber) or Not Due (green), whichever of the due date
or the due meter is reached first, with what remains ("1,200 km or in 12 days"). It reads
"No schedule" when there is no due date and no due meter with a meter reading.

**Actions** show once the asset has an ID or a make/model. Each opens a new document from
`templateId` with `values`. A value `{ "$record": { "to": "from.path" } }` (or `"$asset"`) stores
this asset as `[{ documentId, name, …picked fields }]`, where `name` is "ID · make model ·
registration"; other values are copied as given.

```json
{
  "componentName": "solid-asset-summary", "name": "assetSummary", "fullWidth": true, "disableSave": true,
  "actions": [
    { "label": "Book", "icon": "calendar", "primary": true, "templateId": "<booking template id>",
      "values": { "assetRel": { "$record": { "assetId": "assetId", "registration": "registration", "iconKind": "iconKind" } } } },
    { "label": "Report a fault", "icon": "wrench", "templateId": "<workshop request template id>",
      "values": { "assetRel": { "$record": { "assetId": "assetId", "registration": "registration", "iconKind": "iconKind" } } } }
  ]
}
```

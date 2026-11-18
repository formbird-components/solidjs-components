# `<solid-line-items>`

Costs, line by line. Fleet's work order: parts picked from the materials list (with part number,
unit cost and stock), labour at the workshop rate, and other costs. Procurement's purchase request:
goods picked from supplier catalogues, services and freight. Each line has a type, a description, a
quantity and a unit cost, and the table shows each line's amount. Under the table are the totals per
type, the subtotal, the tax, and the grand total.

It started in the fleet app and moved here when procurement needed it. With no `kinds`, it is the
work order it always was.

| Option | Default | |
|---|---|---|
| `materialFilter` | none | Elasticsearch request for the materials: a single-quoted JSON string with Handlebars, or an object. Without it there is no **Add part** button. |
| `materialFields` | `{ "partNo": "partNo", "unitCost": "unitCost", "unit": "unit", "stock": "qtyAvailable" }` | Fields on material documents. Give only the ones that differ. |
| `kinds` | a work order's | The kinds of line: `[{ "value", "label", "total", "alwaysTotal", "unit", "rate", "add", "subtle" }]`. `label` is shown in the Type column, `total` names its totals row (default the label), `alwaysTotal` shows the row even at zero, `unit` and `rate` start a new line, and `add` is the text of a button that adds an empty line of that kind. A unit of `"h"` shows the hours in the total. The default is Part (totals "Parts"), Labour (h, **Add labour**, at `labourRate`) and Other (**Other**, shown in the totals only when not zero). |
| `labourRate` | none | Unit cost of a new labour line, with the default kinds. Without it, the unit cost starts empty. |
| `catalogKind`, `catalogLabel`, `catalogNoun` | `"part"`, `"Add part"`, `"parts"` | The kind a line picked from `materialFilter` gets, the pick button's text, and what the search calls the items. |
| `costLabel` | `"Unit cost"` | The unit cost column's heading ("Unit price"). |
| `emptyText`, `noteText` | work order texts | Shown with no lines, and under the totals while editing. |
| `currency` | `"AUD"` | ISO code used to show amounts. |
| `taxRate` | `0.1` | Tax on the subtotal. |
| `taxLabel` | `"GST"` | |
| `hideLabel` | `false` | |

**Adding lines.**
- **Add part** searches `materialFilter`. Typed text matches the material's name, and up to 30
  results are listed. Picking one adds a part line with the material's name, unit and unit cost, and
  a quantity of 1. Picking a material already on the list adds 1 to that line's quantity instead.
  Stock is shown in the list but not checked.
- **Add labour** adds a "Labour" line of 1 h at `labourRate`.
- **Other** adds an empty line of 1 ea.

Quantity and unit cost accept commas, spaces and `$`. Text that isn't a number leaves the value
empty.

**Stored value**, one entry per line:

```json
{ "id": "…", "kind": "part", "description": "Oil filter (light vehicle)", "materialRel": [{ "documentId": "…", "name": "Oil filter (light vehicle)", "partNo": "OF-LV-90915" }], "qty": 1, "unit": "ea", "unitCost": 18.5 }
```

`kind` is `"part"`, `"labour"` or `"other"`, and only picked parts have `materialRel`. Ids come from
fieldtec-web's `OfflineUtilService.getNextId()` when it is available. Entries without a string `id`
are ignored.

**Totals.** `lineTotals` from the kit (`packages/kit/src/domain/money.ts`) works out the amount and
quantity of each kind (`byKind`, `qtyByKind`), and a work order's parts, labour and other costs, the
subtotal, tax and total, each rounded to cents. It also counts labour hours (the quantities of the labour
lines). The Other row is shown only when it isn't zero. `Fleet Work Order - PreSaveServer` runs the
same function when the work order is saved and stores `partsTotal`, `labourTotal`, `labourHours`,
`taxTotal` and `totalCost`. The rule always uses a tax rate of 0.1 and ignores `taxRate`, so change
both together.

**Read-only.** When the field is disabled, the lines are shown as text and the add buttons are
hidden.

**Example** (work order):

```json
{
  "componentName": "solid-line-items",
  "name": "lineItemsArr",
  "label": "Materials and labour",
  "fullWidth": true,
  "labourRate": 120,
  "materialFilter": "{'sort':[{'indexNum':'asc'},{'systemHeader.summaryName':'asc'}],'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'document'}},{'term':{'appTags':'fleet'}},{'term':{'appTags':'material'}}],'must_not':[{'term':{'inactiveBool':true}}]}}}"
}
```

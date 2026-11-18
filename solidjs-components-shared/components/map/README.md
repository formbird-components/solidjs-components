# `<solid-map>`

An OpenLayers map. In `layers` mode (the default) it draws documents from Elasticsearch searches:
assets as icon tiles in their hire-status colour, sites as boundaries with their name. A layer panel
switches layers on and off; clicking a feature opens a popup with fields, **Open** and quick actions.
In `point` and `area` modes it edits its own field instead: a location (click the map, drag the
marker, or **My location**) or a boundary (**Draw boundary**, then drag the corners).

Needs OpenLayers 6.15.1 as the page global `OL`. The component document loads it through the
`openlayers-shared` vendor library (`formbird.vendorLibraries` in package.json). Without it the
element shows a warning instead of the map.

| Option | Default | |
|---|---|---|
| `mode` | `"layers"` | `"layers"`, `"point"` or `"area"`. Read once, when the element starts. |
| `layers` | `[]` | Searches to draw, see below. |
| `height` | `"440px"`, `"320px"` when editing | CSS height of the map. |
| `center`, `zoom` | Sydney; `11`, `15` when editing | Start view, `[lon, lat]`; edit modes start at the stored point when there is no `center`. After the first load the map fits to everything it shows (at most zoom 16), so these matter only when there is nothing to show. |
| `tileUrl`, `tileAttribution` | OpenStreetMap | XYZ tile URL and its attribution. |
| `showList` | `true` | `layers` mode: list of the features beside the map. Shown only when the element is at least 760 px wide; areas are not listed. |
| `hideLabel` | `false` | |

## Layers

| Key | |
|---|---|
| `name`, `label` | Id of the layer, and its name in the layer panel (with a count). |
| `filter` | Elasticsearch request, as for `<solid-table>` (Handlebars allowed). Up to 500 documents per layer; documents without a usable location are skipped. |
| `geometryField` | Field holding the location as Formbird stores it: a GeoJSON FeatureCollection (a Feature, a bare geometry or `{ lat, lng }` also work). Points, polygons and lines are drawn. |
| `style.kind` | `"tile"` (icon tile), `"marker"` (dot) or `"area"` (polygon with a label). Default: `area` for polygons and lines, `marker` for points. Set `"area"` explicitly to have area labels give way to each other instead of overlapping. |
| `style.statusField` | Related status field whose stored colour paints the feature (`hireStatusRel`). |
| `style.color` | Colour when there is no status colour. Default `#5b47e0`. |
| `style.iconSet`, `style.iconField`, `style.iconKindField` | Tiles: icon family (default `asset`), the field naming the value (`assetTypeRel.0.name`) and a field holding an explicit icon kind (`iconKind`). |
| `style.labelField` | Field labelling areas. Default `systemHeader.summaryName`. |
| `popup.titleField` | Popup title (and list entry). Default `systemHeader.summaryName`. |
| `popup.fields` | `[{ label, path, type, suffix }]`. `type`: `text` (default), `status`, `number`, `datetime` or `relative`. A path ending `.0.name` shows the first related value's name. `suffix` follows `text` and `number` values. |
| `popup.actions` | Quick actions `[{ label, icon, templateId, values, primary }]`: open a new document from `templateId` with `values`. `{ "assetRel": { "$record": { "assetId": "assetId" } } }` stores the clicked document as `[{ documentId, name, assetId }]`; other values are copied. |
| `hidden` | Start with the layer switched off. |

Layers are created when the map starts. A ruleset can change a layer's filter (the map reloads) but
not add layers. The map also reloads on its reload button and after any save in the app
(`document:updated`). `layers` mode never writes to the document.

**Edit modes.** `point` writes a FeatureCollection with one Point (`[lon, lat]`, 6 decimals), keeping
the feature's existing properties and adding `source: "manual"` and `recordedDate`. `area` writes one
Polygon (ring closed automatically), keeping the properties, and shows its size in m² or ha. Drawing
replaces the old boundary. **Clear** removes the value. `enabled: false` or `readOnly: true` (also
from a ruleset) stops editing. The location form uses
`{ "componentName": "solid-map", "name": "boundaryGeo", "label": "Site boundary", "mode": "area" }`.

```json
{
  "componentName": "solid-map", "name": "fleetMap", "label": "Fleet map",
  "fullWidth": true, "disableSave": true, "height": "400px",
  "layers": [
    {
      "name": "assets", "label": "Assets", "geometryField": "locationGeo",
      "filter": "{'query':{'bool':{'filter':[{'term':{'appTags':'asset'}},{'term':{'includeInMapBool':true}}]}}}",
      "style": { "kind": "tile", "statusField": "hireStatusRel", "iconField": "assetTypeRel.0.name", "iconKindField": "iconKind" },
      "popup": {
        "fields": [{ "label": "Hire status", "path": "hireStatusRel", "type": "status" }, { "label": "Location", "path": "locationRel.0.name" }],
        "actions": [{ "label": "Book", "icon": "calendar", "primary": true, "templateId": "<booking template id>",
                      "values": { "assetRel": { "$record": { "assetId": "assetId", "registration": "registration" } } } }]
      }
    },
    {
      "name": "sites", "label": "Depots and workshops", "geometryField": "boundaryGeo",
      "filter": "{'query':{'bool':{'filter':[{'term':{'appTags':'location'}}]}}}",
      "style": { "kind": "area", "color": "#5b47e0", "labelField": "nameId" }
    }
  ]
}
```

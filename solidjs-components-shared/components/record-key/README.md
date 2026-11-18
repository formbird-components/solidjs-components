# `<solid-record-key>`

A record's reference number (`SDMS-482`, `REQ-0041`) with its type icon and a copy button. Shows
**New** (or `newText`) until the first save. Display only.

| Option | Default | |
|---|---|---|
| `prefix` | none | Project key put before a bare number (`"SDMS"` + `482` → `SDMS-482`). Handlebars allowed, e.g. `{{document.projectRel.0.name}}`. Not added if the value already starts with it. |
| `copy` | `"link"` | `"link"` copies the record's URL (`/form/<id>`), `"key"` copies the key, `"none"` hides the button. |
| `typeField` | `"typeRel"` | Related-document field whose value sets the type icon. `""` hides the icon. |
| `iconSet` | `"type"` | Icon family for that value: `"type"` (issue types), `"asset"` (vehicles and plant), `"work"` (maintenance work) or `"priority"`. |
| `newText` | `"New"` | Shown before the first save, e.g. `"New issue"`. |
| `hideLabel` | `false` | |

**Keep the number generation.** Keep `"type": "Reference No"`, `counterDocumentId`,
`counterFieldName` and `format` on the definition, as SDMS's `itemRef` has them. With `type` set,
fieldtec-web's `ReferenceNoPreprocessor` assigns the number on first save whatever the component is
called. Without it, the server runs this component document's `serverPreprocessorFunction` instead
(there isn't one), and no number is generated.

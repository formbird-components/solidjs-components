# `<solid-status>`

A record's workflow status (an issue, a booking, a workshop request…) as a button in the status
colour. It opens the statuses the record can move to, as lozenges with their category. Moving into a
"done" status can ask for a second value first (a resolution, a reason for cancellation), then writes
both fields. Reopening clears it.

Accepts the SDMS `statusRel` definition unchanged (`filter`, `relatedFields`, `mandatory`). Without
`transitions` every status is offered, which is how SDMS behaves today.

| Option | Default | |
|---|---|---|
| `filter`, `relatedFields` | | As for `sc-related-document`. Rulesets can replace `filter` at runtime. |
| `transitions` | any status | Allowed moves by name: `{ "In Progress": ["In Review", "Resolved"], "*": ["New"] }`. |
| `transitionsField` | none | Field on status documents listing next statuses (`[{ documentId, name }]`); wins over `transitions`. |
| `colorField` | `"color"` | Field on status documents holding a CSS colour (SDMS Status has one). Invalid or empty values fall back to the category colour. |
| `colors` | | Colour per status name; wins over the document. |
| `categoryField` | `"statusCategory"` | Field holding `todo` / `inprogress` / `done`. |
| `categories` | guessed from the name | Category per status name (`New` → to do, `In Review` → in progress, `Closed` → done…). |
| `resolution` | none | `{ fieldName, filter, relatedFields, requiredFor, label, clearOnReopen }`. `requiredFor` lists status names and/or categories; default `["done"]`. |
| `transitionKeys` | none | Moves only key holders may make: `{ "Closed": ["<access key id>"] }`. The user needs one of the keys with the Update right; others don't see that target. The picker can't stop an API save, so enforce the rule in a PreSaveServer ruleset too. |

Statuses load when the element appears (colours are needed straight away) and again when a ruleset
changes the filter.

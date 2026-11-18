# `<solid-lookup-picker>`

Pick one or several lookup documents: type, priority, severity, resolution, category, labels. It
accepts `sc-related-document` definitions unchanged and stores the same value
(`[{ documentId, name, ...relatedFields }]`).

Single values show an icon and the name. Multiple values show chips: labels get a stable colour from
their name, and iconed values get their icon.

| Option | Default | |
|---|---|---|
| `filter`, `relatedFields`, `singleSelection`, `showDropDown`, `queryOptions.pageSize`, `helpDisplayString`, `noHelpDisplay` | | As for `sc-related-document`. `singleSelection` defaults to a list, like there. `showDropDown: false` waits for typing before searching. |
| `iconSet` | from the field name | `"type"` (issue-type tiles), `"priority"` (arrows, also for severity), `"none"`. `typeRel` → type, `priorityRel`/`severityRel` → priority. |
| `icons` | | Per value: `{ "Bug": { "icon": "bug", "color": "#e5484d" } }`. Icons: bug, story, task, epic, subtask, feature, improvement, support, change, generic; priority levels: highest, high, medium, low, lowest, none. |
| `iconKindField` | none | Field naming each value's icon kind (`van`, `forklift`…) when the name doesn't say it, e.g. an asset picker with `iconSet: "asset"`. Add it to `relatedFields` too. |
| `colorField` | none | Field on lookup documents holding a colour (tints icons, or shows a colour dot). |
| `emptyLabel` | `"None"` | |

Without overrides, icons are guessed from names, covering Jira and the Mantis vocabulary SDMS uses
(`Crash`/`Block` → highest, `Major` → high, `Minor` → low, `Trivial`/`Text` → lowest…).

# `<solid-table>`

Documents matching an Elasticsearch filter, in a table: issue lists, people, lookups. Sorting and
paging run in Elasticsearch. Columns are typed (keys, statuses, priorities, people, labels, dates).
The main `sc-datatables` options work unchanged, so an existing list can switch by changing
`componentName` and adding column types.

| Option | Default | |
|---|---|---|
| `filter` | none | Elasticsearch request: a single-quoted JSON string with Handlebars (`{{account.documentId}}`, `{{document.documentId}}`), or an object a ruleset sets with `ntf.scope.setFilter`. Its own `sort` applies when no column has one. |
| `gridColumns` | `[]` | Columns, see below. |
| `rowsPerPage` | `10` | |
| `showSearch` | `false` | Search box. |
| `searchBoxFilter` | wildcard on the summary name | Clause added for the typed text. `{{{search}}}` receives the text, escaped so any input gives a valid query. |
| `searchPlaceholder` | `"Search"` | |
| `exportTypes` | none | `["CSV"]` adds **Export CSV**: current search and sort, visible columns, up to `exportLimit` rows (default 2000, at most 10000). Formula-like values are defused. |
| `showReload` | `false` | Reload button. |
| `statusFilter` | none | Filter listing the status documents; status columns then use their colours. |
| `emptyText` | `"Nothing to show."` | |
| `openIn` | `"route"` | Where a clicked row opens: `"route"`, `"modal"` or `"newTab"`. Ctrl/⌘-click always opens a new tab. |
| `rowClick` | `true` | `false`: only links in cells open documents. |
| `hideLabel` | `false` | |

## Columns

| Key | |
|---|---|
| `displayName` | Header. Default: made from the field name (`storyPointsNum` → "Story points"). |
| `field` | Dot path; arrays are read through (`tagsRel.name`). For people, statuses, priorities, types and labels, give the related field itself (`assigneeRel`). |
| `type` | See below. Default `text`. |
| `link` | A text column that links to the row's document (e.g. the summary). |
| `href` | Target for `url`, `key` and `link` columns, Handlebars against the row. Default `/form/{{{documentId}}}`. Only http(s), mailto and relative URLs are linked. |
| `sort` | `{ "direction": "asc" \| "desc", "precedence": 1 }`: initial sort (as in sc-datatables). |
| `sortField` | Elasticsearch field to sort by, when the default below doesn't fit. `sortable: false` turns sorting off. |
| `visible` | `false` hides the column and leaves it out of exports. |
| `responsive` | `{ "xs": 0, "sm": 0, "md": 0, "lg": 0 }` (as in sc-datatables): `0` hides the column at that size. Sizes are measured on the table itself: under 576, 768 and 992 px. |
| `width`, `emptyText` | CSS width; text for an empty cell (`user` columns default to "Unassigned"). |
| `iconOnly` | `issueType` and `icon` columns: the icon alone, with the name as its tooltip. |
| `iconSet`, `iconKindField` | `icon` columns: the icon family (`type`, `asset`, `work`, `priority`) and a field of the row naming the kind (`iconKind`) when the name doesn't say it. |
| `currency` | `money` columns: ISO code, default `AUD`. |
| `suffix` | `numeric` columns: a unit after the number (`km`). |
| `warnDays` | `due` columns: amber this many days ahead (default 30), red once past. |
| `colors`, `categories`, `colorField`, `categoryField` | `status` columns: same as on `<solid-status>`. |

| Type | Shows | Sorts by (default) |
|---|---|---|
| `text` | Text, at most two lines | `<field>.lcase` |
| `url`, `key` | Link to the document (`key` in the key style) | `<field>.lcase` |
| `status` | Coloured lozenge | `<field>.indexNum` (workflow order) |
| `priority` | Priority arrows and name | `<field>.indexNum` |
| `issueType` | Type icon and name | `<field>.name.lcase` |
| `icon` | Icon from an icon set (asset types, maintenance work…) and name | `<field>.name.lcase` |
| `user` | Avatar and name | `<field>.name.lcase` |
| `labels` | Chips | `<field>.name.lcase` |
| `date`, `datetime` | "3 days ago" (exact time on hover); date and time | `<field>` |
| `numeric`, `boolean`, `color`, `email` | Number, ✓, swatch, mail link | `<field>` |
| `money` | Amount in `currency` | `<field>` |
| `due` | "in 12 days" / "3 days ago", amber within `warnDays`, red when past (date on hover) | `<field>` |

Columns on a plain string field (not `...Rel`) sort by `<field>.lcase` whatever their type.
Formbird's index template gives every string a lower-cased `.lcase` keyword, so text sorts
case-insensitively. Every sort ends with `documentId`, so pages don't overlap when values tie.
Sorts carry `unmapped_type`, so the query stays valid when no document has the field yet.

## Notes

- **Search filters.** sc-datatables' usual `query_string` filter works, but its analyzer splits
  `TRK-12` at the hyphen, and it matches lower-cased terms against case-sensitive keywords. A
  `wildcard` with `case_insensitive: true` on `.lcase` fields is a plain "contains" match. See
  [the sample list template](../../formbird/templates/solid-issue-list.template.json).
- **Not carried over from sc-datatables:** `cellTemplate` and `handlebarsHelpers` (use a column type
  instead), per-column filters, column resizing and the column chooser. Unknown keys are ignored.
- Lists don't refresh when someone else saves. Use `showReload`, or reopen the page.

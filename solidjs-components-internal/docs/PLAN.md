# Component plan for a Jira-style app

Status: in progress, first five components built (see Status below) · 2026-11-03

> **Since then (2026-11-04):** the generic elements moved to `solidjs-components-shared`, and two were
> renamed for use beyond issues: `solid-issue-key` is now `solid-record-key` and `solid-issue-status`
> is now `solid-status`. Only `solid-issue-summary` stays in this repo. The plan below keeps the
> original names.

This is a list of candidate SolidJS custom elements for a new `git/solidjs-components/solidjs-components-internal` repo. fieldtec-web renders them from a template's `components[]`, the same way it renders any other custom component.

The list is based on the SDMS app (`git/internal-app`). SDMS is already a Jira-like tracker, with items, projects, statuses, priorities, releases and project keys, but it is built from generic `sc-*` components. Each row says what the new component would replace there.

## Status (2026-11-03)

**Built** (in this repo, verified in Chrome against the built bundles):

- `solid-issue-key`, `solid-issue-summary`, `solid-issue-status`, `solid-lookup-picker`, `solid-user-picker`
- `solid-table`: lists of documents from a filter, with typed columns and server-side sorting, paging,
  search and CSV export. It takes sc-datatables' main options; the planned navigator builds on it.
- `solid-comments`: the comment thread (sc-note-comment's data) with Markdown, replies, edits and votes.
- Foundation: the planned `core`, `ui` and `data` packages are one package, `packages/kit`, shipped as a
  single bundle every component shares. `config` is `tools/vite-config.mjs`, and `testing` is `packages/testing`.

**Decisions taken while building** (see README, "Decisions and known issues"):

1. `solid-vendor` stays in formbird-sc-components. This repo builds against its globals and its pinned
   Solid 2.0.0-rc.3 instead of shipping a second runtime.
2. The existing `solid-*` ports stay in formbird-sc-components for now.
3. Bundle path: `vendor/custom-component-modules/dist/solidjs-components/<tag>/<tag>.js`, the directory
   fieldtec-web's package installer already uses.
4. Bundles are IIFE, so pages with Monaco's AMD loader still register them.

**Demo:** `demo/` seeds a fresh fieldtec-web database, `solidjs-demo`, with this app. It includes
templates, rulesets, 9 users, 3 projects, 41 issues, boards and issue lists, and was verified in the
real host. Its lists are `solid-table`s and its comments `solid-comments`. Until there is a Solid
board, it uses the published `solid-intray-board`, which needs a demo rule to show any data (see
`demo/README.md`).

**Next P1 items:** `solid-issue-description`, `solid-issue-links`, `solid-child-issues`,
`solid-attachments`, `solid-board`, `solid-filter-bar`, `solid-issue-navigator`,
`solid-issue-create`, and the shell. `solid-board` should be written fresh on the kit rather than
starting from `solid-intray-board`: that component reads search results in the wrong shape, doesn't
save moves, and has icons only for SDMS's type names. Its grid layout and pointer-event dragging are
worth copying.

**Priority:** P1 = day-to-day issue tracking (first slice) · P2 = agile planning and reporting · P3 = later.

## How a component plugs into fieldtec-web

Every component below follows the same contract. I checked each point against fieldtec-web `main`.

- **Creation.** `ComponentService.createComponent` (`projects/services/services/component/component.service.ts`) calls `document.createElement(<componentName>)`. It then sets **properties**, not attributes: `document`, `template`, `componentDefinition`, `fieldName`, `fieldValue`, `formParameters`, `key`, `account`.
- **Loading.** The tag must equal the component document's `name`. The bundles load from the component document's `vendorLibrariesRel`: JS through loadjs, CSS as a `<link>`. If a bundle loads but never defines the tag, the host renders `ft-component-error`.
- **Services.** Components get services with `window.FormbirdServiceInjector.get('<Name>')` (`client/app/services/injector/formbird-injector.service.ts`). This app relies mostly on these:
  - `ChangedDocumentService`: write a field with `valueChanged(component, value, controlName)` and observe it with `watch(fieldName, documentId, controlName)`. Give each instance its own `controlName`, otherwise a component's own edits come back to it as external changes.
  - `SearchClientService.search({ document, filter, page, pageSize })`: Elasticsearch queries for boards and lists.
  - `DocumentModalService.openDocumentInModal(id, { defaultFields, parentDocumentId })`: a document id opens that issue; a template id opens a new issue form. `sc-help-button` already uses the template-id form.
  - `LoggedInUserService`, `DataService`, `NotificationService`, `FileProviderService`, `WebSocketService`.
- **Runtime.** Bundles externalise Solid 2.0 (`solid-js`, `@solidjs/web` and `@solidjs/element`, all `2.0.0-rc.3`) to globals that `solid-vendor.umd.js` sets. `solid-vendor.umd.js` must load before any component, and every bundle must be built against that same version.
- **Two shapes.**
  - *Field components* bind to one field of the open document (`componentDefinition.name`). Field names and lookup sources should come from `componentDefinition`, not be hard-coded (for example, no hard-coded `statusRel`). Then the same element works on SDMS Items, Release Tickets and new templates.
  - *View components* query many documents and render a board, list or chart. Their configuration comes from `componentDefinition` and their filters from fields on the host document. `solid-intray-board` already works this way.
- **Tag names are global per page.** Tags that formbird-sc-components already defines (`solid-button`, `solid-related-document`, `solid-note-comment`, `solid-intray-board`, …) can't be defined a second time. None of the names below reuse them.

## 1. Foundation packages (not custom elements)

| Package | Purpose | Start from |
|---|---|---|
| `solid-vendor` | Shared runtime UMD. Sets the `SolidJS`, `SolidJSWeb`, `SolidElement`, `TomSelect` and `esToolkit` globals | `formbird-sc-components/packages/solid-vendor` |
| `config` | Vite base config (UMD output, externals) and shared tsconfig | `packages/config` |
| `core` | Typed wrapper over `FormbirdServiceInjector`: `getService`, `valueChanged`/`watch` with a per-instance `controlName`, `search`, `setComponentVersion`. A missing service logs a warning and returns `undefined` instead of throwing | `packages/solid-utils` |
| `ui` | Internal building blocks, not registered as elements: Avatar, AvatarGroup, Lozenge, IssueTypeIcon, PriorityIcon, IssueCard, Button, Menu, Popover, Tooltip, Modal/Drawer, Tabs, InlineEdit, Combobox (`createTomSelect`), DatePicker, VirtualList, Skeleton, EmptyState, a pointer-event drag-and-drop helper (taken from `solid-intray-board`), keyboard shortcuts | `packages/solid-shared` |
| `data` | Issue query builders (project, status, assignee, sprint, labels, text), a store keyed by `documentId`, and a refresh when the `save_document` socket event arrives | new |
| `testing` | Mock `FormbirdServiceInjector`, plain-DOM preview harness, fixtures | `solidjs-test/sc-rating/preview` |

## 2. App shell and navigation

| Tag | What it does | Pri | Today |
|---|---|---|---|
| `solid-top-bar` | Global search (typing an issue key opens that issue), Create button, notifications bell, user menu | P1 | Exists on the unmerged fieldtec-web branch `30886-solid-components` (`projects/solid-top-bar`) |
| `solid-side-bar` | Project switcher and project navigation: Board, Backlog, Issues, Releases, Reports, Settings | P1 | Exists on `30886`, but has no project context |
| `solid-command-bar` | Actions for the open document | P2 | Exists on `30886` |
| `solid-issue-create` | Quick create: project, type, summary, assignee. "Open full form" opens the issue template in a modal, pre-filled through `defaultFields` | P1 | `sc-button` + rulesets |
| `solid-command-palette` | Ctrl/⌘+K: jump to an issue by key, recent issues, quick actions | P3 | none |

## 3. Issue fields (field components)

| Tag | What it does | Pri | Replaces on SDMS Item |
|---|---|---|---|
| `solid-issue-key` | Read-only key (e.g. `SDMS-123`) with a copy-link button | P1 | `sc-reference-no` (`itemRef`) |
| `solid-issue-summary` | Inline-editable title: Enter saves, Esc cancels | P1 | `sc-text-box` (`summary`) |
| `solid-issue-status` | Lozenge in the status colour. The dropdown offers only the allowed transitions and can ask for a resolution when the issue is closed | P1 | `sc-related-document` (`statusRel`) |
| `solid-lookup-picker` | Single or multi select over one lookup document type. Shows project values plus global defaults, hides inactive ones, sorts by `indexNum`. Optional icon and colour, optional create-on-type (for tags) | P1 | 7 × `sc-related-document`: `typeRel`, `priorityRel`, `severityRel`, `resolutionRel`, `categoryRel`, `reproducibilityRel`, `tagsRel` |
| `solid-user-picker` | Single or multi user select with avatars, "Assign to me" and recent users, limited to project members | P1 | `sc-related-document` (`assigneeRel`, `reporterRel`) |
| `solid-issue-description` | Markdown editor with @mentions, issue-key autolinks, and pasting an image as an attachment | P1 | `sc-markdown` (`description`, `reproduction`). Build on `solid-markdown` / `solid-editor` |
| `solid-watchers` | Watch/unwatch for the current user, watcher count and list | P2 | `sc-related-document` (`monitoringRel`) |
| `solid-parent-link` | Parent or epic picker showing key, summary and child progress | P2 | none |
| `solid-version-picker` | Fix or affects version, unreleased versions first | P2 | Release Ticket relation |
| `solid-sprint-picker` | Active or future sprint | P2 | none |
| `solid-estimate` | Story points or time estimate, with quick picks | P2 | `sc-numeric` |
| `solid-time-tracking` | Logged vs remaining bar and a "Log work" dialog | P3 | `sc-time-recorder`, `sc-timer`; reuse `sc-duration` |

**Why one `solid-lookup-picker`:** in SDMS, the Type, Priority, Severity, Resolution, Category, Reproducibility and Tag templates all have the same fields: `nameId`, `indexNum`, `isGlobalDefaultBool`, `projectRel`, `inactiveBool`. Status also has `color` and `disableItemBool` and needs transitions, so it gets its own element. None of the other lookups has an icon or colour field yet. Either add one, or map values to icons in `componentDefinition`.

## 4. Issue detail sections

| Tag | What it does | Pri | Replaces on SDMS Item |
|---|---|---|---|
| `solid-issue-links` | Links grouped by type (blocks, is blocked by, relates to, duplicates). Links are added (type + issue search) and removed inline. Each row shows key, summary and status | P1 | The whole Relationships panel, which is 5 components: `sc-related-document` (`addItemsRel`) + `sc-drop-down` (`relationshipType`) + `sc-button` (`addItemsBtn`) + `sc-datatables` (`relatedItemsDt`) + `sc-button` (`removeItemsBtn`) |
| `solid-child-issues` | Sub-tasks with status, assignee and a progress bar. A quick-add row creates a child | P1 | none |
| `solid-attachments` | Drop zone and a grid or list with thumbnails, preview, download and delete | P1 | `sc-uploader` (`fileAttachArr`) + `sc-thumbnail` (`fileAttachArrX`) |
| `solid-comments` | **Built**: Markdown, replies, edits with history, votes, stored like sc-note-comment. Next: @mentions and issue-key links | P1 | `sc-note-comment` (`notesCommentsArr`) |
| `solid-activity` | Tabs: All, Comments, History, Work log. History lists readable changes ("Status: To Do → In Progress", by whom, when) | P2 | `sc-datatables` (`docHistoryDt`, `versionHistoryDt`). Port `sc-audit-history` |
| `solid-issue-actions` | Watch, copy link, clone, move to another project, delete | P2 | `sc-button`s + rulesets |
| `solid-checklist` | Acceptance-criteria or definition-of-done checklist | P3 | `sc-check-list` |

## 5. Planning views

| Tag | What it does | Pri | Replaces in SDMS |
|---|---|---|---|
| `solid-board` | Kanban/Scrum board. Columns map to one or more statuses. Swimlanes (none, assignee, epic, priority), WIP limits, quick filters. Dragging a card changes its status or rank; clicking it opens the issue in a modal | P1 | **Items Board** (`sc-card-table`) and **Team Intrays Board** (jQuery ruleset). Build on the kit, copying the assignee × status grid and pointer-event dragging from `solid-intray-board` (see Status for why not to start from it) |
| `solid-filter-bar` | Text search plus filter chips (project, type, status, assignee, labels, dates). Writes one filter object to the document, which the board, backlog and navigator read | P1 | The separate filter fields: 12 `sc-related-document` on All Items, 8 on Team Intrays Board |
| `solid-issue-navigator` | Issue table with column chooser, sort, inline status/assignee editing, multi-select, export and saved filters | P1 | **All Items** (`sc-datatables` + those 12 filters). Build on `solid-table` (built: typed columns, server sort and paging, search, CSV) |
| `solid-backlog` | Ranked backlog plus sprint containers, with drag between them and inline create. Each sprint header shows dates, goal and points, with Start/Complete buttons | P2 | none |
| `solid-bulk-edit` | Change status, assignee, labels, sprint or project for the selected issues | P2 | **SDMS Bulk Item Updater** |
| `solid-releases` | Versions with status, dates, a done/in progress/to do bar, and a release action | P2 | **Release Listing**, **SDMS Release Tracker** |
| `solid-my-work` | Assigned to me, recently viewed, watching | P2 | **My View** (19 collapsible panels, 8 datatables) |
| `solid-timeline` | Epic roadmap: bars on a time axis, child progress, dependencies, zoom, drag to reschedule | P3 | Port `sc-gantt-chart` |
| `solid-calendar` | Issues by due date | P3 | Port `sc-calendar` |

## 6. Reports and dashboards

| Tag | What it does | Pri | Replaces in SDMS |
|---|---|---|---|
| `solid-dashboard` | Per-user grid of gadgets. Any view component can be a gadget | P2 | none |
| `solid-chart` | Issues by field (pie/bar) and created vs resolved over time | P2 | none |
| `solid-sprint-burndown` | Burndown/burnup for one sprint | P2 | none |
| `solid-velocity` | Committed vs completed per sprint | P3 | none |
| `solid-cumulative-flow` | Issues per status over time | P3 | none |
| `solid-workload` | Open issues and points per assignee | P3 | **Developer Overview** (16 datatables) |

Charts over time need a history of status changes. Rebuilding that history in the browser from document versions won't scale. Plan an Elasticsearch aggregation, or a server job that records transitions.

## 7. Notifications and collaboration

| Tag | What it does | Pri |
|---|---|---|
| `solid-notifications` | Bell and inbox: assigned to you, mentioned, a watched issue changed. Items can be marked as read | P2 |
| `solid-presence` | Avatars of other people viewing the same issue | P3 |

SDMS notifications are email only today (My View → `emailNotificationsDt`). An in-app inbox needs a notification document type and server rules that create those documents. Presence needs new socket events.

## 8. Project and admin settings

| Tag | What it does | Pri | Replaces in SDMS |
|---|---|---|---|
| `solid-workflow-editor` | Per project: statuses grouped as To Do / In Progress / Done, and the allowed transitions drawn as a graph | P2 | **New Status** (a flat list with no transitions) |
| `solid-board-settings` | Column ↔ status mapping, WIP limits, swimlanes, quick filters, card fields | P2 | none |
| `solid-project-settings` | Key, lead, default assignee, enabled issue types, categories | P3 | **New Project**, **New SDMS Project Key** |
| `solid-permission-matrix` | Roles × permissions (browse, create, edit, transition, assign, administer) and the members of each role | P3 | **SDMS Access Management**, **New Access Role** |

## 9. Reuse from formbird-sc-components (already Solid)

These existing Solid packages can be used as they are:

- `solid-panel` for the issue layout sections
- `solid-text-box`, `solid-drop-down`, `solid-check-box`, `solid-radio-list`, `solid-button`, `solid-menu`, `solid-url`
- `solid-date-time` for due, start and release dates
- `solid-related-document` as the fallback picker
- `solid-markdown`, `solid-rich-text-editor` and `solid-editor`
- `sc-duration`

Others are replaced or only a source of code:

- `solid-datatables` and `solid-note-comment`: replaced by this repo's `solid-table` (takes sc-datatables' main options) and `solid-comments` (same stored data)
- `solid-intray-board`: its grid layout and pointer-event dragging, for `solid-board`

## Gaps to plan for

1. **Shell slots.** `clientConfiguration.layout.topBarComponentName`, `sidebarComponentName` and `commandBarComponentName` exist only on unmerged branches: `30886-solid-components`, plus the `30843-*` and `32101-trial-side-top-components` branches built on it. `main` still renders the Angular top bar.
2. **Shared runtime.** `main` doesn't expose the Solid globals. Branch `18007-solid-2-exposed-vendor` does (commit `3d71273cac`). Until it's merged, each component document has to list `solid-vendor` first in `vendorLibrariesRel`, the way `solid-intray-board.json` does.
3. **Live updates.** On every insert and update, the server broadcasts `save_document` (`documentId`, `templateId`, `keyIds`) to every socket (`projects/server/socket/SocketServer.ts`). That's enough for a board to refresh one card. But `WebSocketService.removeEventListener(eventName)` calls `socket.off(eventName)` with no handler, so when a component removes its listener, the host's listeners for that event go too. The service needs a version that removes one specific handler before components use it.
4. **New data.** SDMS already has projects, project keys, item counters, types, statuses, priorities, severities, resolutions, categories, tags and releases. It has no sprints, rank field, workflow transitions, parent/epic hierarchy, story points, work logs or in-app notifications.
5. **Bundle paths.** Three conventions are in use:
   - component documents point at `vendor/sc-components/<name>/<name>.umd.js`
   - `ANGULAR-TO-SOLID-PROMPT.md` deploys to `vendor/custom-component-modules/dist/solid-elements/<name>/`
   - branch 30843 used `vendor/solid-elements/<name>/<name>.js`

   fieldtec-web's package installer writes to `server/public/vendor/custom-component-modules/` (`projects/server/utils/UtilPackage.ts`). Pick one convention for the new repo.

## Decisions before scaffolding

1. **Who owns `solid-vendor`.** Both repos have to share one Solid runtime at one version. Either move `solid-vendor`, `config`, `solid-utils` and `solid-shared` into `solidjs-components-internal` and have formbird-sc-components use them from there, or do the reverse. With two copies, you get either two runtimes on one page or versions that silently drift apart.
2. **Where the existing Solid ports live.** The ~20 `solid-*` packages can stay in formbird-sc-components, or move so that all Solid code is in one repo.
3. **Bundle path** (gap 5).

## Suggested first slice

1. Foundation: `solid-vendor`, `config`, `core`, `ui`, `testing`.
2. `solid-issue-status`, `solid-lookup-picker`, `solid-user-picker`. These three replace 10 `sc-related-document` fields on the SDMS Item form.
3. `solid-board`, `solid-filter-bar`, `solid-issue-navigator`.
4. `solid-issue-links`, `solid-attachments`.

Each of these can go into a copy of the SDMS New Item or Items Board template. That way they can be tested against real data before any new entity (sprint, workflow) exists.

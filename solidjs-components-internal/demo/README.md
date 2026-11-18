# Jira-style demo database

A fresh Formbird database, **`solidjs-demo`** (Mongo database + Elasticsearch index), holding a small
issue tracker built on this repo's and solidjs-components-shared's elements: 3 projects, 41 issues, 9 people, a workflow,
boards and issue lists.

## Sign in

Everyone's password is **`Demo1234!`**.

| Email | Name | Role |
|---|---|---|
| alex.morgan@example.com | Alex Morgan | Engineering Manager. Also sees the **Admin** menu |
| priya.natarajan@example.com | Priya Natarajan | Mobile Lead |
| sam.okafor@example.com | Sam Okafor | Web Platform Lead |
| mei.chen@example.com | Mei Chen | QA Engineer |
| lucas.ferreira@example.com | Lucas Ferreira | Product Designer |
| hana.kobayashi@example.com | Hana Kobayashi | Product Manager |
| tom.becker@example.com | Tom Becker | Support Lead |
| aisha.rahman@example.com | Aisha Rahman | Backend Engineer |
| noah.williams@example.com | Noah Williams | Frontend Engineer |

## What's in it

**Pages (menu):**
- **Your work** (home): assigned to me, reported by me, watching, recently updated.
- **Boards:** all projects, plus one board per project.
- **All issues:** sortable columns, search (key, summary, description and comments), CSV export.
- **Create issue.**
- **Projects:** each project's issues and team.
- **Admin** (Alex only): statuses, issue types, priorities, resolutions, labels, new project, the issue template, the three rulesets, the configuration document.

Every list is a `<solid-table>`: the four on Your work, All issues, a project's issues and team, and the
admin lookup lists. Sorting and paging run in Elasticsearch.

**Issue form.** Key, summary, status, project, type, priority, assignee, reporter, resolution, labels,
watchers and the Activity thread (`<solid-comments>`: Markdown, replies, edits, thumbs up) use the
Solid elements (`solid-issue-summary` from this repo, the rest from solidjs-components-shared). Story points and the description (markdown) use the published Angular `sc-*`
components. Comments are saved with the issue, like any other field. Keys are `TRK-n`, assigned on first save by
fieldtec-web's built-in Reference No preprocessor from a counter document.

**Workflow.** To Do → In Progress → In Review → Done, plus Won't Do. The status picker offers only
these moves (`transitions` in the template):

| From | To |
|---|---|
| To Do | In Progress, Won't Do |
| In Progress | To Do, In Review, Done |
| In Review | In Progress, Done |
| Done | In Progress |
| Won't Do | To Do |

Moving into Done or Won't Do asks for a resolution.

**Rules (rulesets in the database):**
- **Tracker Issue - Client** runs on pre-render, load and field change:
  - A new issue gets the creator as reporter, and starts as a Medium Task in To Do.
  - Assignee and watchers only list people on the issue's project.
  - "Won't Do" makes the issue read-only.
- **Tracker Issue - PreSaveServer** runs before every save, including board moves:
  - Sets created/updated dates and who made them.
  - A finished issue always gets a resolution and a resolved date; reopening clears both.
- **Tracker Board - Client** loads the board's data and saves cards dragged to another column (status) or another person (assignee).

**Access.** Projects, issues and lookups have no access keys, so every signed-in user can read and edit
them. Password and permission documents carry an admin-only key. Separately, fieldtec-web never serves
password documents to browsers.

**Data model.** The data model is SDMS's: same field names (`statusRel`, `assigneeRel`, `itemRef`…)
and the same `appTags` (`sdms` plus `item`, `status`, …). That's why the published
`solid-intray-board` and SDMS-style rules work on it.

**Platform documents** (template editor, account templates, ruleset editor, `sc-*` component
documents…) come from solidjs-components-shared's `packages/platform/core/`. That folder is a
sanitized snapshot of the local `fieldtec-test` and `internal-5` databases, taken by
`extract-core.mjs`.

## Run it

Prerequisites and options are in the root README, under
["Set up the database"](../README.md#set-up-the-database). From the repo root:

```sh
pnpm db:setup        # builds the bundles, copies them into fieldtec-web, writes its server config,
                     # creates ONLY db + index "solidjs-demo" and flushes Redis db 1
pnpm db:setup --reset   # re-seed: drop and recreate them
pnpm demo:server     # http://localhost:3000
```

- **The setup is guarded.** It refuses to touch `formbird`, `fieldtec-test`, `internal-5` and
  `clarity-dev`, and needs `--reset` to replace a populated demo database. Use `--db` for another name.
- **The setup builds and deploys first.** Component documents load bundles by content hash
  (`?v=…`), so the database and the deployed files must come from the same build.
- **Restart the server after re-seeding.** Each seed writes a new session secret.
- **After re-seeding, sign in and reload once more.** fieldtec-web's service worker serves component
  documents from its cache first and refreshes them in the background. The first page load can still
  use the previous build.
- **If a field says it "needs a newer solidjs-components-kit.js"**, the browser is running an old kit
  from the service worker's cache. Reload. If the message stays, clear the site's data for
  `localhost:3000` (DevTools → Application → Storage → Clear site data).
- **The first visit to each page takes a few seconds.** The `sc-*` components and the Solid 2 runtime
  (`solid-vendor`) load from jsDelivr (`@formbird/angular-elements` 8.5.9 and 8.5.11).

## Known issues found while building this

1. **The published `solid-intray-board` (8.5.11) shows an empty board on its own.** It reads search
   results as `hits.hits[]` documents, but fieldtec-web returns `data.hits.hits[]._source`, so it
   reports "No status columns configured". The board rule loads the statuses and issues itself and
   sets them as the element's `statusColumns` / `items`. The fix belongs in formbird-sc-components'
   `packages/solid-intray-board` (`loadBoardData`).

   Its card icons only cover SDMS's type names (Bug, Feature, Change Request…), and other types get a
   "?". The rule therefore gives each card the nearest SDMS type: Story shows as Feature, Task as Change Request,
   Improvement as Suggestion and Epic as Documentation. Only the icon changes. A move re-reads the
   stored issue, so the substitute type is never saved.
2. **This fieldtec-web checkout loads the wrong server dependencies.** Its root `node_modules`
   contains plain-directory copies of `mongodb` 4.11.0 and `express` 4.17.1, which pnpm doesn't
   manage. The built server loads them instead of the versions `projects/server` declares (7.4.0 and
   5.2.1). With them:
   - creating any document that has a Reference No field crashes the server;
   - links such as `/form/<id>` return 404.

   `pnpm demo:server` works around it by preloading solidjs-components-shared's `packages/platform/server-deps.cjs`, which resolves the
   declared versions. The real fix is in that checkout: remove the stray copies. Check the root gulp
   tasks first, since `gulp test-setup` loads `mongodb` from the root.
3. **`sc-markdown` (8.5.9) logs an error when it is disabled early.** The message is
   `showHideControlSwitch … reading 'shadowRoot'`; it appears when its `enabled` flag is set before
   its editor has rendered. You'll see it when opening a Won't Do issue. It's harmless.

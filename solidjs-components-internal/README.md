# solidjs-components-internal

A Jira-style issue tracker on Formbird (fieldtec-web), for the internal SDMS app (`git/internal-app`).
It is built from SolidJS custom elements. They drop into a template's `components[]` like any `sc-*`
component and read and write the same data. That means they can replace `sc-related-document`,
`sc-datatables`, `sc-note-comment` and friends on existing SDMS templates.

This repo holds the tracker's own element and its demo database. The generic elements, the kit they
are built on, and the build, test and seed tooling are in
[solidjs-components-shared](../solidjs-components-shared/README.md), which this repo links to.

| Element | Replaces on SDMS Item | What it adds | Lives in |
|---|---|---|---|
| [`<solid-issue-summary>`](components/issue-summary/README.md) | `sc-text-box` (summary) | Inline title editing, length counter | this repo |
| [`<solid-record-key>`](../solidjs-components-shared/components/record-key/README.md) | `sc-reference-no` (`itemRef`) | Type icon, copy link, "New issue" before the first save | shared |
| [`<solid-status>`](../solidjs-components-shared/components/status/README.md) | `sc-related-document` (`statusRel`) | Coloured status, allowed transitions only, resolution step | shared |
| [`<solid-lookup-picker>`](../solidjs-components-shared/components/lookup-picker/README.md) | `sc-related-document` (type, priority, severity, labels…) | Type and priority icons, coloured label chips | shared |
| [`<solid-user-picker>`](../solidjs-components-shared/components/user-picker/README.md) | `sc-related-document` (assignee, reporter, watchers) | Avatars, emails, "Assign to me" | shared |
| [`<solid-comments>`](../solidjs-components-shared/components/comments/README.md) | `sc-note-comment` (`notesCommentsArr`) | Safe Markdown, replies, edit history, votes | shared |
| [`<solid-table>`](../solidjs-components-shared/components/table/README.md) | `sc-datatables` (issue lists, people, lookups) | Typed columns, sorting and paging in Elasticsearch, search, CSV export | shared |

The candidate list for the rest of the app is in [docs/PLAN.md](docs/PLAN.md).

**Demo:** [demo/](demo/README.md) seeds a fieldtec-web database, `solidjs-demo`, with the tracker. It
has templates, rules, 9 users, 3 projects, 41 issues, boards and issue lists.

## Set up the database

`pnpm db:setup` ([setup-db.mjs](setup-db.mjs)) creates a fieldtec-web database, `solidjs-demo`,
holding everything the tracker needs:

| | |
|---|---|
| **Templates** | Issue, Project, Board, Your work, All issues, the issue counter, and the lookups (Status, Issue type, Priority, Resolution, Label). Also the platform templates fieldtec-web needs: accounts, rulesets, password reset, and the template and component editors. |
| **Rulesets** | Tracker Issue - Client, Tracker Issue - PreSaveServer, Tracker Board - Client. Also fieldtec-web's five standard rulesets and two ruleset includes. |
| **Component documents** | The elements above, `solid-intray-board`, and the `sc-*` components the templates and editors use. |
| **Data** | 9 users, 3 projects, 41 issues with comments, boards, the lookup values, and the configuration document. |

### You need

- Node.js 22 or newer, and pnpm (`corepack enable`).
- `solidjs-components-shared` and this repo checked out side by side in one folder, with
  `fieldtec-web` beside that folder, for example `~/git/solidjs-components/` and
  `~/git/fieldtec-web` (see the [shared README](../solidjs-components-shared/README.md)).
- fieldtec-web's server, built: `(cd ../../fieldtec-web/projects/server && node build.mjs)`.
- MongoDB (a replica set), Elasticsearch and Redis, running at the hosts in
  `../../fieldtec-web/server/config/development.json`. Locally, that's
  `~/dev/core-setup-docker/mongo-elastic-setup/init.sh`.
- Internet access in the browser. The `sc-*` components and the Solid 2 runtime load from jsDelivr.

### Steps

```sh
cd ~/git/solidjs-components/solidjs-components-internal
pnpm db:setup        # creates the database and Elasticsearch index "solidjs-demo"
pnpm demo:server     # runs fieldtec-web on it: http://localhost:3000
```

Sign in as `alex.morgan@example.com` (an admin) or anyone in [demo/README.md](demo/README.md).
Every password is `Demo1234!`.

`pnpm db:setup` runs these steps (described in the
[shared README](../solidjs-components-shared/README.md#building-an-app-on-it)), and stops with what
to fix if one fails:
1. Installs dependencies.
2. Checks fieldtec-web and the services.
3. Builds the shared and internal elements.
4. Copies the bundles into fieldtec-web.
5. Writes fieldtec-web's server config, `server/config/solid-demo.json`: port 3000, Redis database 1.
6. Seeds the database and index, then flushes Redis database 1.

| Command | What it does |
|---|---|
| `pnpm db:setup --reset` | Replaces an existing demo database. Anything changed in the app is lost. |
| `pnpm db:setup --db <name>` | Uses another database and index name. `solid-demo.json` then points at that name. |
| `pnpm db:setup --help` | Prints the options. |

- **Restart `pnpm demo:server` after a re-seed.** Each seed writes a new session secret.
- **Sign in, then reload the page once more.** fieldtec-web's service worker can serve the previous
  build's component documents on the first load.
- **Flushing Redis database 1 signs everyone out of this demo.** It drops the templates and rules
  fieldtec-web cached from an earlier seed. The fleet demo uses database 2, so it isn't affected.
- **The setup never touches existing application databases:** `formbird`, `fieldtec-test`,
  `internal-5` and `clarity-dev`.

## Layout

```
components/issue-summary/   <solid-issue-summary>
demo/lib/                   the tracker's documents: model (ids), catalog (lookups, people, projects),
                            issues, templates, rules; build.mjs puts them together for the seed
demo/server.mjs             runs fieldtec-web on the demo (pnpm demo:server)
setup-db.mjs                one-command database setup (pnpm db:setup)
test/browser.mjs            browser test of the built bundles
docs/PLAN.md                candidate elements for the rest of SDMS
```

## Commands

```sh
pnpm install
pnpm typecheck
pnpm test:browser    # builds shared and this repo, then drives the BUILT bundles in Chrome (13 checks)
pnpm check           # both
pnpm build           # dist/<name>/<name>.js (with shared's)
pnpm docs            # build, then write formbird/components/*.component.json (URLs carry content hashes)
pnpm deploy:fieldtec --dry-run   # copy the bundles into fieldtec-web (drop --dry-run to copy)
pnpm db:setup        # build, copy into fieldtec-web, create the demo database (--reset to replace it)
pnpm demo:server     # run fieldtec-web on it: http://localhost:3000
```

The shared elements are tested in solidjs-components-shared (`pnpm check` there). How the elements
run inside fieldtec-web, styling, and the known platform issues are in the
[shared README](../solidjs-components-shared/README.md#how-elements-run-in-fieldtec-web).

## Adding an element

1. Copy `components/issue-summary`, and set `name` and `formbird.tag` in its `package.json`.
2. Register the component in `src/main.tsx` with
   `defineFormbirdElement(tag, Component, { version, styles })`.
3. Build it on the kit:
   - `createFieldBinding` for the value;
   - `createSearchOptions` for lookups;
   - `FieldShell`, `Popover`, `PickerPanel` and the like for the UI.

   Anything another app could use belongs in solidjs-components-shared, as a kit piece or a generic
   element.
4. Add it to a template in `demo/lib/templates.mjs` and to `test/browser.mjs`.
5. Run `pnpm check`, then `pnpm db:setup --reset`.

`<solid-record-key>` is display-only. The number is generated on first save by fieldtec-web's
`ReferenceNoPreprocessor`, which runs when the definition has `"type": "Reference No"`.

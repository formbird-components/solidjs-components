# solidjs-components-shared

The common base for SolidJS custom elements on Formbird (fieldtec-web). It holds:
- the **kit**, the runtime every element is built on;
- the **generic elements** any app can put on a template;
- the **tooling** that builds, tests and deploys elements (the `solid-components` command);
- the **platform** that seeds a demo database and runs fieldtec-web on it.

Apps live in their own repos and link to this one:

| Repo | What it is | Demo database | Demo URL | Redis db |
|---|---|---|---|---|
| **solidjs-components-shared** (this repo) | Kit, generic elements, tooling, platform | none | preview gallery on http://localhost:5180 | |
| [solidjs-components-internal](../solidjs-components-internal/README.md) | Jira-style issue tracker for the internal SDMS app | `solidjs-demo` | http://localhost:3000 | 1 |
| [solidjs-components-fleet](../solidjs-components-fleet/README.md) | Fleet and asset management: bookings, workshop, Daily Driver checks, maps | `solidjs-fleet-demo` | http://localhost:3001 | 2 |
| [solidjs-components-whs](../solidjs-components-whs/README.md) | Work health and safety: incidents, hazards, corrective actions, inspections | `solidjs-whs-demo` | http://localhost:3002 | 3 |
| [solidjs-components-hr](../solidjs-components-hr/README.md) | HR: leave with balances and approvals, certificates, onboarding, the org chart | `solidjs-hr-demo` | http://localhost:3004 | 5 |

Check out all of them side by side in one folder. The repos find each other by relative path, and
find fieldtec-web beside that folder (or beside any folder above it; `FIELDTEC_WEB=/path` overrides):

```
~/git/fieldtec-web
~/git/solidjs-components/
  APP-IDEAS.md                    other apps this base suits, and the elements each would need
  solidjs-components-shared/
  solidjs-components-internal/
  solidjs-components-fleet/
  solidjs-components-whs/
  solidjs-components-hr/
```

Port 3003 and Redis database 4 are taken by `react-internal` (a React front end on another database).

## Elements

| Element | Replaces | What it adds |
|---|---|---|
| [`<solid-status>`](components/status/README.md) | `sc-related-document` on a status field | Coloured status, only the allowed transitions, an optional second step (resolution, cancellation reason), moves restricted by access key |
| [`<solid-record-key>`](components/record-key/README.md) | `sc-reference-no` | Reference number with type icon and copy link, "New …" before the first save |
| [`<solid-lookup-picker>`](components/lookup-picker/README.md) | `sc-related-document` on lookups | Icons for types, priorities, asset types and work types; coloured label chips |
| [`<solid-user-picker>`](components/user-picker/README.md) | `sc-related-document` on people | Avatars, emails, "Assign to me" |
| [`<solid-table>`](components/table/README.md) | `sc-datatables` | Typed columns (status, priority, people, icons, money, due dates…), sorting and paging in Elasticsearch, search, CSV export |
| [`<solid-comments>`](components/comments/README.md) | `sc-note-comment` | Safe Markdown, replies, edit history, votes |
| [`<solid-map>`](components/map/README.md) | the `sc-*` mapping components | OpenLayers map of live searches (icons or markers in a status colour, boundaries, popups with actions), or a record's own point or boundary to set |
| [`<solid-checklist>`](components/checklist/README.md) | `sc-check-list` | Check sheets answered Pass / Fail / N/A, grouped, with comments on failures and the sheet's result; or the checks themselves, edited |
| [`<solid-stat-tiles>`](components/stat-tiles/README.md) | | Dashboard tiles: live counts, or days since the latest match, with tones and links |
| [`<solid-photo-capture>`](components/photo-capture/README.md) | `sc-uploader` for photos | Photos taken or uploaded, downscaled, captioned, in a gallery with a lightbox |
| [`<solid-image-pins>`](components/image-pins/README.md) | | Numbered pins on an image: a built-in body map (front and back, named regions), a floor plan or a drawing |
| [`<solid-date-range>`](components/date-range/README.md) | two `sc-date-time` fields | Start and end with quick durations and the time range rules; or, in days mode, first and last day, half days and working days without weekends and public holidays |
| [`<solid-approval-chain>`](components/approval-chain/README.md) | | Who approves a record, in order: approve or reject with a comment, hand a step to someone else; the rules check every decision against the saved version |
| [`<solid-resource-schedule>`](components/resource-schedule/README.md) | | People or assets by day: records as bars, groups with who is left against a minimum, figures per row, drag across free days to start a record |

App-specific elements stay in their app's repo: `solid-issue-summary` in internal; the booking
calendar, line items and others in fleet; the risk matrix, five whys and corrective actions in whs;
the leave balance, skills matrix and org chart in hr. An element moves here when a second app needs
it: the map, checklist and stat tiles came from fleet when the safety app needed them, and the date
range when the HR app did. The approval chain and the resource schedule were built here for the HR
app, because several of the apps in APP-IDEAS.md need them; the HR app's browser test drives them.

## Layout

```
packages/kit/           the runtime: Formbird bindings, search, design tokens, UI primitives, icons.
                        One bundle (solidjs-components-kit.js) shared by every element on the page.
packages/testing/       in-memory fieldtec-web host and fixtures, for the preview and the tests
packages/solid-runtime/ TEST ONLY: Solid 2 globals for testing built bundles; never deployed
packages/tools/         the solid-components command: Vite/Vitest/tsc config, browser-test harness,
                        component documents, deploy
packages/platform/      demo databases: document builders, seeding, fieldtec-web config and server,
                        the one-command setup, core/ (fieldtec-web's own templates and rulesets),
                        and what every app's demo uses: form-parts (template building blocks),
                        rules (ruleset scaffolding), seed-kit (generating records) and e2e (the
                        end-to-end rules test harness)
packages/test-openlayers/  TEST ONLY: OpenLayers as the page global `OL`, as openlayers-shared provides
components/*/           the generic elements, one per folder
apps/preview/           gallery of the elements against the in-memory host (pnpm dev)
test/browser.mjs        browser test of the built bundles
```

Code that two elements need goes in the kit. An element holds only what is specific to it: the
pickers are about 1 kB each because selection, search, popovers, chips and validation live in the
kit's `RelatedPicker`.

## Commands

```sh
pnpm install
pnpm dev            # gallery on http://localhost:5180: dark mode, simulated rulesets, host writes
pnpm typecheck
pnpm test           # unit tests: filters, workflow rules, icon mapping, mock Elasticsearch, map geometry, photos, body map, time ranges and working days, approval chains, schedule maths (181)
pnpm test:browser   # builds, then drives the BUILT bundles in Chrome (127 checks)
pnpm check          # all three
pnpm build          # dist/<name>/<name>.js
```

Each app repo runs the same commands on its own elements through the `solid-components` command, so
it needs no build tooling of its own:

```
solid-components build [--with-shared] [--test-assets]   build this repo's elements (and the kit, here)
solid-components typecheck                               tsc on this repo
solid-components test                                    unit tests (Vitest)
solid-components browser-test                            drive the built bundles in Chrome (test/browser.mjs)
solid-components dev                                     preview gallery (apps/preview)
solid-components deploy [--dry-run]                      copy shared's and this repo's bundles into fieldtec-web
solid-components docs                                    write formbird/components/<tag>.component.json
```

The browser tests use the system Chrome (`CHROME=/path/to/chrome` to change it).

## Building an app on it

An app repo is the internal or fleet repo's shape:

- **`package.json`**:
  - devDependencies `@solidjs-components/tools` and `@solidjs-components/platform` as
    `link:../solidjs-components-shared/packages/…`;
  - scripts that call `solid-components`;
  - an optional `solidComponents` block:
    - `browserTest`: the spec file;
    - `previewPort`: the dev gallery's port;
    - `testBundles`: extra test-only bundles, such as an app's fixtures.
- **`tsconfig.json`** extends `../solidjs-components-shared/tsconfig.base.json`, which maps the kit,
  Solid and Vitest to this repo.
- **`components/<name>/`** holds the element:
  - `package.json` sets `formbird.tag`, and `formbird.vendorLibraries` for any library the page must
    load first. A `cdn:` prefix means the published `@formbird/angular-elements` on jsDelivr.
  - `src/main.tsx` registers the element with the kit's `defineFormbirdElement`.
- **Tests:**
  - unit tests go in `packages/*/test`, `components/*/test` or `demo/test`;
  - the browser spec, `test/browser.mjs`, lists components, setup scripts and checks;
  - the harness does the loading, registration and console checks.
- **`demo/lib/build.mjs`** exports `buildDemo({ now, urlRoot })`, which returns
  `{ documents, people, urls, password }`. Use the platform's `DocumentSet` for templates, rulesets,
  accounts, the configuration and the platform documents, and:
  - `@solidjs-components/platform/form-parts`: filters as definitions write them (`q`, `query`,
    `term`…), the standard fields, pickers, tables, panels and page headers, and `appParts(app)` for
    the app's lookups, statuses and `appTags`;
  - `@solidjs-components/platform/rules`: `rulesetDsl` (with the async-callback guard),
    `COMMON_LIB` (search, update, create, status transitions, authorship…), `functionsLib` to carry
    the app's logic functions as source, and `clientPreSave`;
  - `@solidjs-components/platform/seed-kit`: a seeded random generator, company wall-clock time
    around "now", GeoJSON, and `appDocuments` for records, lookups and statuses;
  - `@solidjs-components/platform/e2e`: `connectDemo` signs in as demo people, saves through the API
    and reads MongoDB, for `demo/test/e2e.mjs`.
- **`setup-db.mjs`** calls `runSetup({ appRoot, title, db, config, port, redisDb, buildModule })`.
- **`demo/server.mjs`** calls `startServer({ name, log? })`.

`pnpm db:setup` in an app then runs these steps, and stops with what to fix if one fails:

1. Installs dependencies in shared, then in the app.
2. Checks fieldtec-web, MongoDB, Elasticsearch and Redis. Stops if the database already has documents
   (`--reset` replaces it).
3. Builds shared's and the app's bundles.
4. Copies them into fieldtec-web's `server/public/vendor/custom-component-modules/dist/solidjs-components/`.
5. Writes `server/config/<config>.json`. It is a copy of `development.json` with the demo's
   database, index, port and Redis database, and email/password sign-in.
6. Builds the documents, writes them to MongoDB and Elasticsearch, and flushes the demo's Redis
   database.

The seed:
- refuses `formbird`, `fieldtec-test`, `internal-5`, `clarity-dev` and the system databases;
- refuses documents whose fields would get conflicting Elasticsearch mappings (a field that is
  text in one document and an object or number in another). Such a document fails to index, and
  silently disappears from every search.

## How elements run in fieldtec-web

fieldtec-web creates an element by its component document's `name`, and sets these as properties:
`document`, `template`, `componentDefinition`, `fieldName`, `fieldValue` and `formParameters`.
It loads `vendorLibrariesRel` files in order, as classic scripts:

1. `solid-vendor.umd.js` from `@formbird/angular-elements@8.5.11` on jsDelivr. It sets `SolidJS`,
   `SolidJSWeb` and `SolidElement` (Solid **2**).
2. Any library the element declares, for example `openlayers-shared` (sets `OL`) for the map.
3. `solidjs-components-kit.js`, which sets `SolidJsComponentsKit`.
4. `<tag>.js`, which defines the element.

What every element gets from the kit (`createFieldBinding`, `defineFormbirdElement`):

- **Writes** go through `ChangedDocumentService.notifyValueChanged`, with a control name per
  instance. fieldtec-web echoes a change back to every watcher of the field, the source included,
  so the binding ignores values equal to what it already holds.
- **Ruleset changes** arrive through `watchComponentDef` and update the element live:
  `ntf.scope.setFilter`, enable and disable, and mandatory. Filters can be
  template strings (single quotes, Handlebars) or objects.
- **Validation** mirrors `<ft-validation-display>`. It uses `ValidationService` state, refreshed on
  the `document:validateFormFields` broadcast.
- **Styles** live in a shadow root, isolated from Angular Material. The kit stylesheet is one
  `CSSStyleSheet` shared by every element on the page. **Dark mode** follows `body.dark-theme`.
- **Shared helpers:**
  - `searchPage`: paged Elasticsearch search with totals;
  - `fetchDocuments`;
  - `openNewDocument(templateId, values)`: a new form with fields filled in, as `ft3.openNewDocument`
    does; `runAction` for record actions ("Book", "Report a hazard here") built on it;
  - `createDocument(templateId, values)`: saves a new record through fieldtec-web's DataService, so
    the server's rules run (a refusal rejects with the rule's message);
  - `uploadFile(file, owner)` and `fileSource(file)`: uploads through fieldtec-web's
    FileProviderService, which stores the file and creates the file reference document
    `api/getFile/<fileNo>` serves it from. Every demo's configuration sets `fileUploader` (the
    "Document Reference" template, allowed types) and `fileStorage` (fieldtec-web's `files/`);
  - `checklistOutcome`: what a check sheet comes to (the checklist and the apps' rulesets share it);
  - `timeRangeProblems`, `workingDays`, `dayKey`, `dayStart`: time ranges, and days in a time zone
    counted in working days (the date range, fleet's booking rules and HR's leave rules share them);
  - `approvalStatus`, `canDecide`, `approvalProblems`, `mergeApprovalChain`: approval chains (the
    approval chain element and the apps' rulesets share them);
  - local-time helpers for calendars (`startOfDay`, `addDays`, `rangeLabel`…);
  - safe Markdown;
  - date, number and money formatting;
  - status colours;
  - icon sets for issue types, priorities, asset types and work types.

### Styling

Tokens are CSS custom properties on each element's `:host` (`packages/kit/src/styles/kit.css`).
Custom properties inherit into shadow roots, so a page can rebrand every element from outside:

```css
body {
  --sj-theme-accent: #5b47e0;       /* light theme accent */
  --sj-theme-accent-dark: #9a8bff;  /* dark theme accent */
  --sj-theme-font: 'Inter', system-ui, sans-serif;
}
```

Status and lozenge colours come from one value (`--sj-lozenge`) mixed with `color-mix()`, so a
stored status colour works in both themes.

### Solid 2 rules that bite

- Don't read signals in a component body outside JSX or memos. Use `untrack` for one-off reads; the
  dev build warns about these.
- `createEffect(compute, apply)`: track in `compute`, and keep reads in `apply` deliberate
  (`untrack`). `apply` can't be async; call an async function from it instead.
- There is no `onMount`. Use `onSettled`, which may return a cleanup.
- A `ref` callback must not return a value: Solid 2 treats it as a cleanup.
- Signal writes apply on the next flush. Call `flush()` before touching the new DOM.
- Attributes use their HTML names: `inputmode`, not `inputMode`.

## Decisions and known issues

- **Solid 2.0.0-rc.3** is pinned in `pnpm-workspace.yaml`, with the exact compiler chain
  formbird-sc-components' lockfile resolved. The bundles run on that repo's `solid-vendor`.
- **Component documents load the published `solid-vendor`, not fieldtec-web's local copy.** The copy
  under `server/public/vendor/custom-component-modules/dist/solid-vendor/` is an old **Solid 1.9**
  build.
- **Bundles are IIFE, not UMD.** On a page that has an AMD loader (Monaco's), a UMD bundle hands
  itself to the loader and never registers. The browser test keeps an AMD `define` on the page to
  catch this.
- **Bundle URLs carry a content hash (`?v=…`).** fieldtec-web's service worker serves everything under
  `/vendor/custom-component-modules/` cache-first and never revalidates. Two consequences:
  - Component documents must come from the same build as the deployed files. `pnpm db:setup` builds,
    deploys and seeds in one step.
  - Each element checks the page's kit for what it imports. If the kit is stale, the element says so
    instead of rendering nothing.

  After a new build, the first page load can still use the previous one, because the service worker
  also serves component documents stale-while-revalidate. Reload once more.
- **fieldtec-web's Reference No format replaces `YY`, `MM` and `DD` with the date.** A counter
  prefix such as `DD-#` becomes `04-38`; fleet's Daily Driver checks are `CHK-#` for this reason.
- **An exception in an asynchronous server rule stops fieldtec-web.** A throw inside a rule's
  callback becomes an unhandled rejection, and the server shuts down. Wrap async rule code; the fleet
  rulesets' `once`/`guard` helpers show one way.
- **fieldtec-web answers a refused update (PUT) with a generic "Error updating document".** Only a
  refused insert carries the rule's message. Run the same validation in a client PreSave rule so
  people see the reason; the fleet rulesets do this.
- **This fieldtec-web checkout's root `node_modules` holds stray `mongodb` 4.11 and `express` 4.17
  copies.** They crash the server on Reference No fields and make `/form/<id>` return 404.
  `startServer` preloads `server-deps.cjs`, which resolves the versions `projects/server` declares.

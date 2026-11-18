# solidjs-components-fleet

A fleet and asset management app on Formbird (fieldtec-web), built with SolidJS custom elements. It
covers:
- **booking** vehicles and plant from a calendar;
- **Daily Driver** pre-start checks;
- **workshop** requests and work orders, with parts and labour;
- **preventive maintenance** on service plans;
- **fuel**;
- the asset register, **on a map**.

The workflows and their wording follow Formbird FLEET: Asset Reserved → Hire Commenced, Pending →
Open → Drop Off, Available For Hire / On Hire, "Tracker Device Must Be Unique"…

This repo holds the fleet elements and a demo database, `solidjs-fleet-demo`. The generic elements
(status, reference number, pickers, tables, comments, and the map, checklist and stat tiles that
started here), the kit and the tooling are in
[solidjs-components-shared](../solidjs-components-shared/README.md), which this repo links to.

| Element | Lives in | What it does |
|---|---|---|
| [`<solid-booking-calendar>`](components/booking-calendar/README.md) | this repo | The booking calendar. It shows assets by location, day or week, bookings by status, Hire Overdue and workshop block-outs. Drag across free time to book. On a booking form it is an availability assistant: clashes, and free assets to pick instead. |
| [`<solid-map>`](../solidjs-components-shared/components/map/README.md) | shared | OpenLayers map. Layers show live searches (assets by type and hire status, sites with their boundaries) with popups and actions. Point and area modes edit a location or a boundary. |
| [`<solid-stat-tiles>`](../solidjs-components-shared/components/stat-tiles/README.md) | shared | Dashboard tiles. Each is a live Elasticsearch count with a tone and a link to the list behind it. |
| [`<solid-asset-summary>`](components/asset-summary/README.md) | this repo | An asset's header: lifecycle and hire status, meter, next service, registration, and quick actions (Book, Daily Driver, Report a fault). |
| [`<solid-date-range>`](components/date-range/README.md) | this repo | Start and end, with quick durations and the booking time rules. |
| [`<solid-meter-reading>`](components/meter-reading/README.md) | this repo | Odometer or engine hours, checked against the asset's meter and the start reading. |
| [`<solid-checklist>`](../solidjs-components-shared/components/checklist/README.md) | shared | A check sheet answered Pass / Fail / N/A with comments (Daily Driver, service checks), or edited (check sheets, service plans). |
| [`<solid-line-items>`](components/line-items/README.md) | this repo | A work order's parts (from the materials list) and labour, with GST and totals. |

The booking, Daily Driver, request and work order logic lives in `packages/fleet-kit`:
- hire cost;
- clashes;
- meter checks;
- totals;
- next service due.

The checklist outcome is in shared's kit, with the checklist element.

The elements import these functions. The server rulesets embed the same functions' source, so a
booking costs the same in the form as in the database.

## Set up the database

### You need

- Node.js 22 or newer, and pnpm (`corepack enable`).
- `solidjs-components-shared` and this repo checked out side by side in one folder, with
  `fieldtec-web` beside that folder, for example `~/git/solidjs-components/` and
  `~/git/fieldtec-web` (see the [shared README](../solidjs-components-shared/README.md)).
- fieldtec-web's server, built: `(cd ../../fieldtec-web/projects/server && node build.mjs)`.
- MongoDB (a replica set), Elasticsearch and Redis, running at the hosts in
  `../../fieldtec-web/server/config/development.json`. Locally, that's
  `~/dev/core-setup-docker/mongo-elastic-setup/init.sh`.
- Internet access in the browser. The `sc-*` components, the Solid 2 runtime and OpenLayers load from
  jsDelivr, and map tiles come from OpenStreetMap.

### Steps

```sh
cd ~/git/solidjs-components/solidjs-components-fleet
pnpm db:setup        # creates the database and Elasticsearch index "solidjs-fleet-demo"
pnpm demo:server     # runs fieldtec-web on it: http://localhost:3001
```

Sign in as `olivia.bennett@example.com` (Fleet Administrator) or anyone below. Every password is
`Fleet1234!`.

`pnpm db:setup` ([setup-db.mjs](setup-db.mjs)) runs the steps described in the
[shared README](../solidjs-components-shared/README.md#building-an-app-on-it), and stops with what to
fix if one fails:
1. Installs dependencies.
2. Checks fieldtec-web and the services.
3. Builds the elements.
4. Copies them into fieldtec-web.
5. Writes `server/config/solid-fleet.json`: port 3001, Redis database 2.
6. Seeds the database, then flushes Redis database 2.

| Command | What it does |
|---|---|
| `pnpm db:setup --reset` | Replaces an existing demo database. Anything changed in the app is lost. |
| `pnpm db:setup --db <name>` | Uses another database and index name. |
| `pnpm db:setup --help` | Prints the options. |

- **The data is relative to when you seed:**
  - bookings run from three weeks back to two weeks ahead;
  - three hires are out now and two are overdue;
  - services and registrations fall due around today.

  Re-seed to bring them back to today.
- **Restart `pnpm demo:server` after a re-seed,** then sign in and reload once more. Each seed
  writes a new session secret. fieldtec-web's service worker can also serve the previous build on
  the first load.
- **Flushing Redis database 2 signs everyone out of this demo only.** The issue tracker demo uses
  database 1.
- **The setup never touches existing application databases:** `formbird`, `fieldtec-test`,
  `internal-5` and `clarity-dev`.

## Sign in

| Email | Name | Account type | Can | Hire pools | Licences | Starts on |
|---|---|---|---|---|---|---|
| olivia.bennett@example.com | Olivia Bennett | Administrator | everything, plus the Admin menu | all | C, MR, LF | Fleet overview |
| marcus.reid@example.com | Marcus Reid | Asset Manager | asset lifecycle, book any pool, exceed booking limits | all | C, LR | Fleet overview |
| priya.shah@example.com | Priya Shah | Supervisor | triage, close and cancel requests, reopen work orders | Field, Logistics | C, HR, LF | Workshop dashboard |
| tom.nguyen@example.com | Tom Nguyen | Technician | move requests along, raise and work work orders | Field | C, MR | Workshop dashboard |
| jack.oconnor@example.com | Jack O'Connor | Technician | as Tom | Logistics | C, HR | Workshop dashboard |
| sofia.russo@example.com | Sofia Russo | Driver | book, Daily Driver, fuel, report a fault | Field | C | Booking calendar |
| liam.walsh@example.com | Liam Walsh | Driver | as Sofia | Field, Logistics | C, LR | Booking calendar |
| grace.kim@example.com | Grace Kim | Operator | as Sofia, with a short menu that starts at the Daily Driver | Plant, Logistics | C, MR, LF, EWP, EX | Daily Driver |
| daniel.moore@example.com | Daniel Moore | Driver | as Sofia | Logistics, Corporate | C, MR | Booking calendar |
| ava.thompson@example.com | Ava Thompson | Driver | as Sofia | Corporate | C | Booking calendar |
| noah.patel@example.com | Noah Patel | Driver | as Sofia; his licence expires in 20 days | Field, Corporate | C | Booking calendar |

Licences:
- C: car;
- LR, MR, HR: light, medium and heavy rigid;
- LF: forklift;
- EWP: elevating work platform;
- EX: excavator.

Each asset type needs one (a Light Truck 4.5 t needs LR, a Medium Rigid MR). Bookings check the
licence and its expiry.

## What's in it

The demo company is "Harbourline Services", with five Sydney sites:
- Alexandria Depot;
- Alexandria Workshop;
- Parramatta Depot;
- Wetherill Park Workshop;
- Macquarie Park Office.

It has:
- 34 assets across 11 types (cars, EVs, vans, utes, trucks, a trailer, forklifts, an EWP, an
  excavator, a generator);
- about 300 bookings;
- Daily Driver checks;
- 17 workshop requests and 13 work orders;
- fuel receipts;
- 16 materials, 4 check sheets and 5 service plans.

**Pages:**

| Page | What's on it |
|---|---|
| **Fleet overview** | Tiles (Available For Hire, On Hire, Hire Overdue, bookings today, Unavailable For Hire, urgent defects, services and registrations due), the fleet map, my bookings, Hire Overdue, asset warnings, open workshop requests |
| **Booking calendar** | The calendar (drag to book, Hire Overdue, workshop block-outs) and my bookings |
| **Bookings** | Hire Overdue and all bookings |
| **Asset map** | Assets as icon tiles coloured by hire status, depots and workshops as areas, hire destinations; popups with Book / Daily Driver / Report a fault |
| **Assets** | Asset warnings (service, registration) and the register |
| **Workshop dashboard** | Tiles in FLEET's Current activity terms (Triage – Urgent and Non-Urgent, In The Yard, Start Overdue, Expected Today, Next 7 Days, Completed Today, On Hold), then triage, current activity, my work orders, services due and materials to reorder |
| **Daily Drivers**, **Fuel receipts** | Lists |

**Forms:**
- Asset, Booking, Daily Driver, Workshop request, Work order and Fuel receipt;
- Location (address point and site boundary on a map), Check sheet, Service plan and Material;
- a set-up page for each lookup: asset types, pools, licences, statuses, reasons….

Each account type gets its own menu and start page.

## Workflows

The status pickers offer only these moves, and the server rules enforce them, including for saves
made through the API. A new record must start in its workflow's first status.

**Booking:**

| From | To |
|---|---|
| (new) | Asset Reserved |
| Asset Reserved | Hire Commenced (needs the start meter), Cancelled (needs a reason) |
| Hire Commenced | Closed (needs the end meter, not below the start) |

**Workshop request:**

| From | To |
|---|---|
| (new) | Pending (anyone: triage), or Open (the workshop) |
| Pending | Open, Cancelled |
| Open | Drop Off, In Progress, Cancelled |
| Drop Off | In Progress, Open |
| In Progress | Work Complete, Open |
| Work Complete | Pick Up, Closed, In Progress |
| Pick Up | Closed |
| Cancelled | Pending |

Supervisors make the moves to Open, Closed, Cancelled and Pending; the workshop makes the others. A
supervisor setting the expected dates on a Pending request opens it.

**Work order:**

| From | To |
|---|---|
| (new) | New, In Progress (workshop only) |
| New | In Progress |
| In Progress | On Hold (needs a reason), Complete (needs the work described) |
| On Hold | In Progress |
| Complete | In Progress (supervisors only) |

**Asset lifecycle** (Asset Managers only): Commission → Active → Decommission → Awaiting Disposal →
Disposed, with Decommission and Awaiting Disposal able to go back to Active.

## Rules

A record type has up to three rulesets (assets have no PostSave; fuel receipts and materials only server rules). Find them under **Admin → Rulesets**, in the `fleet` group:

- **Client** runs on render, load, field change and PreSave:
  - defaults for a new record;
  - pickers filtered by the user's pools;
  - fields shown, hidden, made mandatory or read-only by status;
  - before saving, the same validation the server runs. A refusal shows as a notification
    instead of fieldtec-web's generic "Error updating document".
- **PreSaveServer** validates and derives. It refuses the save with a message when a check fails.
- **PostSave** updates the records affected by the save.

What they do:

- **Bookings:**
  - The asset must be Active, not in the workshop, and in one of the person's vehicle hire pools.
  - The person needs a licence that covers it and doesn't expire before the booking ends.
  - The booking can't be longer than the asset allows. Asset Managers may exceed this.
  - No clash with another booking, with a hire that hasn't come back (it blocks the next 24 hours),
    or with a workshop request.
  - A start in the past moves to now.
  - Cost: hourly, capped daily per Sydney calendar day, weekends free.
  - Commencing puts the asset On Hire. Closing records the distance, updates the asset's meter and
    makes it Available For Hire again.
- **Daily Driver:**
  - Every mandatory check must be answered, each failed check needs a comment, and a defect needs a
    description and Defect Inspection Complete.
  - A reading below the asset's meter is kept but flagged ("Primary Meter < Asset Meter"), and doesn't
    update the asset.
  - A failed check raises a Pending "Daily Driver Defect" request with the failures. An urgent one
    takes the asset off hire.
- **Workshop requests:**
  - The workflow and who may move it, as above.
  - The dates of each stage, and the downtime on closing.
  - Bookings that clash with the expected window are listed.
  - While a request is in the workshop, or booking is disabled, the asset is Unavailable For Hire.
    When the last such request is picked up, closed or cancelled, the asset is released.
- **Work orders:**
  - They take their asset from the request.
  - Totals by parts and labour, with GST.
  - Starting the first work order puts the request In Progress. Completing the last one makes the
    request Work Complete.
  - A PM Service can't complete until every service check is answered. Completing it reschedules
    the asset's next service from the plan: from when it was due if it was late, from when it was
    done if early.
  - Parts used come out of stock. Low stock is flagged for reorder.
- **Assets:**
  - Asset IDs are unique (case-insensitive), and so are trackers ("Tracker Device Must Be Unique").
  - The financial class is Major Plant above $5,000. The replacement due date follows the purchase.
  - The service warning (Overdue, Due Soon, Not Due) uses the plan's lead times.
  - A Responsible Person is required unless the asset is Unassigned.
- **Fuel receipts:**
  - Checked like FLEET's import: tank capacity, expected range, and against the previous fill.
  - A clean receipt with a higher meter updates the asset; L/100 km is worked out.

`demo/lib/rules.mjs` generates the rulesets. The validators (`validateBooking`, `validateRequest`…)
are shared by the client and server rulesets, and the fleet-kit functions are embedded from their
TypeScript source. Every asynchronous server rule completes through a guard (`once`), so an
exception fails that save with a message instead of stopping fieldtec-web.

## Layout

```
components/*/          the fleet elements, one per folder, each with a README
packages/fleet-kit/    logic shared by the elements and the rulesets (booking, service, meter, money)
                       and the calendar maths
packages/fixtures/     a small fleet for the preview and the browser test
apps/preview/          gallery of the elements against the in-memory host (pnpm dev)
demo/lib/              the demo: model (ids, keys, counters), catalog (sites, people, assets, sheets,
                       plans, materials), templates, rules, and build.mjs that generates the data.
                       The building blocks (form parts, ruleset scaffolding, seed helpers, the e2e
                       harness) come from shared's platform.
demo/server.mjs        runs fieldtec-web on the demo, copying its output to demo/server.log
demo/test/             unit tests of the rulesets, and the end-to-end test (e2e.mjs)
setup-db.mjs           one-command database setup (pnpm db:setup)
test/browser.mjs       browser test of the built bundles
```

## Commands

```sh
pnpm install
pnpm dev             # gallery on http://localhost:5181
pnpm typecheck
pnpm test            # unit tests: fleet-kit logic, calendar maths, the rulesets' validators (26)
pnpm test:browser    # builds, then drives the BUILT bundles in Chrome (66 checks, shared's map, checklist and tiles included)
pnpm check           # all three
pnpm build           # dist/<name>/<name>.js (with shared's)
pnpm db:setup        # build, copy into fieldtec-web, create the demo database (--reset to replace it)
pnpm demo:server     # run fieldtec-web on it: http://localhost:3001
pnpm demo:e2e        # end-to-end test of the rulesets on the running demo (48 checks)
```

`pnpm demo:e2e` signs in as different people and saves through fieldtec-web's API, so the real
rulesets run. It covers bookings, hire, Daily Driver, the workshop, preventive maintenance, fuel and
assets. It **writes to the demo database**: run it on a fresh seed, then `pnpm db:setup --reset`
again.

## Known limitations

- The PreSaveServer work order rule always applies 10% GST. The line items element's `taxRate`
  changes only what it shows.
- A ruleset can change a map layer's filter, but not add or rename layers after the map has started.
- The demo's map tiles are OpenStreetMap's public tiles. Use your own tile server (`tileUrl`) for
  real use.
- Material search in the line items matches the material's name, not its part number.

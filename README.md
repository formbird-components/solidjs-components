# solidjs-components

Business apps on Formbird (fieldtec-web) built with SolidJS custom elements. Each app is a set of
templates and rulesets in a fieldtec-web database, Solid elements on its forms and pages, and a seed
script that builds a demo database telling a story relative to the day you run it.

| Repo | What it is | Demo | Sign in (password) |
|---|---|---|---|
| [solidjs-components-shared](solidjs-components-shared/README.md) | The kit, the generic elements (tables, pickers, status, map, checklist, date range, approval chain, schedule…), the `solid-components` build/test/deploy CLI and the demo platform | preview gallery, :5180 | |
| [solidjs-components-internal](solidjs-components-internal/README.md) | A Jira-style issue tracker | `solidjs-demo`, :3000 | `alex.morgan@example.com` (`Demo1234!`) |
| [solidjs-components-fleet](solidjs-components-fleet/README.md) | Fleet and asset management: bookings, the workshop, Daily Driver checks, maps | `solidjs-fleet-demo`, :3001 | `olivia.bennett@example.com` (`Fleet1234!`) |
| [solidjs-components-whs](solidjs-components-whs/README.md) | Work health and safety: incidents, hazards, corrective actions, inspections | `solidjs-whs-demo`, :3002 | `priya.raman@example.com` (`Safety1234!`) |
| [solidjs-components-hr](solidjs-components-hr/README.md) | HR: leave with balances, approvals and minimum staffing, certificates, onboarding, the org chart | `solidjs-hr-demo`, :3004 | `sarah.mitchell@example.com` (`People1234!`) |
| [solidjs-components-procurement](solidjs-components-procurement/README.md) | Procurement: purchase requests, quotes compared, budgets per cost centre, approvals by amount, orders and invoice matching | `solidjs-procurement-demo`, :3005 | `lachlan.ward@example.com` (`Purchase1234!`) |

[APP-IDEAS.md](APP-IDEAS.md) lists twelve apps this base suits, the elements each needs, and which to
build next. [COMPONENTS.md](COMPONENTS.md) lists every Solid element: its source and built bundle, a
picture, and the options its componentDefinition takes.

## Run a demo

You need Node.js 22+ with pnpm, a built fieldtec-web checkout beside this folder
(`~/git/fieldtec-web` next to `~/git/solidjs-components`), and MongoDB (a replica set),
Elasticsearch and Redis at the hosts in fieldtec-web's `server/config/development.json`.

```sh
cd solidjs-components-hr        # or -internal, -fleet, -whs, -procurement
pnpm db:setup                   # install, build, deploy into fieldtec-web, write its config, seed
pnpm demo:server                # http://localhost:3004
```

[storybook/](storybook/README.md) is a Storybook of all of the elements, on each app's fixtures: `cd storybook &&
pnpm install && pnpm storybook` (port 6006). The portal serves its static build at `/storybook/`.

To run all of them behind one port, with a home page listing each app's start pages and sample
accounts: `portal/run.sh up`, then open http://localhost:8080 (in a Coder workspace, the URL it
prints). The apps are under `/issues/`, `/fleet/`, `/safety/`, `/hr/` and `/procurement/`; see
[portal/README.md](portal/README.md).

Each app's sign-in page rotates through `demo/backgrounds/login-*.jpg`, and `demo/backgrounds/app.jpg`
sits behind its pages (photos from Pexels, credited in that folder's `CREDITS.md`). `pnpm db:setup`
copies them to fieldtec-web's `server/public/backgrounds/<config>/` and sets `loginPage.backgroundImageList`
and `backgroundImage` in the config's `clientConfiguration`. After changing them, or
fieldtec-web's `development.json`, run `pnpm db:setup --config-only` to rewrite the config without
reseeding.

Each app's README has its people, its story, its pages and its rules. Every repo also runs
`pnpm check` (types, unit tests, and a browser test of the built bundles) and `pnpm dev` (a gallery
of its elements against an in-memory host).

The pictures below were taken from the running demos by a Playwright script, signed in as the person
named. The recordings are GIFs at 6 frames a second.

## Procurement

Ironbark Engineering: purchase requests line by line, quotes compared side by side (three above
$10,000), each cost centre's budget for the year with a finance override when a request goes over,
approvers chosen by amount, and the order, delivery and invoice match. Signed in as Lachlan Ward,
Finance Manager.

![Procurement tour: the overview, my approvals, an over-budget request with its quotes and approvals, a chosen quote that isn't the cheapest, and an invoice uploaded and previewed](docs/media/procurement/tour.gif)

| | |
|---|---|
| **Purchasing overview**: what waits, what is over budget, to order, overdue, waiting for the invoice; every budget ![Purchasing overview](docs/media/procurement/overview.png) | **My approvals**: the laptops wait for Lachlan's finance override ![My approvals](docs/media/procurement/approvals.png) |
| **Budget check**: 20 laptops would take IT $8,420 over its budget ![Budget check on a request](docs/media/procurement/request-budget.png) | **Approvals by amount**: the manager, then Finance's override, then the senior manager above $5,000 ![Approval chain](docs/media/procurement/request-approval.png) |
| **Quotes**: three for $18,900, the chosen one $650 dearer than the cheapest, with the reason ![Quote comparison](docs/media/procurement/quotes.png) | **Invoice**: 10% over what was approved, and the supplier's invoice in the documents list ![Invoice and documents](docs/media/procurement/documents.png) |
| **A PDF previewed** in the documents' lightbox ![PDF preview](docs/media/procurement/pdf-preview.png) | **Orders**: to order, deliveries to chase, invoices to match ![Orders](docs/media/procurement/orders.png) |
| **Budgets**: every cost centre against how far through the year it is ![Budgets](docs/media/procurement/budgets.png) | |

## HR

Bluegum Community Health: leave counted in working days with balances that accrue, an approval chain
that brings in a second approver when a team would drop below its minimum, certificates against what
each position requires, onboarding, and the org chart. Signed in as Sarah Mitchell, Nurse Unit
Manager.

![HR tour: My team, the leave calendar, the skills matrix, the org chart and a leave request](docs/media/hr/tour.gif)

| | |
|---|---|
| **My team**: approvals waiting for Sarah, her people's leave, two days below minimum next week ![My team](docs/media/hr/my-team.png) | **People overview**: tiles, the leave calendar of every team ![People overview](docs/media/hr/overview.png) |
| **Leave request**: working days, the balance on the first day, the approval chain waiting for the second approver ![Leave request](docs/media/hr/leave-request.png) | **Skills matrix**: certificates valid, expiring, expired or missing against each position ![Skills matrix](docs/media/hr/skills-matrix.png) |
| **Org chart**: reporting lines, team colours, who is on leave today ![Org chart](docs/media/hr/org-chart.png) | **Onboarding**: the position's checklist (Done / Blocked / N/A) ![Onboarding](docs/media/hr/onboarding.png) |
| **Leave calendar**: six weeks by team, pending requests hatched, public holidays ![Leave calendar](docs/media/hr/calendar.png) | |

## Work health and safety

Brightwater Group: incidents and near misses with a risk matrix, five whys and notifiable incidents;
the hazard register before and after controls; corrective actions; inspections where a failed check
raises a hazard. Signed in as Priya Raman, Administrator.

![Safety tour: the overview, an incident under investigation and the hazard register](docs/media/whs/tour.gif)

| | |
|---|---|
| **Safety overview**: days since a lost time injury, triage, the hazard heatmap ![Safety overview](docs/media/whs/overview.png) | **Incident**: the scaffold fall, notifiable, under investigation ![Incident](docs/media/whs/incident.png) |
| **Hazard register**: heatmaps before and with controls ![Hazard register](docs/media/whs/hazards.png) | **Safety map**: incidents, open hazards and sites ![Safety map](docs/media/whs/map.png) |

## Fleet

Harbourline Services: bookings on a calendar, assets with their lifecycle and hire status, the
workshop (requests and work orders), Daily Driver checks, fuel and maps. Signed in as Olivia Bennett,
Administrator.

![Fleet tour: the overview, the booking calendar, the map and an asset](docs/media/fleet/tour.gif)

| | |
|---|---|
| **Fleet overview** ![Fleet overview](docs/media/fleet/overview.png) | **Booking calendar** ![Booking calendar](docs/media/fleet/calendar.png) |
| **Asset map** ![Asset map](docs/media/fleet/map.png) | **Workshop** ![Workshop](docs/media/fleet/workshop.png) |
| **Asset** ![Asset](docs/media/fleet/asset.png) | |

## Issue tracker (internal)

A Jira-style tracker: projects, boards, issues with a workflow, comments and lists. Signed in as Alex
Morgan, Engineering Manager.

![Issue tracker tour: the board, an issue and its status, all issues](docs/media/internal/tour.gif)

| | |
|---|---|
| **Your work** ![Your work](docs/media/internal/your-work.png) | **Board** ![Board](docs/media/internal/board.png) |
| **Issue** ![Issue](docs/media/internal/issue.png) | **All issues** ![All issues](docs/media/internal/all-issues.png) |

## Layout

```
README.md                      this page
APP-IDEAS.md                   twelve apps for this base, the elements each needs, what to build next
COMPONENTS.md                  every element: source, bundle, picture, componentDefinition options
scripts/components-md.mjs      writes COMPONENTS.md (--shots: pictures it again from the browser tests)
docs/media/<app>/              the screenshots and recordings above
docs/media/components/         a picture of each element, for COMPONENTS.md
solidjs-components-shared/     kit, generic elements, tooling, demo platform
solidjs-components-internal/   issue tracker
solidjs-components-fleet/      fleet
solidjs-components-whs/        safety
solidjs-components-hr/         HR
solidjs-components-procurement/  procurement
```

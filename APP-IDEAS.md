# App ideas

This folder holds the base for building apps on Formbird (fieldtec-web) with SolidJS elements:

- [solidjs-components-shared](solidjs-components-shared/README.md): the kit, the generic elements,
  the build, test and seed tooling.
- [solidjs-components-internal](solidjs-components-internal/README.md): a Jira-style issue tracker.
- [solidjs-components-fleet](solidjs-components-fleet/README.md): fleet and asset management, with
  bookings, the workshop, Daily Driver checks and maps.
- [solidjs-components-whs](solidjs-components-whs/README.md): work health and safety, app 3 below:
  incidents, hazards, corrective actions and inspections.
- [solidjs-components-hr](solidjs-components-hr/README.md): HR, app 10 below: leave with balances,
  approvals and minimum staffing, certificates, onboarding and the org chart.
- [solidjs-components-procurement](solidjs-components-procurement/README.md): procurement, app 9
  below: purchase requests, quotes, budgets per cost centre, approvals by amount, orders and invoice
  matching.

Screenshots and recordings of every app are in the [README](README.md), and every element, with a
picture and its options, in [COMPONENTS.md](COMPONENTS.md).

Each app is the same kind of thing: templates and rulesets in a fieldtec-web database, SolidJS
elements on the forms, and a seed script that builds a demo database. This document lists 12 other
apps that fit that shape, and the elements each would need. It ends with which elements to build
once, in shared, and which app to build next.

## Built so far

App 3 (work health and safety) is built: [solidjs-components-whs](solidjs-components-whs/README.md).
Building it did what the sections below recommend:
- the map, checklist and stat tiles moved from fleet to shared, with the logic they use;
- photo capture and image pins were built in shared, as generic elements;
- the risk matrix, five whys and corrective actions stayed in the app;
- the template building blocks, ruleset scaffolding, seed helpers and end-to-end test harness that
  fleet and the safety app both need moved to shared's platform.

App 10 (HR) is built: [solidjs-components-hr](solidjs-components-hr/README.md). Building it:
- moved the **date range** from fleet to shared, with a new days mode (first and last day, half days,
  working days without weekends and public holidays, in the company's time zone); its time range rule
  and fleet's local-time helpers moved to shared's kit, and fleet's booking rules now use them from
  there;
- built two of the shared elements below in shared: the **approval chain** (steps planned by the
  rules, decisions and delegation checked against the saved version) and the **resource schedule**
  (as the leave calendar: people by day, teams with who is left against a minimum, drag to request);
- gave the shared checklist answer labels (Done / Blocked / N/A for onboarding tasks);
- kept the skills matrix, org chart and leave balance in the app.

App 9 (procurement) is built: [solidjs-components-procurement](solidjs-components-procurement/README.md).
Building it:
- moved **line items** from fleet to shared, as recommended: kinds are now the app's own (fleet keeps
  parts and labour; procurement has goods, services and freight), with totals per kind and a
  subtotal; `lineTotals` moved from fleet-kit to shared's kit, and fleet's rules and seed use it from
  there;
- reused the **approval chain** as it is: procurement's rules plan the steps (approvers by amount, a
  finance override over budget, a procurement step for a sole or unapproved supplier);
- did the planned `solid-attachments` as **photo capture's list layout** instead of a new element:
  documents as rows with a type each (quote, invoice) and PDFs previewed in the lightbox, with the
  same upload, camera and storage code;
- kept the budget check and the quote comparison in the app.

## What every app starts with

Every app below would use the generic elements already in shared:

| Element | What it does |
|---|---|
| `solid-status` | Coloured status, only the allowed transitions, an optional second step (a reason) |
| `solid-record-key` | Reference number with type icon and copy link |
| `solid-lookup-picker` | Picks lookups (types, priorities, categories) with icons and coloured chips |
| `solid-user-picker` | Picks people, with avatars and "Assign to me" |
| `solid-table` | Lists records with typed columns, sorting and paging in Elasticsearch, search, CSV export |
| `solid-comments` | Comments with safe Markdown, replies, edit history and votes |

Most would also use some of the elements that started in fleet (the map, checklist, stat tiles, date
range and line items are now in shared):

| Element | What it does |
|---|---|
| `solid-map` | Records from searches on an OpenLayers map: icons, boundaries, a layer panel, popups with quick actions |
| `solid-checklist` | Check sheets: Pass, Fail or N/A per check, grouped by category, with the sheet's result |
| `solid-stat-tiles` | Dashboard tiles with live counts from searches |
| `solid-line-items` | Lines with kinds of the app's own (parts and labour, goods and services), totals and tax (now in shared) |
| `solid-date-range` | Start and end with duration and validation; in days mode, working days for leave (now in shared) |
| `solid-asset-summary` | An asset's state, meter and next service at a glance |
| `solid-meter-reading` | Odometer or hour-meter readings checked against the last one |
| `solid-booking-calendar` | Bookings on a timeline, one row per asset, by day or week |

## The apps

For each app: who it's for, the fleet elements it would reuse, the new elements it would need, and
the rules that make it more than a form. New elements are split into **shared** (needed by several
apps; see [Build these once, in shared](#build-these-once-in-shared)) and **app** (specific to this
one). The element names are proposals.

### 1. Field service and job dispatch

Contractors (plumbing, HVAC, electrical) sending technicians to jobs at customer sites.

- **Reuses:** map (today's jobs and technicians), date range (the appointment window), checklist
  (safety and completion checks per job type), line items (parts and labour), stat tiles.
- **New, shared:**
  - signature: the customer signs off the job;
  - photo capture: before and after photos;
  - resource schedule, as the dispatch board: technicians × days, drag a job onto a person to
    assign it;
  - SLA clock: the response time promised to the customer;
  - address lookup: customer sites.
- **New, app:** `solid-job-timer`, which starts and stops travel and on-site time.
- **Rules:** a job can't be completed until its checklist is answered and the customer has signed.
  Timer time goes onto the line items at the job type's labour rate.

### 2. Inspections and compliance audits

Recurring inspections of sites or equipment: food safety, fire equipment, building compliance.

- **Reuses:** checklist, map, stat tiles.
- **New, shared:** signature (the inspector's sign-off), photo capture.
- **New, app:**
  - `solid-inspection-score`: weighted items and a pass mark;
  - `solid-finding`: a failed item raises a non-conformance with a photo, an owner and a due date;
  - `solid-recurrence`: "every 6 months", showing the next one due;
  - `solid-compliance-heatmap`: sites × categories.
- **Rules:** completing an inspection creates the next one from its recurrence. A site's compliance
  status comes from its open findings.

### 3. Work health and safety: incidents and hazards

Reporting incidents and near misses, investigating them, and following up the actions.

- **Reuses:** map (where it happened), checklist (workplace hazard inspections), stat tiles (days
  since the last lost-time injury, open actions).
- **New, shared:** photo capture; image pins, as a body map (click where the injury is).
- **New, app:**
  - `solid-risk-matrix`: likelihood × consequence, giving the rating;
  - `solid-root-cause`: a five-whys tree;
  - `solid-corrective-actions`: actions with owners, due dates and overdue flags.
- **Rules:** the risk rating decides who is notified and how fast. A serious incident can't close
  while any corrective action is open.

### 4. Facilities and property maintenance

Buildings, rooms and their equipment: reactive requests and planned maintenance.

- **Reuses:** asset summary, meter reading (electricity, water and gas meters), booking calendar
  (meeting rooms), line items, checklist (planned maintenance tasks), map (sites).
- **New, shared:**
  - photo capture: the requester's photo;
  - image pins, as a floor plan: assets and requests pinned on the plan;
  - SLA clock;
  - barcode scan: scan an asset's QR label to open it or raise a request.
- **New, app:**
  - `solid-space-picker`: building → level → room;
  - `solid-ppm-calendar`: a year view of planned maintenance.
- **Rules:** planned maintenance creates work orders ahead of the due date, like fleet's service
  plans. A request on a room goes to the trade that looks after it.

### 5. Construction site management

The site diary, inspection and test plans, defects, variations and progress claims.

- **Reuses:** checklist (inspection and test plans), line items (variations, progress claims), date
  range (delay periods), stat tiles.
- **New, shared:**
  - signature: hold points;
  - photo capture;
  - image pins, as drawing pins: defects pinned on drawings;
  - approval chain: variations.
- **New, app:**
  - `solid-gantt`: the programme, with dependencies;
  - `solid-site-diary`: weather, labour and delays each day;
  - `solid-progress-claim`: percent complete per line becomes the claim amount.
- **Rules:** a hold point blocks the next stage until it is signed. A variation must be approved
  before it can be claimed.

### 6. Utility and network assets

Water mains, power poles, roads: assets spread across a network, inspected and renewed.

- **Reuses:** map (heavily), asset summary, meter reading.
- **New, shared:** photo capture.
- **New, app:**
  - `solid-map-draw`: draw lines and areas for work zones; an extension of the map;
  - `solid-condition-rating`: 1–5 with photos and the trend over time;
  - `solid-network-trace`: what's upstream and downstream of an asset.
- **Rules:** a condition rating below the threshold makes the asset a renewal candidate. Work in a
  zone notifies the customers inside it.

### 7. Council customer requests

Residents reporting potholes, graffiti and missed bins; council teams resolving them.

- **Reuses:** map, stat tiles.
- **New, shared:** photo capture (the resident's photo), address lookup, SLA clock.
- **New, app:**
  - `solid-nearby-duplicates`: open requests within 50 m;
  - `solid-public-timeline`: what the resident sees.
- **Rules:** the request type sets the team and the SLA. A new request within 50 m of an open one of
  the same type is offered as a duplicate.

### 8. Inventory and warehouse

Stock on hand, receipts, picks and stocktakes.

- **Reuses:** line items (pick lists and receipts), stat tiles.
- **New, shared:** barcode scan.
- **New, app:**
  - `solid-stock-level`: on hand, reserved and the reorder point;
  - `solid-bin-location`: aisle → bay → bin;
  - `solid-stocktake`: counted vs expected, with the variance.
- **Rules:** saving a pick or a receipt updates stock on hand. Falling below the reorder point raises
  a purchase request (app 9).

### 9. Procurement and purchase approvals

Purchase requests, quotes, approvals and orders. **Built:**
[solidjs-components-procurement](solidjs-components-procurement/README.md) (the attachments became
photo capture's list layout).

- **Reuses:** line items, stat tiles.
- **New, shared:** approval chain (approvers by amount, who's next, delegation).
- **New, app:**
  - `solid-budget-check`: spend vs what's left in the cost centre;
  - `solid-quote-compare`: supplier quotes side by side;
  - `solid-attachments`: invoice and quote PDFs with a preview.
- **Rules:** the amount decides the approvers. Above a threshold, three quotes are required. An order
  over the cost centre's remaining budget needs a finance override.

### 10. HR: onboarding, leave and training

- **Reuses:** checklist (onboarding tasks), date range (leave).
- **New, shared:** approval chain (leave), resource schedule as the leave calendar (the team's
  leave with balances and clashes).
- **New, app:**
  - `solid-skills-matrix`: people × certifications, with expiry dates;
  - `solid-org-chart`.
- **Rules:** leave can't exceed the balance. Leave that breaks a minimum-staffing rule needs a second
  approver. A certificate expiring within 30 days notifies the person and their manager.

### 11. Equipment hire business

Fleet's bookings, sold to outside customers from several depots.

- **Reuses:** booking calendar, asset summary, date range, meter reading (hours out and in),
  checklist (handover), line items, map (depots).
- **New, shared:**
  - signature;
  - photo capture;
  - barcode scan: scan an item out and in;
  - resource schedule: availability across depots.
- **New, app:**
  - `solid-handover`: condition out vs in, with the damage between them;
  - `solid-rate-calculator`: day, week and month rates, plus the deposit.
- **Rules:** most of fleet's booking rules apply as they are: no double booking, hire cost from the
  rates. Damage found on return adds a charge.

### 12. Home care and community health visits

Carers visiting clients at home, on a roster.

- **Reuses:** map (the day's route), checklist (care tasks), date range (the visit window).
- **New, shared:**
  - signature: the client confirms the visit;
  - address lookup;
  - resource schedule, as the roster: carers × shifts, with qualifications and travel time.
- **New, app:**
  - `solid-visit-checkin`: check in and out by GPS;
  - `solid-care-plan`: goals and tasks per client.
- **Rules:** a carer must hold the qualifications the client's care plan needs. A check-in more than
  200 m from the client's address is flagged.

## Which fleet elements each app reuses

| App | Map | Checklist | Stat tiles | Line items | Date range | Asset summary | Meter reading | Booking calendar |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1. Field service | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| 2. Inspections | ✓ | ✓ | ✓ | | | | | |
| 3. WHS | ✓ | ✓ | ✓ | | | | | |
| 4. Facilities | ✓ | ✓ | | ✓ | | ✓ | ✓ | ✓ |
| 5. Construction | | ✓ | ✓ | ✓ | ✓ | | | |
| 6. Utilities | ✓ | | | | | ✓ | ✓ | |
| 7. Council requests | ✓ | | ✓ | | | | | |
| 8. Inventory | | | ✓ | ✓ | | | | |
| 9. Procurement | | | ✓ | ✓ | | | | |
| 10. HR | | ✓ | | | ✓ | | | |
| 11. Equipment hire | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12. Home care | ✓ | ✓ | | | ✓ | | | |
| **Apps** | **8** | **8** | **7** | **6** | **5** | **3** | **3** | **2** |

The first five are needed by most of the apps, so they belong in solidjs-components-shared. Move each
one when the second app needs it, rather than copying it. Most depend on fleet-kit code that moves
with them:

| Element | fleet-kit code it uses |
|---|---|
| Map | `geo`, `ol` (OpenLayers access), `actions` |
| Checklist | `logic/checklist` (the outcome) |
| Line items | `logic/money` (totals and tax): moved to shared's kit as `lineTotals` |
| Date range | `logic/booking` (time checks), `time` |
| Stat tiles | none |

The `logic/*` files are also imported by the fleet rulesets, so the client and the server run the
same checks. They would move to shared with the elements, and the rulesets would import them from
there.

## Build these once, in shared

These new elements come up in three or more of the apps above. Build each in shared the first time
an app needs it.

Built so far: photo capture and image pins (for app 3), the approval chain and the resource schedule
(for app 10). Photo capture's list layout (for app 9) covers documents and PDFs.

| Element | Apps | What it does |
|---|---|---|
| `solid-photo-capture` | 1, 2, 3, 4, 5, 6, 7, 9, 11 | Take or attach photos, with a caption each; or documents with a type each, PDFs previewed (**built**) |
| `solid-signature` | 1, 2, 5, 11, 12 | Sign on screen; saves the image, the name and the time |
| `solid-resource-schedule` | 1, 10, 11, 12 | People or assets × time, drag to assign. The dispatch board, leave calendar, roster and hire availability are this element configured differently. Fleet's booking calendar could be rebuilt on it. (**Built**, by day; the dispatch board will need hours and dragging existing records.) |
| `solid-approval-chain` | 5, 9, 10 | Approvers chosen by rules (amount, type), who's next, delegation, history (**built**, used by apps 9 and 10) |
| `solid-sla-clock` | 1, 4, 7 | Time left to respond and to resolve, counting business hours only |
| `solid-image-pins` | 3, 4, 5 | Pins on an image. The body map, floor plan and drawing pins are this element with a different image. (**Built**) |
| `solid-barcode-scan` | 4, 8, 11 | Scan a barcode or QR code with the camera to fill a field or open a record |
| `solid-address-lookup` | 1, 7, 12 | Address autocomplete that also stores the map coordinates |

## Recommended next

**Field service (app 1).** Of the 12, it still has the most to start from, and it builds the most
for later apps:

- It reuses five of fleet's elements: map, checklist, stat tiles, line items and date range. All five
  are in shared now.
- Of the eight shared elements above it needs five: photo capture and the resource schedule exist
  (the schedule would gain hours and dragging a job onto a person, as the dispatch board); it builds
  the signature, the SLA clock and address lookup.
- Its workflow (job → visit → completion → invoice) is close to fleet's (workshop request → work
  order → completion), so the rulesets can follow the same pattern.

After it, inspections (app 2) would need no new shared elements, and facilities (app 4) only barcode
scan. Inventory (app 8) now has procurement to raise its purchase requests in.

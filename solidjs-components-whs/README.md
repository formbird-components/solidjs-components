# solidjs-components-whs

A work health and safety app on Formbird (fieldtec-web), built with SolidJS custom elements. It
covers:
- **incidents** and near misses: reporting, triage, investigation with five whys, sign-off;
- **notifiable incidents**: who must tell the regulator, and when;
- the **hazard register**: risk before and after controls, the hierarchy of controls, reviews;
- **corrective actions** raised from incidents, hazards and inspections;
- **workplace inspections** on checklists, where a failed check raises a hazard;
- the safety overview, a risk heatmap, and a map of where things happen.

This repo holds the safety elements and a demo database, `solidjs-whs-demo`, for Brightwater Group
(a distribution centre, a manufacturing plant, a construction project and a head office in Sydney).
The generic elements, the kit and the tooling are in
[solidjs-components-shared](../solidjs-components-shared/README.md), which this repo links to.

| Element | Lives in | What it does |
|---|---|---|
| [`<solid-risk-matrix>`](components/risk-matrix/README.md) | this repo | A 5 × 5 likelihood × consequence matrix. On a form it rates a risk and says what the rating asks for (who hears, how fast, how deep the investigation goes); with `compareField` it shows the risk before controls beside the risk after. On a page it is a heatmap of records per cell. |
| [`<solid-root-cause>`](components/root-cause/README.md) | this repo | A five-whys tree: answers branch where several things contributed, and root causes get a category. It says what an investigation still needs. |
| [`<solid-corrective-actions>`](components/corrective-actions/README.md) | this repo | The actions raised against an incident, hazard or inspection, live: progress, overdue ones, the strongest control in place, and a form to add one with its due date set by the risk rating. |
| [`<solid-image-pins>`](../solidjs-components-shared/components/image-pins/README.md) | shared | The body map: where someone was hurt, front and back, by named region. |
| [`<solid-photo-capture>`](../solidjs-components-shared/components/photo-capture/README.md) | shared | Photos on a record (an incident, evidence that an action was done), taken or uploaded. |
| [`<solid-checklist>`](../solidjs-components-shared/components/checklist/README.md) | shared | Inspection checklists, answered Pass / Fail / N/A ("Hazards found"). |
| [`<solid-map>`](../solidjs-components-shared/components/map/README.md) | shared | Incidents and hazards by risk colour, and site boundaries; an incident's or hazard's own location. |
| [`<solid-stat-tiles>`](../solidjs-components-shared/components/stat-tiles/README.md) | shared | The overview's tiles, including days since the last lost time injury. |

The safety logic lives in `packages/whs-kit`:
- the risk matrix, and what each rating asks for;
- injury classes (first aid, medical treatment, lost time…) and notifiable incidents;
- the hierarchy of controls, action due dates and where a list of actions stands;
- what a five-whys tree still needs;
- hazard review dates and whether controls are strong enough.

The elements import these functions. The server rulesets embed the same functions' source, so the
browser and the database never disagree about a rating or a due date.

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
cd ~/git/solidjs-components/solidjs-components-whs
pnpm db:setup        # creates the database and Elasticsearch index "solidjs-whs-demo"
pnpm demo:server     # runs fieldtec-web on it: http://localhost:3002
```

`pnpm db:setup` installs, checks fieldtec-web and the services, builds shared's and this repo's
elements, copies them into fieldtec-web, writes `server/config/solid-whs.json` (port 3002, Redis
database 3) and seeds the database. The steps are described in the
[shared README](../solidjs-components-shared/README.md#building-an-app-on-it).

| Command | What it does |
|---|---|
| `pnpm db:setup --reset` | Replaces an existing demo database. Anything changed in the app is lost. |
| `pnpm db:setup --db <name>` | Uses another database and index name. |
| `pnpm db:setup --help` | Prints the options. |

- **Restart `pnpm demo:server` after a re-seed.** Each seed writes a new session secret.
- **Sign in, then reload the page once more.** fieldtec-web's service worker can serve the previous
  build's component documents on the first load.
- **The data is relative to the day you seed.** Seed again to bring "today" back to now.
- **Uploaded photos are stored in fieldtec-web's `files/` folder**, shared by every demo. The
  configuration document sets this up (`fileUploader`, `fileStorage`).

## Sign in

Every password is `Safety1234!`. Each account type has its own menu and home page.

| Person | Account type | Site | What to try |
|---|---|---|---|
| `priya.raman@example.com` | Administrator | Head office | Everything, including set-up and the rulesets |
| `marcus.webb@example.com` | Executive | Head office | Sign off Extreme and notifiable incidents |
| `hannah.cole@example.com` | WHS Advisor | Wetherill Park, Botany | Triage, investigate, verify actions, run the hazard register |
| `tom.nguyen@example.com` | WHS Advisor | Parramatta Road | The scaffold fall under investigation |
| `daniel.okafor@example.com` | Site Manager | Wetherill Park | Sign off High incidents; approve later due dates |
| `sophie.laurent@example.com` | Site Manager | Botany | The ammonia leak waiting for the regulator call |
| `ravi.patel@example.com` | Site Manager | Parramatta Road | |
| `liam.murphy@example.com` | Supervisor | Wetherill Park | Triage this morning's near miss; the overdue inspection |
| `grace.kim@example.com` | Supervisor | Botany | |
| `josh.taylor@example.com` | Supervisor | Parramatta Road | |
| `aisha.rahman@example.com` | Worker | Wetherill Park | Report an incident or a hazard; work on your actions |
| `ben.carter@example.com` | Worker | Botany | |
| `chloe.martin@example.com` | Worker (health and safety representative) | Botany | The inspection in progress |
| `jack.thompson@example.com` | Worker | Parramatta Road | |
| `mia.wilson@example.com` | Worker | Head office | |

## What's in it

The seed tells the same story whenever you run it, relative to that day:
- a near miss reported this morning at Wetherill Park, waiting for triage;
- an ammonia leak at Botany yesterday: a dangerous incident, so notifiable, and the regulator hasn't
  been told yet;
- a fall from a scaffold at Parramatta Road nine days ago: hospitalised, notifiable, under
  investigation, the five whys half done. It is also the last lost time injury;
- a forklift near miss under investigation, and incidents waiting on their actions;
- a year of closed incidents behind them (about 75 in all), about 40 hazards, about 200 corrective
  actions, and six months of inspections, one of them five days overdue and one in progress.

| Page | Who starts there | What it shows |
|---|---|---|
| **Safety overview** | Managers, WHS, executives | Days since a lost time injury; reports waiting for triage; notifiable incidents the regulator hasn't heard about; investigations; overdue actions; High and Extreme hazards; overdue inspections. Then what needs attention, the hazard heatmap, the map and the overdue actions. |
| **My safety** | Supervisors, workers | Report buttons, my actions, what I reported, my inspections |
| **Incident register** | | Every incident, with search and CSV export |
| **Hazard register** | | Heatmaps before and after controls, and the register |
| **Corrective actions** | | Mine, overdue, waiting for verification, all open |
| **Inspections** | | Scheduled and completed, by site |
| **Safety map** | | Incidents in the last year, open hazards and sites |

The forms are **Incident**, **Hazard**, **Corrective action**, **Inspection**, **Site** and
**Inspection checklist**, plus a page per lookup (incident types, natures of injury, treatments,
hazard categories, control levels, risk ratings, statuses…).

## Workflows

**Incident**

| From | To | Who | Needs |
|---|---|---|---|
| (new) | Reported | Anyone | What happened, when, where, the type. An injury: who, the treatment, the nature of injury and where on the body. |
| Reported | Under Review | Supervisor, manager, WHS | A risk rating |
| Under Review | Investigating | WHS | An investigator. If notifiable: when the regulator was told, their reference, and that the site was preserved. |
| Under Review, Investigating | Actions Pending | WHS | The investigation done: a supervisor's findings, or for a full investigation a finished five whys and findings |
| Actions Pending | Closed | WHS or manager (Low, Medium); manager (High); executive (Extreme, notifiable) | Every action done; for High, Extreme and notifiable ones, verified. Days lost for a lost time injury. |
| Reported, Under Review | Rejected | WHS | A reason |

How deep the investigation goes: **full** (WHS, five whys, at least three deep, every root cause
categorised) for High and Extreme risks, notifiable incidents and lost time injuries; **supervisor**
(findings) for Medium risks and other recordable injuries; **none** otherwise.

**Hazard**: Reported → Assessed (supervisor, manager, WHS; a rating before controls and an owner) →
Controls Pending (planned controls) → Controlled (WHS or manager; a rating with controls in place,
no worse than before, never Extreme; every control done; for a High or Extreme hazard a control at
Engineering or above, or a justification). Controlled hazards are reviewed every 1, 3, 6 or 12 months
by their residual rating. Closed needs a reason.

**Corrective action**: Open → In Progress → Completed (notes; evidence for High and Extreme risks) →
Verified (WHS or manager, not the owner). Cancelled needs a reason and WHS or a manager.

**Inspection**: Scheduled → In Progress → Completed (every required check answered, every failure
explained).

## Rules

The validators run twice: in the browser before saving, which shows the reason in a notification,
and on the server, which enforces it (an API save gets the same answer).

**Incidents**
- The risk rating comes from the matrix: Low, Medium, High or Extreme. It sets:
  - how fast it is triaged (72, 24, 4 or 1 hours);
  - when actions are due (90, 30, 7 days, or 1 day);
  - how deep the investigation goes;
  - who signs it off.
- **Who is told.** As the rating rises, the people it asks for are told:
  - Medium adds the site's WHS advisor;
  - High adds the site manager;
  - Extreme and notifiable add the executive.

  The incident's activity records who was told and the triage deadline. Saving it again doesn't
  repeat anyone.
- **Notifiable** (the model WHS Act, ss 35 to 37): a death, in-patient treatment, a serious injury
  (amputation, serious burn, spinal injury…: the injury nature's "serious" flag), or a dangerous
  incident. The regulator must be told, and the site preserved, before it moves past review.
- **Injury classes** come from the treatment: first aid, medical treatment, restricted work, lost
  time, fatality. These feed the "recordable" and "lost time" flags and the days-since tile.
- A report more than 24 hours after the event is marked late. The body map's regions become the
  incident's body parts.
- An incident won't close while any of its actions is open, or, for High, Extreme and notifiable
  ones, done but not yet verified. When the last action is done, its activity says it's ready to
  sign off.
- A saved incident updates its site's latest incident and latest lost time injury.

**Hazards**
- The rating before and with controls, and the risk now (with controls if rated, else before).
- Controls are corrective actions on the hazard. The strongest one in place is kept on the hazard.

**Corrective actions**
- Due within the source's rating. A later date needs a reason, and a manager or WHS advisor saving
  it (which approves it).
- Saving one recounts its source's actions: total, open, done, overdue, and the strongest control.

**Inspections**
- A completed inspection raises a hazard for each failed check, once, in the category its check
  belongs to. It books the site's next inspection unless one is already scheduled.

The rulesets are built in `demo/lib/rules.mjs` from shared's scaffolding
(`@solidjs-components/platform/rules`). An exception in an asynchronous rule fails that save
instead of stopping fieldtec-web.

## Layout

```
components/risk-matrix/        <solid-risk-matrix>
components/root-cause/         <solid-root-cause>
components/corrective-actions/ <solid-corrective-actions>
packages/whs-kit/              the safety logic (elements, rulesets and seed share it)
packages/fixtures/             a small safety data set for the browser test and the preview
demo/lib/                      the demo: model (ids, keys), catalog (lookups, people, sites, scenarios),
                               templates, rules, build.mjs (puts them together for the seed)
demo/test/rules.test.ts        the rulesets, evaluated, against the seed and the cases they exist for
demo/test/e2e.mjs              the rulesets on the running demo, through the API
demo/server.mjs                runs fieldtec-web on the demo (pnpm demo:server)
setup-db.mjs                   one-command database setup (pnpm db:setup)
test/browser.mjs               browser test of the built bundles
apps/preview/                  gallery of the elements against the in-memory host (pnpm dev)
```

## Commands

```sh
pnpm install
pnpm typecheck
pnpm test            # unit tests: the safety logic, the elements' logic and the rulesets (53)
pnpm test:browser    # builds shared and this repo, then drives the BUILT bundles in Chrome (98 checks)
pnpm check           # all three
pnpm dev             # gallery on http://localhost:5182
pnpm db:setup        # build, copy into fieldtec-web, create the demo database (--reset to replace it)
pnpm demo:server     # run fieldtec-web on it: http://localhost:3002
pnpm demo:e2e        # the rules on the running demo, through the API (57 checks; writes data: re-seed afterwards)
```

## Known limitations

- **"Told" means recorded, not emailed.** The escalation rule records who should hear and when; the
  demo sends no email or SMS.
- **Medical details aren't restricted.** Everyone who can open an incident sees its injury details.
  A real deployment would keep them in a record only the WHS team and the injured person can read.
- **The seed has no photos.** Photo fields start empty; uploads work once the demo runs.
- **Injury frequency rates (LTIFR, TRIFR) aren't on the overview.** `whs-kit` computes them from the
  sites' hours worked, but no element shows them yet.
- Map tiles come from OpenStreetMap, which asks heavy users to run their own tile server.

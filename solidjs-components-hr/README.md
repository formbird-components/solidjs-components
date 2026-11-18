# solidjs-components-hr

An HR app on Formbird (fieldtec-web), built with SolidJS custom elements. It covers:
- **leave**: requests counted in working days (half days, public holidays), balances that accrue,
  an approval chain with a second approver when a team would fall below its minimum, delegation,
  and a leave calendar of every team;
- **certificates**: who holds what, against what their position requires, and a check that tells
  people and their managers 30 days before one expires;
- **onboarding**: a checklist per position, which can't be completed until the new starter holds
  the certificates their position needs;
- **the organisation**: teams, positions, reporting lines and an org chart.

This repo holds the HR elements and a demo database, `solidjs-hr-demo`, for Bluegum Community Health
(a community health provider in western Sydney: two clinics, home care, and a head office). The
generic elements, the kit and the tooling are in
[solidjs-components-shared](../solidjs-components-shared/README.md), which this repo links to.

| Element | Lives in | What it does |
|---|---|---|
| [`<solid-leave-balance>`](components/leave-balance/README.md) | this repo | On a leave request: what is available on the first day, the request, what is left after, and how the balance is made up. On a page: a person's balances as cards. |
| [`<solid-skills-matrix>`](components/skills-matrix/README.md) | this repo | People × certificate types: valid, expiring (days left), expired, or missing where the position requires it. Compliance per person, per team and overall; a click opens the certificate, or starts one for a gap. |
| [`<solid-org-chart>`](components/org-chart/README.md) | this repo | The organisation as a tree: cards with team colours, who is on leave today, search that opens the reporting line, zoom. On a person's form: their line and direct reports. |
| [`<solid-resource-schedule>`](../solidjs-components-shared/components/resource-schedule/README.md) | shared | The leave calendar: people by day, grouped by team, how many are left each day against the minimum, balances beside each name, drag across free days to request leave. |
| [`<solid-approval-chain>`](../solidjs-components-shared/components/approval-chain/README.md) | shared | Who approves a request, in order: approve or reject with a comment, hand a step to someone else, and the decisions made. |
| [`<solid-date-range>`](../solidjs-components-shared/components/date-range/README.md) | shared | In days mode: first and last day, half days, working days without weekends and public holidays, as a strip of days. |
| [`<solid-checklist>`](../solidjs-components-shared/components/checklist/README.md) | shared | The onboarding checklist, answered Done / Blocked / N/A. |
| [`<solid-stat-tiles>`](../solidjs-components-shared/components/stat-tiles/README.md) | shared | The overview's tiles. |

The HR logic lives in `packages/hr-kit`:
- leave balances: the opening balance, pro rata accrual by FTE, approved and pending leave;
- minimum staffing: the days a request would leave its team below its minimum;
- who approves a request (line manager, the manager's manager, People & Culture);
- certificate states and expiry, and the required certificates someone still lacks.

Working days, days in a time zone and the approval chain's rules are in shared's kit. The elements
import these functions; the server rulesets embed the same functions' source, so the browser and the
database never disagree about a balance, a day count or whose turn it is.

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
- Internet access in the browser: the `sc-*` components and the Solid 2 runtime load from jsDelivr.

### Steps

```sh
cd ~/git/solidjs-components/solidjs-components-hr
pnpm db:setup        # creates the database and Elasticsearch index "solidjs-hr-demo"
pnpm demo:server     # runs fieldtec-web on it: http://localhost:3004
```

`pnpm db:setup` installs, checks fieldtec-web and the services, builds shared's and this repo's
elements, copies them into fieldtec-web, writes `server/config/solid-hr.json` (port 3004, Redis
database 5) and seeds the database. The steps are described in the
[shared README](../solidjs-components-shared/README.md#building-an-app-on-it). Port 3003 and Redis
database 4 are left to `react-internal`.

| Command | What it does |
|---|---|
| `pnpm db:setup --reset` | Replaces an existing demo database. Anything changed in the app is lost. |
| `pnpm db:setup --db <name>` | Uses another database and index name. |

- **Restart `pnpm demo:server` after a re-seed.** Each seed writes a new session secret.
- **Sign in, then reload the page once more.** fieldtec-web's service worker can serve the previous
  build's component documents on the first load.
- **The data is relative to the week you seed.** Seed again to bring "this week" back to now.

## Sign in

Every password is `People1234!`. Each account type has its own menu and home page.

| Person | Account type | Team | What to try |
|---|---|---|---|
| `nadia.haddad@example.com` | Administrator | People & Culture | Everything: the overview, the expiry check, set-up and the rulesets |
| `tom.becker@example.com` | People & Culture | People & Culture | Ava's unpaid leave, after her manager |
| `margaret.ellis@example.com` | Executive | Executive | The top of the org chart |
| `david.chen@example.com` | Executive | Executive | Second approver for Ahmed's leave (Parramatta Nursing would drop below four) |
| `sarah.mitchell@example.com` | Manager | Parramatta Nursing | Approve Mei's and James's leave; Sofia's request, handed to her by Grace; Chloe's onboarding |
| `grace.kim@example.com` | Manager | Parramatta Reception | Sofia's carer's leave (handed to Sarah) |
| `kate.sullivan@example.com` | Manager | Home Care | Three carers' certificates expiring or expired; Jack's rejected request |
| `hannah.price@example.com` | Manager | Penrith Nursing | Noah starting next week; Oliver off sick today |
| `raj.malhotra@example.com`, `ethan.park@example.com` | Manager | Finance, IT | |
| `james.okoro@example.com` | Employee | Parramatta Nursing | Request leave; his Christmas leave waits for Sarah |
| `mei.lin@example.com`, `ahmed.karimi@example.com`, `lucy.hart@example.com` | Employee | Parramatta Nursing | Next week's leave that brings in a second approver |
| `chloe.brennan@example.com` | Employee | Parramatta Nursing | Started three weeks ago: onboarding, missing her medication competency |
| `noah.fischer@example.com` | Employee | Penrith Nursing | Starts next week |
| `sofia.rossi@example.com`, `jack.wilson@example.com`, `ava.nguyen@example.com` … | Employee | | Their own leave and certificates |

## What's in it

29 people in 8 teams, about 100 leave requests (a year of ordinary leave and this week's story),
about 140 certificates, 4 onboardings and yesterday's expiry check. The story, relative to the week
you seed:
- **Parramatta Nursing** (six people, at least four in on a work day): Lucy is away next week
  (approved). Mei asked for Wednesday to Friday first: four left, so only Sarah approves. Ahmed then
  asked for Wednesday and Thursday: three left, so after Sarah, David is the second approver.
- James's Christmas leave (nine working days around two public holidays) waits for Sarah.
- Oliver is off sick today and Emma is on annual leave: both show on the org chart.
- Sofia's carer's leave is with Sarah: Grace handed the step to her.
- Jack's week off was rejected (with Kate's reason); Isla cancelled hers; Ava's two weeks of unpaid
  leave wait for People & Culture after her manager.
- Certificates: Jack's CPR expires in 12 days, Mateo's licence in 25, Oliver's AHPRA registration in
  5; Ryan's first aid and Lucy's infection control have expired; Sofia has no first aid. Yesterday's
  expiry check told each of them and their manager.
- Onboarding: Chloe (in progress, missing medication administration), Noah (starts next week, before
  day one done), Liam and Mateo (completed).

| Page | Who starts there | What it shows |
|---|---|---|
| **People overview** | Administrator, People & Culture, executives | Tiles (people, away today, waiting for approval, below minimum staffing, certificates expired and expiring, onboarding), the leave calendar, requests waiting, certificates to chase, new starters |
| **My team** | Managers | Waiting for my approval, my people's leave calendar, their skills matrix, new starters |
| **My HR** | Employees | My balances, my leave, my team's calendar, my certificates and onboarding |
| **Leave calendar** | | Everyone, six weeks, by team |
| **Leave register** | | Every request, with search and CSV export |
| **Skills matrix** | | Everyone's certificates against their position |
| **Certificates** | | The register, and the expiry checks |
| **Org chart** | | The organisation |
| **Onboarding**, **People** | | New starters; the directory |

The forms are **Leave request**, **Certificate**, **Onboarding**, **Certificate expiry check**,
**Team**, **Position** and **Onboarding checklist**, plus a page per lookup (leave types, certificate
types, statuses). The account form carries the employee's details: team, position, manager, FTE,
opening balances, their balances, leave, certificates and reporting line.

## Rules

The validators run twice: in the browser before saving, which shows the reason in a notification,
and on the server, which enforces it (an API save gets the same answer).

**Leave requests**
- A request starts **Pending**. It is **Approved** or **Rejected** only through its approval chain:
  the status picker offers nothing but **Cancelled**, and a save that sets Approved is refused.
- Days are working days: weekends and NSW public holidays don't count, and a request can start or end
  at midday. A request of only weekends and holidays is refused.
- **Balances.** Annual leave (20 days a year), personal/carer's leave (10) and long service leave
  (about 4.3) accrue daily from each person's opening balance, pro rata to their FTE. Approved and
  pending requests come off. A request can't take more than will be available on its first day.
  Compassionate, parental and unpaid leave don't use a balance.
- **Type rules.** More than 2 days of personal/carer's leave needs a medical certificate or
  statutory declaration; compassionate leave is up to 2 days; unpaid and parental leave need a
  reason and People & Culture's approval.
- A person can't have two requests on the same day. Employees request only for themselves;
  managers and People & Culture can request for others.
- **Minimum staffing.** Each team has a minimum on a work day. A request that would leave its team
  below it, counting approved leave and requests made before it (first come, first served), needs a
  **second approver**: the line manager's manager, or People & Culture at the top.
- **The approval chain.** The rules choose the steps; the browser only decides them. Nobody approves
  their own leave. Each save's decision is checked against the saved version: only the current
  step's approvers (or the person it was handed to) decide it, a rejection needs a reason, decisions
  can't be undone, and the decision is recorded in the name and time of the person saving. Changing a
  pending request's dates or type starts the approvals again.
- Approved leave can't be changed: cancel it and ask again. The person can cancel their own leave
  until it starts (approved leave needs a reason); their manager or People & Culture can cancel any.
- **Told.** The activity records who was asked, each decision and the outcome, and `notifiedRel`
  lists who was told.
- A saved request recounts the person's balances on their account (`leaveBalances`,
  `annualAvailableNum`…), which the calendar and the directory show.

**Certificates**
- The expiry follows the type's validity from the issue date. The state is Valid, Expiring (within
  30 days), Expired or No expiry.
- A certificate that is expiring or expired tells its holder and their manager, once.
- **The expiry check** (People & Culture): saving one looks through every certificate that has
  expired or expires within 30 days, brings its state up to date, tells holder and manager once, and
  records what it found. A real deployment would save one every morning from a scheduler.

**Onboarding**
- The checklist comes from the position. Completing needs every required task done, none blocked,
  and every certificate the position requires held in date ("They still need Medication
  administration…"). Completing records it on the starter's account.

The rulesets are built in `demo/lib/rules.mjs` from shared's scaffolding. An exception in an
asynchronous rule fails that save instead of stopping fieldtec-web.

## Layout

```
components/leave-balance/      <solid-leave-balance>
components/skills-matrix/      <solid-skills-matrix>
components/org-chart/          <solid-org-chart>
packages/hr-kit/               the HR logic (elements, rulesets and seed share it)
packages/fixtures/             a small HR data set for the browser test and the preview
demo/lib/                      the demo: model (ids, keys), catalog (teams, people, types, the story),
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
pnpm test            # unit tests: the HR logic, the elements' logic and the rulesets (36)
pnpm test:browser    # builds shared and this repo, then drives the BUILT bundles in Chrome (51 checks)
pnpm check           # all three
pnpm dev             # gallery on http://localhost:5183
pnpm db:setup        # build, copy into fieldtec-web, create the demo database (--reset to replace it)
pnpm demo:server     # run fieldtec-web on it: http://localhost:3004
pnpm demo:e2e        # the rules on the running demo, through the API (34 checks; writes data: re-seed afterwards)
```

## Known limitations

- **"Told" means recorded, not emailed.** The rules record who should hear; the demo sends no email.
- **The expiry check runs when someone saves one.** fieldtec-web has no scheduler here.
- **Public holidays are in `demo/lib/catalog.mjs`** (NSW, 2025 to 2027), not in a lookup: they are
  built into the templates and rulesets at seed time.
- **Balances use a simple model**: one opening balance per person at the start of the financial year
  (or their start date) and daily accrual. Leave loading, cash-outs and accrual caps aren't modelled.
- **Staffing counts people, not shifts or skills.** A team's minimum is a head count on work days.
- **The saved version comes from search**, which is about a second behind a save. Two decisions on
  the same request within a second could be judged against the older version. A new record's chain
  always starts undecided: decisions are only taken for steps of the saved version.

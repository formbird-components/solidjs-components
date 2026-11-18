# solidjs-components-procurement

A procurement app on Formbird (fieldtec-web), built with SolidJS custom elements. A purchase request
goes from a draft to a closed invoice:
- **the request**: what is bought, line by line (goods, services, freight, from a catalogue or free
  text), from which supplier, on which cost centre, and why;
- **quotes**: one written quote from $2,000 and three from $10,000 (ex GST), compared side by side, or
  a reason there is only one supplier, and a reason when the chosen quote isn't the cheapest;
- **budgets**: each cost centre's budget for the financial year, spent, committed and waiting for
  approval, and a finance override when a request would go over;
- **approvals by amount**: the cost centre manager; above $5,000 their manager; above $25,000 the CFO;
  above $100,000 the CEO; Finance first when it goes over budget; Procurement when the supplier isn't
  approved or there is only one;
- **the order, the delivery and the invoice**: Procurement raises the purchase order, the requester
  or the cost centre manager records the delivery, and Finance matches the invoice (within 5% or
  $100 of what was approved) and closes the request.

This repo holds the procurement elements and a demo database, `solidjs-procurement-demo`, for Ironbark
Engineering (an engineering contractor in the Hunter Valley, NSW: a workshop, field crews, IT,
facilities and an office). The generic elements, the kit and the tooling are in
[solidjs-components-shared](../solidjs-components-shared/README.md), which this repo links to.

| Element | Lives in | What it does |
|---|---|---|
| [`<solid-budget-check>`](components/budget-check/README.md) | this repo | On a request: the cost centre's year so far as a bar with the request on it, whether it fits, and the override it needs when it doesn't. On a page: every cost centre against how far through the year it is. |
| [`<solid-quote-compare>`](components/quote-compare/README.md) | this repo | The request's quotes side by side: amount against the cheapest, lead time, validity, approved supplier, the quote document; how many quotes the amount needs; choose one; add one. |
| [`<solid-line-items>`](../solidjs-components-shared/components/line-items/README.md) | shared | What is bought, line by line, with kinds of its own (goods, services, freight), the catalogue, and the subtotal, GST and total. Moved to shared from fleet, where it holds a work order's parts and labour. |
| [`<solid-approval-chain>`](../solidjs-components-shared/components/approval-chain/README.md) | shared | Who approves the request, in order, and why each step is there: approve or reject with a comment, hand a step to someone else. |
| [`<solid-photo-capture>`](../solidjs-components-shared/components/photo-capture/README.md) | shared | With `layout: "list"`: the request's documents (quotes, specifications, delivery dockets, invoices) as rows with a type each, PDFs previewed in the browser. |
| [`<solid-stat-tiles>`](../solidjs-components-shared/components/stat-tiles/README.md), [`<solid-table>`](../solidjs-components-shared/components/table/README.md), [`<solid-status>`](../solidjs-components-shared/components/status/README.md), [`<solid-comments>`](../solidjs-components-shared/components/comments/README.md) | shared | The overview's tiles, the lists, the status picker and the activity. |

The procurement logic lives in `packages/proc-kit`:
- who approves a purchase (`purchaseApprovalSteps`): tiers by amount, the finance override, the
  procurement step, without the requester and without asking anyone twice;
- quotes (`quotesNeeded`, `quoteProblems`): how many an amount needs, which are still valid, the
  cheapest, and what is wrong with the choice;
- budgets (`budgetPosition`, `financialYear`) and invoice matching (`invoiceMatch`).

Line totals (`lineTotals`) and the approval chain's rules are in shared's kit. The elements import
these functions; the server rulesets embed the same functions' source, so the browser and the
database never disagree about a budget, a quote count or whose turn it is.

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
cd ~/git/solidjs-components/solidjs-components-procurement
pnpm db:setup        # creates the database and Elasticsearch index "solidjs-procurement-demo"
pnpm demo:server     # runs fieldtec-web on it: http://localhost:3005
```

`pnpm db:setup` installs, checks fieldtec-web and the services, builds shared's and this repo's
elements, copies them into fieldtec-web, writes `server/config/solid-procurement.json` (port 3005,
Redis database 6) and seeds the database. The steps are described in the
[shared README](../solidjs-components-shared/README.md#building-an-app-on-it).

| Command | What it does |
|---|---|
| `pnpm db:setup --reset` | Replaces an existing demo database. Anything changed in the app is lost. |
| `pnpm db:setup --db <name>` | Uses another database and index name. |

- **Restart `pnpm demo:server` after a re-seed.** Each seed writes a new session secret.
- **Sign in, then reload the page once more.** fieldtec-web's service worker can serve the previous
  build's component documents on the first load.
- **The data is relative to the day you seed.** Seed again to bring "this week" back to now.

## Sign in

Every password is `Purchase1234!`. Each account type has its own menu and home page.

| Person | Account type | Cost centre | What to try |
|---|---|---|---|
| `claire.donovan@example.com` | Administrator | Procurement | Everything: the overview, orders, suppliers, the approval tiers, set-up and the rulesets |
| `marco.ruiz@example.com` | Procurement | Procurement | Approve the heritage joiner for the windows (sole supplier, not approved yet); order the PPE |
| `lachlan.ward@example.com` | Finance | Finance | The finance override on the laptops (IT would go $8,420 over) |
| `mia.foster@example.com` | Finance | Finance | Close the survey hire: the invoice is 10% over, so she says why |
| `robert.hayes@example.com` | Executive | Executive | Rejected Sophie's jackets; approves above $100,000 |
| `anjali.desai@example.com` | Executive | Finance | Approves the laptops after Lachlan (CFO); manages IT's manager |
| `greg.mason@example.com` | Executive | Executive | Approve the generators (above $5,000, after Jess) and then the windows |
| `tom.harris@example.com` | Manager | Workshop | Approve Kai's crimper; the tyres are three days late |
| `jess.nguyen@example.com`, `daniel.brooks@example.com`, `hannah.lee@example.com`, `amir.haddad@example.com`, `sophie.turner@example.com` | Manager | Field operations, IT, Facilities, HSE, Marketing | Their cost centres' requests and budgets; Sophie's draft stand |
| `kai.robinson@example.com` | Employee | Workshop | Raise a request; his crimper waits for Tom |
| `ella.morris@example.com`, `noah.kim@example.com`, `ruby.clarke@example.com` | Employee | Field operations, IT, Facilities | The generators, the laptops, the windows |

## What's in it

17 people, 9 cost centres with this year's budgets, 17 suppliers (one not approved yet, one blocked),
a catalogue of 26 items, four approval tiers, about 50 requests (the year so far, closed, and this
week's story) and about 40 quotes. The story, relative to the day you seed:
- **Kai's hose crimper** ($3,480, one quote) waits for Tom, the workshop manager.
- **Ella's two generators** ($18,900): three quotes; she chose PowerGen over the cheaper Ridgeway
  ("Ridgeway can't deliver for six weeks"). Jess approved; above $5,000 it now waits for Greg.
- **Noah's 20 laptops** ($46,200): IT has $37,780 left, so the request goes $8,420 over. Daniel
  approved; Lachlan decides the finance override, then Anjali (above $25,000).
- **Ruby's heritage windows** ($12,600): one quote, from a joiner who isn't an approved supplier, with
  the reason there is only one. Hannah approved; Procurement decides, then Greg.
- **Sophie's Mining Expo stand**: a draft with two quotes.
- **Amir's PPE restock**: approved, ready to order. **Tom's drive tyres**: ordered, three days late.
- **Jess's survey hire**: received; the invoice is 10% over what was approved.
- **Sophie's branded jackets**: rejected by Robert ("Not this year: the Mining Expo stand comes
  first."). **Kai's impact wrench set**: cancelled.

| Page | Who starts there | What it shows |
|---|---|---|
| **Purchasing overview** | Administrator, Procurement, Finance | Tiles (waiting for approval, over budget, ready to order, deliveries overdue, waiting for the invoice, closed this month), every budget, and the lists behind the tiles |
| **My approvals** | Executives, managers | What waits for my decision, my cost centres' budgets and requests |
| **My requests** | Employees | My requests, what is on order for me, my cost centre's budget |
| **Orders** | | Approved requests to order, deliveries to chase, invoices to match |
| **Budgets** | | Every cost centre this financial year |
| **Purchase requests** | | Every request, with search and CSV export |

The forms are **Purchase request** and **Quote**, plus **Supplier**, **Cost centre**, **Catalogue
item**, **Approval tier** and a page per lookup (request statuses, categories). An account carries the
person's cost centre and manager, and whether they approve finance overrides.

## Rules

The validators run twice: in the browser before saving, which shows the reason in a notification,
and on the server, which enforces it (an API save gets the same answer).

**Requests**
- A request starts as **Draft** or **Submitted**. Draft → Submitted → (approvals) → Approved →
  Ordered → Received → Closed; a submitted request can be withdrawn to Draft, a rejected one reworked
  as a Draft, and anything not yet received cancelled.
- Employees raise requests only for themselves; Procurement and Finance can raise them for others.
  Only the requester or Procurement submits or withdraws.
- Submitting needs a title, cost centre, category, a needed-by date, lines with quantities and
  prices, and a supplier that isn't blocked.
- **Quotes.** From $2,000 ex GST one written quote, from $10,000 three, unless the request says why
  there is only one supplier. An expired quote doesn't count. A quote must be chosen; a chosen quote
  that isn't the cheapest needs a reason; the lines must come within 5% of the chosen quote.
- **The approval chain.** The rules choose the steps; the browser only decides them. The cost centre
  manager first (their manager when they raised it themselves); then Procurement when the supplier
  isn't approved or there is only one; then Finance's override when the request would go over the
  cost centre's budget; then the tiers above $5,000 (the manager's manager), $25,000 (the CFO) and
  $100,000 (the CEO). Nobody approves their own request or decides twice. Each save's decision is
  checked against the saved version: only the current step's approvers (or the person it was handed
  to) decide it, a rejection needs a reason, decisions can't be undone. Changing a submitted
  request's lines, cost centre or supplier starts the approvals again.
- An approved request can't change what is bought or from whom: cancel it and raise a new one. Once
  approved, only Procurement or Finance cancel, with a reason.
- **Order.** Procurement raises it: a PO number (PO-n for PR-n), who ordered and when, and the
  expected delivery. The supplier must be approved by then.
- **Delivery.** The requester, the cost centre manager or Procurement records it.
- **Invoice.** Finance closes the request with the invoice number, date and amount (inc GST). Within
  5% or $100 of the approved total it matches; more than that over needs a reason. The invoice ex GST
  becomes what was spent.
- **Told.** The activity records who was asked, each decision and the outcome, and `notifiedRel`
  lists who was told.
- A saved request recounts its cost centre's year (`spentNum`, `committedNum`, `pendingNum`,
  `remainingNum`); a saved quote recounts its request's quotes and the cheapest.

The rulesets are built in `demo/lib/rules.mjs` from shared's scaffolding. An exception in an
asynchronous rule fails that save instead of stopping fieldtec-web.

## Layout

```
components/budget-check/       <solid-budget-check>
components/quote-compare/      <solid-quote-compare>
packages/proc-kit/             the procurement logic (elements, rulesets and seed share it)
packages/fixtures/             a small procurement data set for the browser test and the preview
demo/lib/                      the demo: model (ids, keys), catalog (cost centres, people, suppliers,
                               items, tiers, the story), templates, rules, build.mjs (the seed)
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
pnpm test            # unit tests: the procurement logic and the rulesets (21)
pnpm test:browser    # builds shared and this repo, then drives the BUILT bundles in Chrome (35 checks)
pnpm check           # all three
pnpm dev             # gallery on http://localhost:5184
pnpm db:setup        # build, copy into fieldtec-web, create the demo database (--reset to replace it)
pnpm demo:server     # run fieldtec-web on it: http://localhost:3005
pnpm demo:e2e        # the rules on the running demo, through the API (39 checks; writes data: re-seed afterwards)
```

## Known limitations

- **"Told" means recorded, not emailed.** The rules record who should hear; the demo sends no email.
- **No real files in the seed.** The demo's requests and quotes have no attachments; upload some on a
  request to see the documents list.
- **One currency and one tax rate** (AUD, 10% GST), from `demo/lib/model.mjs`.
- **Budgets are per cost centre and financial year**, with no carry-over, no budget lines by category
  and no commitments outside the app beyond `baseSpentNum`.
- **Receiving is all or nothing.** Partial deliveries and partial invoices aren't modelled.
- **The saved version comes from search**, which is about a second behind a save. Two decisions on
  the same request within a second could be judged against the older version.

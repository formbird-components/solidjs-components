# `<solid-budget-check>`

A cost centre's budget for the financial year (from 1 July): what is **spent** (closed requests, at
their invoice ex GST, plus what was spent outside the app), **committed** (approved, ordered,
received), **waiting for approval** (submitted) and what is **left**. It works the figures out with
`budgetPosition` from proc-kit, the function the server rules use, so the element and the rules agree.
It shows whole dollars and stores nothing in its own field (definitions set `disableSave: true`).

**Request mode** (on a purchase request):
- the cost centre, its code and its budget for the year;
- a bar: spent, committed, this request (green while it fits, hatched red past the budget), what is
  waiting for approval, a mark for how far through the year it is, and the end of the budget;
- the figures: spent, committed, waiting for approval, this request, left after;
- the verdict: "Fits in the budget: $25,600 left after this request." or "Over budget by $8,420:
  Finance approves an override before this can be ordered."

The amount is the request's subtotal ex GST, from its lines (`lineTotals`), and follows them as they
change. The request itself is left out of the cost centre's requests, so saving it doesn't count it
twice. `remainingField` gets what is left before this request, for the client rule.

**Summary mode** (the overview, Budgets, My cost centres): a row per cost centre with its code, name
and manager, the bar, how much of the budget is used, and what is left of the budget. A row is marked
when the budget is used faster than the year goes. With no cost centres it shows `emptyText`.

| Option | Default | |
|---|---|---|
| `mode` | `"request"` | `"request"` or `"summary"`. Read once. |
| `costCentreField`, `linesField` | `costCentreRel`, `lineItemsArr` | Request mode: the request's cost centre and lines. Read once. |
| `remainingField` | none | Request mode: where to write what is left before this request. |
| `costCentreFilter` | the app's cost centres | Summary mode: Elasticsearch request for the cost centres. |
| `requestsFilter` | the app's requests on the cost centre this year | Elasticsearch request; `{{costCentreId}}` and `{{fy}}` are filled in. |
| `budgetField`, `baseSpentField`, `codeField`, `ownerField` | `budgetNum`, `baseSpentNum`, `code`, `ownerRel.name` | Paths on a cost centre. |
| `emptyText` | "No cost centres to show." | Summary mode, when no cost centre matches. |
| `app` | `"proc"` | The app tag of the records. |
| `taxRate` | `0.1` | The tax on the lines: budgets count amounts ex tax. |
| `currency`, `timeZone` | `AUD`, the browser's | |
| `hideLabel` | `false` | |

It loads again after any save in the app (`document:updated`) and when the cost centre changes.

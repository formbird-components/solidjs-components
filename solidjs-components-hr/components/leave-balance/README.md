# `<solid-leave-balance>`

Leave balances, worked out live the way the leave rules work them out (`leaveBalance` in hr-kit):
the opening balance on the person's account, plus what accrues daily at their FTE up to the day,
less their approved and pending leave since the opening balance. It stores nothing in its own field
(definitions set `disableSave: true`).

**Request mode** (on a leave request):
- **Available on Mon 7 Dec** (the first day, or today), **This request** (the `daysField`, written
  by `<solid-date-range>`), **Left after**;
- a bar: the request hatched in the leave type's colour (red when it is more than the balance), what
  is left after in a lighter tint;
- how the balance is made up: "9.6 to start with, +8.1 accrued (1.67 a month), −4 approved";
- more than the balance: "That's 2.5 days more annual leave than you will have on Mon 7 Dec.";
- a type without a balance (compassionate, unpaid): "Leave without pay doesn't come from a balance."

It writes what is available on the first day to `availableField`, so the client PreSave rule can
refuse an overdrawn request before it reaches the server. The server works it out again.

**Summary mode** (My HR, the account form): a card per balance (annual, personal/carer's, long
service): days available today, a bar, what accrues a month, what is waiting for approval and what
was approved this year.

| Option | Default | |
|---|---|---|
| `mode` | `"request"` | `"request"` or `"summary"`. Read once. |
| `leaveTypes` | `[]` | The leave type values: `{ documentId, name, color, balanceKey, accrualDaysNum }`. Types sharing a `balanceKey` share a balance. |
| `employeeField`, `typeField`, `startField`, `daysField` | `employeeRel`, `leaveTypeRel`, `startDate`, `daysNum` | Request mode: the request's fields. Read once. |
| `availableField` | none | Request mode: where to write the days available on the first day. |
| `person` | `"me"` | Summary mode: the signed-in person, or `"document"` (the account the form shows). |
| `openingFields` | `{ annual: 'annualOpeningNum', personal: 'personalOpeningNum', longService: 'longServiceOpeningNum' }` | Fields on the account with each balance's opening value. |
| `sinceField`, `fteField` | `balanceDate`, `fteNum` | The day of the opening balances, and the FTE. |
| `leaveFilter` | the person's Pending and Approved leave | Elasticsearch request; `{{employeeId}}` is the person. |
| `timeZone` | the browser's | The company's zone, for "today" and the first day. |
| `hideLabel` | `false` | |

It loads the account and the leave again after any save in the app (`document:updated`), and when
the person changes.

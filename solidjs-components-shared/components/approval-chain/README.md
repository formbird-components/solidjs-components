# `<solid-approval-chain>`

Who must approve a record, in order: a leave request's line manager then a second approver, a
purchase's approvers by amount. The app's rules **plan** the steps; this element shows where the chain
stands and lets the person whose turn it is decide. Decisions are sent when the record is saved, and
the rules check each one against the saved version with the same functions (`approvalProblems` in the
kit), so a crafted save can't decide out of turn or in someone else's name.

**Showing it.**
- A headline: "Waiting for your decision", "Waiting for David Chen", "Approved by all 2 approvers",
  "Rejected by Sarah Mitchell", or, before the rules have chosen anyone, `emptyText`.
- The steps as a timeline: a numbered marker (pulsing on the current step), a tick or a cross once
  decided; the step's label and badge (Waiting, Next, Approved, Rejected, Not needed); why the step is
  there ("Parramatta Nursing would have 3 of 6 on Wed 25 Nov…"); its approvers, "(you)" for the
  signed-in person, and the person it was handed to; or who decided, when, and their comment.

**Deciding.** When the signed-in person is one of the current step's approvers, or the person it was
handed to, a card offers a comment, **Approve** and **Reject** (a rejection needs a comment unless
`commentOnReject` is false). The decision is written to the field at once, in their name and time,
with "not saved yet" and **Undo** until the record is saved. **Hand to someone else** (approvers only)
picks a person who can then decide the step; **Take it back** undoes that while the step waits.

**Stored value**, the field's whole value:

```json
{ "steps": [
  { "id": "manager", "label": "Line manager", "approvers": [{ "documentId": "…", "name": "Sarah Mitchell" }],
    "decision": "approved", "decidedBy": { "documentId": "…", "name": "Sarah Mitchell" }, "decidedAt": "2026-11-17T22:10:00.000Z", "comment": "Covered.",
    "delegate": null, "delegatedBy": null, "delegatedAt": null },
  { "id": "second", "label": "Second approver", "reason": "Parramatta Nursing would have 3 of 6 …", "approvers": [{ "documentId": "…", "name": "David Chen" }],
    "decision": "", "decidedBy": null, "decidedAt": null, "comment": "" }
] }
```

| Option | Default | |
|---|---|---|
| `noun` | `"request"` | In the texts: "Save the request to send your decision." |
| `people` | active accounts | Elasticsearch request for who a step can be handed to. |
| `allowDelegate` | `true` | Offer **Hand to someone else**. |
| `commentOnReject` | `true` | A rejection needs a comment. |
| `approveLabel`, `rejectLabel` | `"Approve"`, `"Reject"` | |
| `emptyText` | "Approvers are chosen when the request is saved." | |
| `hideLabel` | `false` | |

Read-only (`enabled: false`, `readOnly`) shows the chain without the decision card.

## The rules' side

The kit's `domain/approval.ts` holds the logic; rulesets carry it as source (`functionsLib`):
- `approvalStatus(chain)`: the state (none, pending, approved, rejected), the current step, who it
  waits on.
- `canDecide(chain, userId)`.
- `approvalProblems(saved, sent, userId)`: what's wrong with a save's changes. A decision must be on
  the step that was current, by one of its approvers or its delegate, in their own name; one at a
  time; a rejection needs a reason; decisions can't be undone; only an approver delegates, and only
  an undecided step.
- `mergeApprovalChain(planned, saved)`: the steps the rules want now, keeping decided steps and
  delegations, dropping undecided steps no longer needed, adding new ones (a second approver when a
  breach appears later).

The HR app's `HR Leave - PreSaveServer` loads the saved version, checks the sent chain with
`approvalProblems`, takes only that save's decision and delegation from it, re-plans the steps,
merges, stamps the server's time, and moves the request to Approved or Rejected when the chain is.

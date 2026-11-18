# `<solid-root-cause>`

A five-whys tree for an investigation. The problem statement comes first. Each answer to "Why?" is
a card with its depth ("Why 1", "Why 2"…) and can be asked why again. An answer can also have other
causes beside it, because several things can contribute, so the tree branches. Answers where asking
why again stops helping are marked as **root causes**, each with a category. Connector lines join each
answer to the one it explains, and a branch can be collapsed.

Under the tree is the summary: "7 whys · 4 deep · 2 root causes", the root causes with their
categories, and a checklist of what the analysis still needs. When nothing is missing, it reads
**Ready**.

| Option | Default | |
|---|---|---|
| `problemField` | `"title"` | Field of this document the problem is taken from while the tree has none (see below). Followed live. Read once. |
| `categories` | People, Procedure, Plant and equipment, Environment, Organisation | Root cause categories, as names (`["People", …]`) or values with a `name`. |
| `minDepth` | `3` | Whys a root cause needs above it, itself included, before the analysis is complete. |
| `mandatory` | `false` | Marks the label. |
| `readOnly`, `enabled: false` | | Answers show as text, with categories as tags; only collapsing is left. Rulesets can switch this live. |
| `hideLabel` | `false` | |

**Stored value:**

```json
{
  "problem": "Forklift struck racking upright",
  "nodes": [
    { "id": "w1", "text": "The operator could not see the upright", "children": [
      { "id": "w2", "text": "The load was stacked above eye level", "children": [
        { "id": "w3", "text": "No height limit for loads on reach trucks", "root": true, "category": "Procedure", "children": [] }
      ] }
    ] }
  ]
}
```

- New nodes get ids from fieldtec-web's `OfflineUtilService.getNextId()`.
- A stored node without an id is given `why-<position>` (`why-1-2`), the same every time it is read.
  Entries that aren't objects are dropped.
- `root` is present only on root causes. Unmarking a root cause removes its `root` and `category`.

**The problem.**
- While the stored problem is empty, it is **written on the first edit**: adding a why, or typing in
  one, stores the problem from `problemField` along with the change. The placeholder is "What
  happened?".
- A **Use “…”** button under the empty problem box takes the title straight away.
- The problem can be edited like any answer. Clearing it doesn't bring the title back until the next
  edit to the whys.

**Editing an answer.**
- **Ask why** adds an answer under it, and **Add another cause** adds one beside it, right after it.
  Focus moves to the new answer. Under a collapsed branch, Ask why opens it first.
- **Root cause** toggles the mark. Then the category chips appear, and "Choose one" shows until a
  category is picked.
- **Remove** takes an answer without answers under it at once. One with answers under it asks first:
  "Remove this why and the 3 answers under it?", with **Keep** focused, and Escape keeps it.
- After a removal, focus moves to the answer before it (or the next one), or else to **Ask why**.
- Answers grow with their text (CSS `field-sizing`, or measured where the browser lacks it).

**Keyboard** in an answer, shown in the card while it has focus:
- Ctrl+Enter (⌘+Enter on a Mac) asks why.
- Enter adds another cause beside it. It does nothing in an empty answer, so blank answers don't pile
  up.
- Shift+Enter is a new line.

**Writes.**
- Typing reaches the field 400 ms after the last key, or at once when the answer or the problem loses
  focus. One sentence typed is one write.
- Adding, removing, marking, choosing a category and using the title are written at once.
- A change to the field from elsewhere (a ruleset, another element) replaces what is shown, and drops
  typing that hasn't been written yet.

**Summary and checks.**
- The counts come from `causeSummary`, and the checklist from `causeProblems` with `minDepth`. Both
  are from whs-kit (`logic/rootcause.ts`), so the element shows exactly what the rules will refuse:
  - say what the problem is;
  - ask why at least once;
  - fill in or remove blank answers;
  - mark at least one root cause;
  - give each root cause a category;
  - ask why at least `minDepth` times before settling on one.
- Nothing is blocked while editing.

**Rules it pairs with** (`demo/lib/rules.mjs`).
- The incident rules run `causeProblems(rootCauseTree, { minDepth: 3 })` when an incident that needs
  a full investigation moves to Actions Pending or Closed. They refuse it with the first problem
  ("The investigation isn't finished: …").
- Keep `minDepth` in step with the rule.

**Example:**

```json
{ "componentName": "solid-root-cause", "name": "rootCauseTree", "label": "Why did it happen?", "fullWidth": true, "problemField": "title", "minDepth": 3 }
```

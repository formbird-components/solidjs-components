# `<solid-issue-summary>`

The issue title, edited in place: click it, press Enter on the pencil button, or F2. **Enter** saves,
**Escape** cancels, and clicking away saves a valid change. Newlines and repeated spaces collapse to one
space (a summary is one line).

| Option | Default | |
|---|---|---|
| `mandatory` | `false` | Refuses an empty summary with a message instead of saving. |
| `minLength` / `maxLength` | none | Checked before saving; `maxLength` also shows a counter. |
| `placeholder` | `"Add a summary…"` | Shown when empty. |
| `headingLevel` | `1` | `aria-level` of the title. |
| `enabled: false` / `readOnly` | | Plain text, no editing. |

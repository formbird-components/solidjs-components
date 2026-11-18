# `<solid-org-chart>`

The organisation as a top-down tree of who reports to whom (`managerRel` on each account), joined by
lines. Each card shows the person's avatar, name (a link), title and team (in the team's colour, also
the card's top edge), and **On leave** when they are away today. Under a card with reports, a toggle
says how many report to them directly and in all ("⌃ 4 · 19").

- **Find someone** marks every match; Enter (or the arrows) opens the reporting line down to the next
  one and scrolls to it. **Me** does the same for you.
- **Open all**, **Close all**, and zoom (50 to 115%). On first load the chart zooms out until it fits.
- At first the top two levels are open, and so is your own reporting line.
- People whose manager isn't on the chart (or whose chain loops) start their own tree.

**On a person's form** (`focus: "document"`): only their reporting line from the top, and their
direct reports, all open, with the person outlined. Without a manager: "Not on the org chart yet".

It loads again after any save in the app. It stores nothing.

| Option | Default | |
|---|---|---|
| `filter` | active accounts | Elasticsearch request for the people. |
| `managerField`, `titleField`, `teamField`, `colorField` | `managerRel.documentId`, `jobTitle`, `teamRel.name`, `teamRel.color` | Paths on a person. |
| `awayFilter` | none | Elasticsearch request for leave covering today; its people show **On leave**. |
| `awayField` | `employeeRel.documentId` | Path on a leave record to its person. |
| `focus` | `"all"` | `"document"`: this person's line and reports. Read once. |
| `expandDepth` | `2` | Levels open at first. |
| `height` | `"70vh"` (`auto` in focus mode) | The chart's viewport. |
| `hideLabel` | `false` | |

The tree logic is in hr-kit (`orgtree.ts`: `buildOrgTree`, `reportingLine`, `searchPeople`).

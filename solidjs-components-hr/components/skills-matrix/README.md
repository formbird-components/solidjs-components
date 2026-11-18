# `<solid-skills-matrix>`

People by certificate type. Each person's latest certificate of each type (a renewal replaces the
old one) is a chip in their row:

| Chip | Means |
|---|---|
| ✓ **Mar 27** (green) | Held, valid until the month shown |
| ⏱ **12 d** (amber) | Expires within `warnDays` |
| ! **Expired** (red) | Expired |
| **Missing** (red, dashed) | Required by the person's position, not held |
| ✓ **Held** (blue outline) | Held, not required |

Above the table: the share of required certificates held (a ring), and how many are expired,
expiring and missing. Rows are grouped by team, with each team's and each person's compliance as a
ring at the end; each column header counts what needs fixing in it.

- **Needs attention** shows only people with something expired, expiring or missing.
- The search box finds people by name, title or team.
- **Export CSV**: the people shown, each certificate's state and expiry, and their compliance.
- A chip opens its certificate. With `templateId`, a gap starts a new certificate with the person and
  type filled in (`openNewDocument`), as does the faint **+** in any empty cell.

It loads again after any save in the app. It stores nothing.

| Option | Default | |
|---|---|---|
| `peopleFilter` | active accounts | Elasticsearch request for the rows. |
| `typesFilter` | required | Elasticsearch request for the certificate types (the columns), in order. |
| `filter` | the HR app's certificates | Elasticsearch request for the certificates. |
| `personField`, `typeField`, `expiryField`, `issuedField` | `personRel.documentId`, `certTypeRel.documentId`, `expiryDate`, `issuedDate` | Paths on a certificate. |
| `requiredField` | none | Path on a person to the type ids their position requires, read through arrays: `positionRel.requiredCertsRel.documentId`. |
| `groupField`, `detailField` | none | Group rows by this path (`teamRel.name`); a second line under each name (`jobTitle`). |
| `shortField` | none | Field of a type with its short header (`shortName`); otherwise long names become initials ("WWCC"). |
| `warnDays` | `30` | Days ahead that count as expiring. |
| `templateId` | none | Template of new certificates, for gaps. |
| `personValueFields`, `typeValueFields` | none | What a new certificate keeps of its person and type besides documentId and name. |
| `gapsOnly` | `false` | Start on **Needs attention**. |
| `hideLabel` | `false` | |

The logic is in hr-kit (`matrix.ts`: `latestCerts`, `matrixCell`, `compliance`; `certState` in
`logic/certs.ts`, which the certificate rules also use).

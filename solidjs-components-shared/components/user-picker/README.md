# `<solid-user-picker>`

Assignee, reporter or watchers, with avatars (initials on a colour from the name, or a photo), emails,
and **Assign to me** / **Add me** for the signed-in account. It accepts `sc-related-document`
definitions unchanged.

| Option | Default | |
|---|---|---|
| `filter`, `relatedFields`, `singleSelection`, `showDropDown` | | As for `sc-related-document`. SDMS sets the account filter from a ruleset on load (`ntf.scope.setFilter`), which is picked up live. Until then, active accounts are listed. |
| `emailField` | `"email"` | Shown under each name. |
| `avatarField` | none | Account field holding a photo URL. |
| `showAssignToMe` | `true` | "Assign to me" stores the account with the same `relatedFields` as a normal pick. |
| `emptyLabel` | `"Unassigned"` (single), `"None"` (multiple) | |

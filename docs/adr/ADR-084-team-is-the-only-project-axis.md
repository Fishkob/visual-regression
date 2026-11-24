# ADR 084: The Team Is the Only Project Axis (Groups Are Dropped)

## Status

Accepted — 2026-11-23. Retires the `ProjectGroup` table and the `Group` term in
CONTEXT.md. Supersedes no earlier decision: ADR-082 called a group “navigation,
not access” and left it standing; this ADR removes that navigation half because
the team now carries it ([ADR-083](./ADR-083-project-always-has-a-team.md) makes
the owner mandatory, so every project already sits in exactly one bucket that
means something).

Enforced by: the table and the column are gone, so a `groupId` cannot be written
— the Prisma schema, the compiler and the swagger/SDK drift check all refuse it
— and the surface that replaces it is covered by one e2e case per list: the
project list and the review inbox section by the owning team, and a foreign
team's project is absent from both. Not enforced: nothing prevents a later
“tag” feature; that would be a new decision, not a quiet re-addition.

## Context

A project carries two organizational foreign keys. `teamId` decides who may open
it; `groupId` was a label that “does not affect a Project's tests or review state,
and grants no access”. The label is maintained by any member (`POST`, `PATCH` and
`DELETE /groups` carry no `@Roles`; the generic project patch and
`PATCH /projects/bulk/group` neither), while the team is `ADMIN`-only. So the
label was never governance — it was filing.

Three observations retired it.

**The two lists grouped by the axis that decides nothing.** The project list and
the review inbox are sectioned by group, while the axis that decides everything —
the team — sat in a filter on the inbox and, for a `MEMBER`, behind an `ADMIN`
read. With ADR-083 every project has a team, so the section header can state both
the grouping and the reason for it.

**The one thing a group could do that a team cannot is now a property.** A group
could bundle across teams (the demo's `Internal tools` held a Backoffice project
and a shared one). ADR-083 expresses that case per project: the owner names who
maintains it, `isShared` says everyone may look. That is a badge on a row, not a
folder with its own lifecycle, its own page and its own delete rules.

**The question had no good answer.** “Why do we have groups?” is answerable only
with a paragraph about a nullable team — and the paragraph ends by admitting the
label grants nothing. A concept that needs that paragraph to justify itself is a
concept the product no longer has a use for.

What is genuinely lost: a `MEMBER` could file projects into a folder without
asking an `ADMIN`. That is accepted — filing has no effect on tests, baselines,
review state or access, and the order that matters now follows from ownership.

## Decision

1. **`ProjectGroup` is dropped**: the table, `Project.groupId` (with its foreign
   key and index), `ProjectGroupRepository` / `ProjectGroupService`, the four
   `groups` endpoints, the scoped `projectCount` query behind the group badges,
   and the `409` that refused deleting a group holding projects the caller cannot
   see.

2. **`groupId` disappears from every payload and query**: `CreateProjectDto`,
   `UpdateProjectDto`, `ProjectsListQueryDto` (with the `unassigned` sentinel),
   the review-inbox query and item DTO, the global search result.

3. **`PATCH /projects/bulk/group` is removed.** It moved up to 100 projects into
   a label; there is no label left to move them into.

4. **Both lists section by the owning team.** The review inbox and the project
   list show `Storefront`, `Backoffice`, `general` — never “Unassigned”. The
   inbox keeps its team _lens_: it narrows the page, while the section header
   labels a block inside it, and those answer different questions (what is in
   front of me now vs. what does this block contain). Removing the lens is not
   implied by this ADR.

5. **The Teams page becomes the place where a team's projects are read and
   changed** (add/remove), replacing the admin's cross-team folder as the
   organizing surface. Ownership is edited where ownership lives.

6. **No replacement concept.** No `Tag`, no “category”, no free-text label. A
   deployment that needs cross-team categories gets a `Tag` + `ProjectTag`
   (filter-only, no structure) and its own ADR.

7. **Group labels are dropped with the column.** Nothing else is: projects,
   branches, tests, baselines, comparisons, approvals and audit rows are
   untouched. A deployment that wants its folder names keeps them by exporting
   `GET /groups` and the projects' `groupId` before the migration.

## Rejected alternatives

- **Keep the groups and only remove the page** (the “degrade” middle step: no
  `/groups` nav entry, rename/delete moved into the bulk bar). It removes the
  place where the question is asked, not the axis that causes it. The label,
  the filter, the sentinel and the section builder would stay, and the next
  person would ask the same question with less evidence.

- **Keep the group as a filter-only tag.** A concept that must be created,
  renamed, explained and eventually cleaned up, while the owner already answers
  “which projects belong together”. If a deployment wants tags, it should get
  tags — not a renamed group carrying the old endpoints.

- **A folder _inside_ a team** (`group.teamId`, each team its own folders). Two
  levels for one question, and the folder would inherit the team's access — a
  second truth about visibility, maintained per team, with the cross-team case
  impossible again.

- **The group as the access boundary.** Already rejected in ADR-082: renaming a
  folder would become a security change.

## Consequences

- **One axis**: `User → Team → Project`. The section headers read `Storefront`,
  `Backoffice`, `general`, and the vocabulary “Unassigned”, “Assign to group” and
  “Move to group” disappears.

- **A `MEMBER` loses self-service filing.** Accepted (see Context); the counter
  is the Teams page, where an `ADMIN` moves projects in bulk if a deployment
  needs it.

- **The API contract shrinks.** Four endpoints, one bulk endpoint and five
  `groupId` fields are removed with no deprecation window — the label grants
  nothing, and a deployment can export it first. The release notes must name it.

- **Tests and baselines move with the feature**: the group specs and the groups
  quality case disappear with the page; the section specs re-point from groups to
  teams; the project list, inbox and settings baselines change.

- **The delete guard goes away with the feature it guarded** (a group holding
  projects the caller cannot see answered `409`; there is no such write any more).

## Landing order

1. Schema and migration: drop the table and the column.
2. The API: remove the endpoints, the bulk move and every `groupId` field; the
   section payloads carry the owner's name (`teamId`/`teamName` on the project
   list and the inbox item); regenerate the SDK.
3. The frontend: delete the groups surface, section both lists by owner, add the
   project list to the Teams page, drop the group row from the project settings.
4. Documentation: CONTEXT.md loses `Group` and gains the section rule, the
   permission notes in `docs/permissions.md`, the ADR index.

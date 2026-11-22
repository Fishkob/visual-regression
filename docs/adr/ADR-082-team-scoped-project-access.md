# ADR 082: Project Access Is Scoped by Team Membership

## Status

Accepted — 2026-11-20. Partially supersedes [ADR-031](./ADR-031-users-roles-permissions.md):
its "per-project memberships (rejected for v1)" alternative is replaced, the
global role decision (`ADMIN`/`MEMBER`/`VIEWER`, one enforcement point in the
guard) stands unchanged. Does not open multi-tenancy — see **Scope of this
decision**.

Amended 2026-11-20: decision 7's "every route carries one of two decorators" has
three — `@ProjectScoped()`, `@ProjectSpanning()` and `@GlobalRoute()` — because a
two-value rule forced `/health`, `/auth/login` and `/api-keys` to claim a project
surface they do not have, and a declaration that is false is worse than none. The
requirement is unchanged: a route declares exactly one kind and the contract test
refuses a route without one.

Amended 2026-11-22: two sentences had become false without a decision changing.
The landing order no longer restates which steps have landed (the roadmap owns
status), and the audit consequence no longer claims a scope filter — the trail is
`ADMIN`-only, so it needs none. One deviation is named rather than fixed:
decision 2's "the project settings page must say so" holds for an `ADMIN` only,
because that panel reads the admin-only team list; a `MEMBER` sees which projects
they may open, not who owns them.

Enforced by: `ProjectScope` as a required (non-optional) parameter on every
project-spanning read (compile error when omitted, like `actor: string`), the
route metadata `@ProjectScoped()` / `@ProjectSpanning()` checked by
`test/unit/common/http/project-route-contract.spec.ts` — which reads the routes
from the real application graph and cross-checks them against the committed
`swagger.json` — and one e2e case per leaked surface.

## Context

Access today is one global role per user, enforced once in the global
`AuthenticationGuard`. The consequence is that a team cannot share one
installation without handing every member every product: a reviewer on
"checkout-ui" sees the baseline, the pending comparisons and the audit trail of
"billing-api" too. Groups do not help — `ProjectGroup` is explicitly an
organizational label that "does not affect a Project's tests or review state",
and ADR-031 rejected per-project memberships outright for v1.

Two things make this cheaper than ADR-031 assumed, and one makes it more
expensive.

**Cheaper:** a project-scoped credential already exists. An API key can carry a
project allowlist (`ApiKey.projectIds`), and the guard already resolves a
request's `:projectName` to an id and compares (`enforceApiKeyAccess`). Team
access is the same predicate — "which projects may this principal see" — applied
to the second credential type. It is a generalization, not a new mechanism.

**Cheaper:** the scoping unit is the _project_, and every downstream row already
reaches it (`branch.project`, and every test is branch-scoped). Nothing below a
project needs a team column.

**More expensive:** the API-key allowlist never had to filter. A key outside its
allowlist simply cannot name a route it is not allowed to call. Team access must
also _narrow list reads_ — the review inbox, the project list, global search,
group counts, the audit trail, assignments — and a filter is forgotten far more
easily than a thrown exception.

The prototype also carries two gaps that must not be copied:

- Its fallback is a **path regex** (`/^\/api\/v1\/(projects|review|groups|inbox|audit|users|search)(\/|$)/`)
  for routes that name no project. That is exactly the "guess from the path"
  rule ADR-045 removed for scopes, and the guard's own comment records what it
  cost once: a project literally named `auth` matched the account-lifecycle
  path check.
- It only sees `:projectName` in the **path**. `PATCH /projects/bulk/group`
  takes up to 100 project names in the body, and nothing checks them.

## Scope of this decision

A team scopes _which products a person sees_. It is not a tenant: there is one
user directory, one audit trail, one deployment configuration, and no tenant id
on any row. Teams never change how a project's tests, baselines or review state
work — two members of the same team see the same project exactly as two members
of one global role do today.

## Decision

1. **A project is owned by at most one team.** `Project.teamId` is a nullable
   foreign key with `onDelete: Restrict` and its own index. One owner, not a set:
   "who is responsible for this product" stays answerable, the visibility
   predicate stays a scalar comparison, and sharing — if it is ever needed — is
   an additive join table, not a rewrite of the rule.

2. **`Project.teamId = null` means _shared_, and shared is visible to every
   authenticated principal.** The upgrade therefore changes nobody's view: the
   migration leaves every existing project untagged, and an operator tags
   projects as they build teams. A new project without a team is shared, not
   invisible — a forgotten assignment causes an unexpected sighting, never a
   silently unreachable product. This is the one deliberate fail-open in the
   design, and the project settings page must say so ("no team — everyone").

3. **Membership is `TeamMember(teamId, userId)`, and access is the union of the
   member's teams.** There is no per-user project grant: teams are the only way
   to narrow access, so "why can this person see it" has one answer. A user in
   no team sees only shared projects.

4. **`ADMIN` sees every project, and `ADMIN` is the only role that administers
   teams** (`@Roles('ADMIN')` + `@SessionOnly()`, audited like user management).
   Being a member of a team grants no administration over it: no team-lead role
   is introduced here, so the permission matrix stays 3 × 2 (role × scope)
   instead of 3 × N. _How much_ a person may do inside their projects is still
   the global role, unchanged.

5. **One owner of the predicate.** A `ProjectScope` value
   (`{ kind: 'all' } | { kind: 'ids', ids: ReadonlySet<string> }`) is resolved
   once per request from the authenticated principal, in one service. Its
   consumers are the guard (named routes) and the repositories (list reads); no
   other place re-derives "which projects".

6. **Named-project routes are refused, project-spanning reads are filtered.**
   For a route with `:projectName`, the guard resolves the name to an id and
   answers **`404`** outside the scope — not `403`, because a project name is
   user-supplied and guessable, so a distinguishable answer confirms the
   existence of another team's product. (The API-key allowlist's `403` is
   unchanged by this ADR; unifying the two status codes is a separate call.)

7. **The declaration is route metadata, never a path pattern.** Every route
   carries `@ProjectScoped()`, `@ProjectSpanning()` or `@GlobalRoute()` (see the
   amendment above); a route with none fails the contract test, so a new endpoint
   makes the decision instead of inheriting one. A scoped route must name its
   project in the path — the contract test pins that — and the two routes whose
   project comes from the row they act on are named exceptions, each pointing at
   the service that asserts the scope instead. A project-spanning read method takes `scope: ProjectScope`
   as a **required** argument — `'all'` must be written out — mirroring the
   "the signature carries the rule" convention that already forbids
   `actor?: string`. Required in the service signature, so forgetting the filter
   does not compile; the contract test covers the routes that pass their scope
   through untyped.

8. **Project references in a request body are checked too.** A route that names
   projects outside its path (`PATCH /projects/bulk/group`, and any future
   batch endpoint) asserts the scope per name inside the transaction that writes
   them, with the same owner — not with a second regex.

9. **An API key inherits its owner's scope.** The key's effective scope is the
   intersection of its owner's `ProjectScope` and its own allowlist; a key with
   no owner keeps its allowlist semantics. A team boundary that a CI key from a
   different team can cross is not a boundary.

10. **What has no principal is unchanged.** Comparison jobs, retention sweeps
    and webhook deliveries already act per project and never cross-read. A share
    link stays the deliberate anonymous exception: it is project-bound by its
    token, and creating one goes through a project-scoped route, so a member
    cannot mint a link into another team's project.

## Rejected alternatives

- **Reuse `ProjectGroup` as the access boundary.** Free schema-wise, wrong in
  kind: a project belongs to at most one group, groups exist for navigation and
  inbox grouping, and renaming a group would become a security change. It
  would also make the CONTEXT.md rule "groups do not affect review state"
  false, which is a rule the whole UI rests on.
- **Many teams per project (`TeamProject` join).** More flexible, but it makes
  "who owns this product" ambiguous, turns every scoped read into a join, and
  can only be narrowed later. Starting at 1:n and adding an explicit
  "shared with team" table when a deployment asks keeps both the rule and the
  migration additive.
- **Multi-tenancy (a tenant column on every table).** Every query, job payload
  and storage path would need it, and it would split the user directory and the
  audit trail — a different product. Teams are a visibility boundary on
  projects; nothing above a project changes.
- **Per-user project grants, teams as a management convenience.** Enforcement
  would be identical (the same `ProjectScope`), but it is a matrix an operator
  maintains by hand and a question ("may this person see it, and why?") with no
  single answer. Kept in reserve: if teams prove too coarse, this is the
  additive extension, because it reuses the same predicate.
- **Filter in the repositories only, no guard.** The inbox would narrow while
  `GET /projects/:name` kept answering for anybody — the "one place" rule
  becomes two. The guard stays the enforcement point, the repositories consume
  its scope.
- **Guard only, no repository filters.** Impossible: a list endpoint has
  nothing to refuse, it has to narrow.

## Consequences

- **One extra query per session request** (the member's team → project ids),
  skippable for `ADMIN`. It rides the user read the guard already performs.
- **Every project-spanning read becomes a scope-aware read.** That is the real
  work: the review inbox and its branch list, the project list and its pending
  counts, global search, group counts, the audit log, assignments, and the
  project detail read. A query that forgets it is a leak, which is why the
  parameter is required and the routes are contract-tested.
- **Team deletion is refused while the team still owns projects** (`Restrict`),
  because deleting the team would silently turn its products into shared ones.
  The service answers `409` with the count; the operator moves the projects
  first.
- **Audit and approval rows** already carry `projectId` (ADR-061), so a scope
  filter would need no name lookup. No such filter is applied to the audit read:
  the trail is `ADMIN`-only, whose scope is everything. User-administration rows
  have no project and stay `ADMIN`-only.
- **The frontend mirrors, it does not enforce**: `/auth/me` carries the caller's
  teams and whether it sees everything; nav, the inbox's project filter and the
  empty states read that. A stale UI is still handled as an error, never as
  success.
- **Existing e2e fixtures change shape**: a `MEMBER` created by a fixture no
  longer sees a project unless it is shared or the user joins its team. This is
  the intended break and must be visible in the suite, not papered over with a
  default team.
- **`CONTEXT.md` gains the term `Team`** ("an owner of projects that scopes what
  its members can see; `null` means shared") and amends the `Group` entry to
  say access is scoped by Teams, not Groups — in the commit that lands the
  first phase, not before, because until then no such rule is true.

## Landing order

Nothing below may ship half-applied; each step leaves a green gate. Step 5 is the
documentation close-out, and which steps have landed is
[`docs/roadmap.md`](../roadmap.md)'s answer — not this one's.

1. Schema, migration, `Team`/`TeamMember` administration (session-only, admin,
   audited) and the project→team assignment on the project settings page.
   No enforcement yet: access is what it is today.
2. `ProjectScope` owner + route metadata + the contract test; the guard refuses
   named-project routes outside the scope, and the API-key allowlist moves onto
   the same primitive. (At this point a member and a key see the same set.)
3. The project-spanning reads: inbox, project list and counts, search, groups,
   assignments — each with a repository policy test and one e2e case proving a
   foreign project is absent, not merely unopened. The audit trail stays
   `ADMIN`-only and needs no filter.
4. The frontend: `/me`, team admin screens, the inbox's team lens, empty states.
5. Documentation: `CONTEXT.md` term + `Group` amendment, `docs/permissions.md`
   scope column, and moving this item out of the roadmap's candidates.

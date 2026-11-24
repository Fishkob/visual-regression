# ADR 083: A Project Always Has a Team, and “Everyone” Is a Flag

## Status

Accepted — 2026-11-23. Partially supersedes
[ADR-082](./ADR-082-team-scoped-project-access.md) decisions 1 and 2: the owner
becomes mandatory, and “visible to every authenticated principal” becomes an
explicit flag on the project instead of a missing owner. The rest of ADR-082
stands unchanged — one owner per project, team membership as the only way to
narrow access, `ADMIN` sees everything and is the only role that administers
teams, `ProjectScope` as the single owner of the predicate, and the `404`
(never `403`) answer for a project outside the caller's scope.

Enforced by: `Project.teamId` is `NOT NULL`, so the database refuses an
ownerless project; `Project.isShared` is `NOT NULL DEFAULT false`; the predicate
keeps one owner — `ProjectScopeService` resolves the scope per request and
`TeamsRepository.findVisibleProjectIdsForUser` is the only query that derives it
— and every project-spanning read keeps taking `scope: ProjectScope` as a
required argument (ADR-082), so a new list endpoint cannot skip the decision.
Three e2e cases pin the directions: a member of another team reads a shared
project, gets `404` on a private one, and a creator without a team is refused.

## Context

Access today is `Project.teamId`, nullable, where `null` means _shared_ — visible
to every authenticated principal. That was a migration argument, not a product
argument: the upgrade of 2026-11-20 had to change nobody's view, so an untagged
project had to keep answering. The consequence is a deliberate fail-open: a
forgotten assignment causes an unexpected sighting, never a silently unreachable
product.

Two things make that trade wrong now.

**Ownership is answerable for the projects that need it least.** ADR-082
decision 1 justified “one owner, not a set” with “who is responsible for this
product stays answerable”. Under a nullable owner the answer is missing exactly
where the visibility is widest: the shared projects are the ones every person in
the installation can open and nobody is responsible for.

**“No team” is not a state, it is a hole.** The UI has to explain it (“shared —
visible to everyone”), an operator reads it as a forgotten assignment, and the
question cannot be answered with a name. The state exists only because the first
migration needed it.

The fail-open was also narrower than it looked. With a mandatory owner, a
forgotten assignment means “visible to its own team”: the owning team always
sees its project, so the product is never unreachable — the risk ADR-082 wanted
to avoid is covered by the owner, not by the absent one. Fail-closed costs
nothing here.

Behind the null sit two different questions, and one column could not answer
both: **who owns this project** and **who may look at it**.

## Decision

1. **`Project.teamId` is `NOT NULL`.** `onDelete: Restrict` and its index stay:
   a team that owns projects is not deletable, and a project always has exactly
   one owner.

2. **`Project.isShared` is `boolean NOT NULL DEFAULT false`.** True means every
   authenticated principal may read the project _in addition to_ the owner's
   members. It is not a second owner and grants no administration.

3. **The predicate keeps one owner and one shape.** `findVisibleProjectIdsForUser`
   becomes `OR: [{ team: { members: { some: { userId } } } }, { isShared: true }]`.
   `ProjectScope` (`'all' | ids`), `projectIdFilter(scope)`, the `ADMIN` →
   `'all'` rule and the API key's intersection with its allowlist are unchanged.

4. **Creating a project requires an owner.** An `ADMIN` names any team, a
   `MEMBER` one of its own teams, and a member that belongs to none is refused
   with `409` and a message that says so. The New Project dialog preselects the
   creator's first team (an `ADMIN` gets a select). An upload never creates a
   project — it resolves an existing one and answers `404` otherwise
   (`PrismaProjectRepository.requireByName`) — so CI is unaffected.

5. **Visibility is its own route, not a field on the generic patch.**
   `PATCH /projects/:projectName/visibility` (`@Roles('ADMIN')`,
   `@SessionOnly()`, audited as `project.visibility`) is the exact sibling of
   `PATCH /projects/:projectName/team`, for the same reason: the generic project
   patch is gated by an API-key scope rather than by `@Roles`, so a
   visibility-widening capability must not ride on a rename.

6. **`GET /projects/:projectName` carries `isShared`** next to
   `teamId`/`teamName`, readable by every principal that may open the project —
   the same rule as the owner's name: naming the state is not changing it.

7. **The migration adopts the untagged projects into one ordinary team**
   (`general`) and sets `isShared = true` on those projects, then applies
   `NOT NULL`. Behaviour is identical for every principal, and the adopting team
   needs no members: its projects are visible through the flag, not through
   membership. A deployment with nothing to adopt gets no such team. `general`
   is a normal team — renameable, and deletable once its projects have moved.

8. **`seesAllProjects` keeps its meaning** (`ADMIN`, or a key without an owner
   or allowlist). A member that belongs to no team sees the shared projects, and
   the empty states say that instead of “your team has no projects yet”.

## Rejected alternatives

- **Keep the nullable owner and call `null` “Alle” in the UI.** No migration, no
  schema change, and the model stays wrong: the most visible projects keep no
  responsible team. That is the property decision 1 exists for, not a cosmetic
  gap.

- **A pseudo-team `Team.isEveryone` — “a team everyone is in”.** It reads well in
  one sentence and breaks in four places. It makes “owned by Storefront _and_
  visible to all” impossible, because a project has one team. It puts the most
  visible products into a team with no members, which is the ownerless bucket
  again, now with a label. And a team that is not a team leaks: the Teams page,
  the member dialog, the assignment dropdown and the inbox lens all have to know
  the exception, plus guards against renaming, deleting and editing its members.
  A boolean that says what it means is cheaper than a fake team.

- **A `PUBLIC` role.** Roles are capability, not visibility (ADR-031, ADR-082): a
  role would make _some_ projects visible to _everyone holding it_, and still
  could not say which projects are public. It would reintroduce the second axis
  this ADR removes.

- **Many teams per project, or per-user grants.** Unchanged from ADR-082 and
  rejected for the same reasons; a mandatory owner is now the smallest version
  of “one team” that cannot leave a project unowned.

## Consequences

- **The failure mode flips, deliberately**: from “a forgotten assignment is
  visible to everyone” to “a forgotten assignment is visible to its own team”.
  Nothing leaks by omission, and nothing becomes unreachable, because the owner
  always sees its project.

- **Ownership is answerable for every project**, including the previously shared
  ones. The shared state survives as a described property, not as an absence.

- **One more audited action** (`project.visibility`) and one more column in the
  project payload; the project settings panel gets a “visible to everyone”
  toggle next to the owner.

- **A shared project of another team is visible and names its owner.** That is
  the point, but the badge is what keeps it from reading as a scope bug.

- **Team deletion is still refused** while a team owns projects (`Restrict`), and
  the adopting team is not special: it can be emptied and deleted like any other.

- **Existing API keys are unaffected in kind**: a key without an owner keeps its
  allowlist semantics, one with an owner inherits the owner's now stricter scope.

## Landing order

1. Schema and migration: both columns, the adopting team, then `NOT NULL`.
2. The predicate, the creation rule, the visibility route, the DTO field, the
   audit action, and the regenerated SDK.
3. The frontend: the owner row and the visibility toggle in the project
   settings, the flag in the lists, the empty-state copy.
4. Documentation: CONTEXT.md's `Team` entry, `docs/permissions.md`, the ADR
   index.

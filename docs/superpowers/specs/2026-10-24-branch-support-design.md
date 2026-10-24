# Branch-Scoped Baselines — Design

## Status

Accepted — 2026-10-24. Awaiting implementation.

## Context

The platform stores exactly one BASELINE per `(UnifiedTest, Variant)`. CI uploads
a screenshot, the server compares it against that single baseline, and a reviewer
approves or the next upload supersedes the pending comparison.

This model assumes all uploads describe the same line of development. As soon as
two Git branches upload, they compete for the same baseline:

- A reviewer approving a feature-branch screenshot promotes experimental content
  into the baseline that `main` will be compared against.
- Two branches uploading the same variant supersede each other's pending
  comparisons, so reviews silently disappear.
- There is no way to review a branch's visual changes in isolation, and no way to
  tell which branch a pending comparison came from.

Branches are the natural unit of review in a Git-based workflow (and the unit
users know from Percy/Chromatic/Argos). This design makes the baseline and the
review state branch-scoped while keeping the existing test/variant/comparison
pipeline intact.

## Goals

- Give every project a default branch and any number of feature branches.
- Scope tests, baselines, comparisons, review status and thresholds to a branch.
- Let a feature branch inherit the target branch's baseline until it approves a
  change on its own, then pin that variant to the branch.
- Show branch identity and filtering in the review inbox.
- Keep existing upload and read clients working: omitting `branch` means the
  project's default branch.
- Clean up branches through archive and delete, with safe storage reclamation.

## Non-goals

- Merging/promoting branch baselines into the target branch. After a Git merge,
  CI uploads on the target branch and produces a normal review.
- Reading Git state on the server, PR/MR links, commit SHAs, or build metadata.
- Multiple targets, rebasing a branch onto a different target, or automatic
  re-targeting when the default branch changes.
- Branch renaming (delete and recreate for now).
- Branch-scoped permissions, ownership, or API keys.
- Auto-archiving inactive branches.
- Cross-project branches.
- Changing the rejection model (there is no reject action; see ADR-023).
- A branch-level threshold configuration. Thresholds stay on baseline
  screenshots, which are branch-scoped by this design.

## Language

- **Branch** — a named line of development inside a Project. Owns its own tests,
  baselines, comparisons and review state.
- **Default Branch** — the project's authoritative branch. Every project has
  exactly one; it has no target and cannot be archived or deleted.
- **Target Branch** — the branch a feature branch inherits unowned baselines
  from. Exactly one per branch; the default branch has none. A `null`
  `targetBranchId` on a feature branch means "the project's current default
  branch" (it follows a later default change); on the default branch it means
  "no target".
- **Inherited Baseline** — a branch-local BASELINE screenshot row cloned from the
  target chain. It shares the file URL with its source and follows the target
  until the branch owns it.
- **Branch-owned Baseline** — a baseline that resulted from an approval on the
  branch. It no longer follows the target.
- **Branch View** — the effective test set of a branch: its own materialized
  tests plus the tests of its target chain that it has not materialized yet.
- **Materialize** — create the branch-local `UnifiedTest` row (and, on upload,
  its variant/baseline clone) for a name that until then only existed in the
  target chain.

Avoid: "fork" for a branch (it means the baseline clone), "merge"/"promote" for
baselines (explicitly out of scope), "branch" for the `environment` variant field
(branch is code, environment is deployment target).

## Data model

Add `Branch` and make `UnifiedTest` belong to it:

```prisma
model Branch {
  id             String   @id @default(cuid())
  project        Project  @relation("ProjectBranches", fields: [projectId], references: [id], onDelete: Cascade)
  projectId      String
  name           String
  targetBranchId String?
  targetBranch   Branch?  @relation("BranchTarget", fields: [targetBranchId], references: [id], onDelete: SetNull)
  derivedBranches Branch[] @relation("BranchTarget")
  defaultFor     Project? @relation("DefaultBranch")
  isArchived     Boolean  @default(false)
  createdAt      DateTime @default(now())
  tests          UnifiedTest[]

  @@unique([projectId, name])
  @@index([targetBranchId])
  @@map("Branch")
}
```

Add to `Project`:

```prisma
defaultBranchId String?  @unique
defaultBranch   Branch?  @relation("DefaultBranch", fields: [defaultBranchId], references: [id], onDelete: SetNull)
branches        Branch[] @relation("ProjectBranches")
```

Change `UnifiedTest`:

```prisma
branchId String
branch   Branch @relation(fields: [branchId], references: [id], onDelete: Cascade)
// projectId / project relation removed — the project is reached through the branch

@@unique([branchId, name])   // replaces @@unique([projectId, name])
```

Add to `UnifiedVariant`:

```prisma
isInherited Boolean @default(false)
```

`UnifiedScreenshot`, `UnifiedComparison` and `ComparisonJob` are unchanged.
Every test already owns exactly one branch, so the entire downstream chain
(variant → screenshot → comparison → status → retirement → approval) is
branch-scoped without further columns.

### Invariants

- `Branch.name` is trimmed, 1–255 characters, case-sensitive and free of control
  characters. Names may contain `/`; they are never path segments in the API.
- `Branch.targetBranchId` is null on the default branch and may be null on a
  feature branch (= inherit from the current default). A non-null value must
  reference a non-archived branch of the same project and must not create a
  cycle.
- `isInherited = true` implies the variant has a baseline row cloned from the
  target chain. It is `false` on the default branch and after a branch approval.
- `Project.defaultBranchId` is non-null for every project. It cannot point to an
  archived branch. The column is nullable in Prisma because the project row must
  exist before its first branch can be linked; the service enforces non-null
  (project creation and the migration set it in the same transaction).

## Flows

### Branch resolution and creation

- Upload resolves `(projectName, branchName)`. Missing `branch` → the project's
  default branch.
- A missing branch is created implicitly inside the upload transaction:
  `targetBranchId` = the explicitly supplied `targetBranch` id (must exist and
  be valid) or `null` (current default branch). The default branch is never
  implicitly created by upload; it is created with the project and backfilled
  by the migration.
- Upload to an archived branch fails with `CONFLICT` / `BRANCH_ARCHIVED`.
- Two concurrent first uploads upsert on `@@unique([projectId, name])`, so they
  converge on one branch row (same failure mode as `ensureTest` today).

### Baseline resolution and inheritance

A single owner, `BranchBaselineResolver`, resolves the baseline for
`(branch, test, variant)`:

1. The branch's own variant exists with `isInherited = false` → use its
   baseline.
2. The branch's own variant exists with `isInherited = true` → refresh the clone
   from the target chain (below).
3. No branch variant yet → look up the target chain recursively (cycle-guarded)
   for a baseline:
   - Found → clone it into the branch test's variant as a BASELINE row with the
     same `imageUrl`, `imageHash` and `pageCount`, `isInherited = true`. Initial
     `pixelDiffThreshold` is copied from the source.
   - Not found anywhere → no baseline; the upload becomes `BASELINE_CREATED` on
     the branch and the row is branch-owned (`isInherited = false`).

**Refresh rule** (case 2): copy `imageHash`, `imageUrl` and `pageCount` from the
target chain's current baseline, but preserve the branch's
`pixelDiffThreshold`. If the target chain no longer has a baseline, pin the
inherited clone (`isInherited = false`) so the branch keeps its last known
baseline; deleting the clone could orphan a pending comparison that still
references it.
Refresh is lazy (only on upload) and runs in the upload's transaction together
with the retirement of that variant's pending comparison, so a pending
comparison never points at a baseline whose content was refreshed underneath it.
The refresh applies only while `isInherited = true`; a concurrent approval that
pins the variant wins because both paths take the upload/approval transaction.

The clone shares the file URL; the existing storage referencedness rule already
prevents deleting a URL that any screenshot row still points at.

### Upload decision

`UploadDecisionResolver` resolves the baseline through `BranchBaselineResolver`
instead of the raw variant lookup. Consequences:

- The identical fast path compares against the effective (owned or inherited)
  baseline, read-only: it never clones, refreshes or pins. It therefore declines
  whenever the branch-local clone still needs the refresh the stored path would
  perform (the target moved, or the test is not materialized yet) — comparing
  against a stale clone would call an upload identical that the stored path would
  have compared against the target's new baseline, and the refresh would never
  run because the stored path only runs when the gate declines. On an inherited
  variant the stored path still materializes the clone, so the branch has a
  baseline row and its status is not `PENDING`.
- The stored path runs inside the existing `StateChangeWorkflow` transaction, so
  the clone refresh, the upload decision and the comparison/enqueue are atomic.
- `UploadParams` gains `branch` and an internal branch id; events and logs carry
  the branch name. Metrics are **not** labelled by branch (cardinality).

### Approval and threshold

- Approval keeps operating on `comparisonId`. The comparison's test identifies
  the branch; no branch parameter is needed. The approval writes the candidate
  into the branch's baseline and sets `isInherited = false`, pinning the variant.
- The target branch is never touched by a feature-branch approval.
- A threshold update on an inherited baseline updates the branch-local clone
  only and does **not** clear `isInherited`; subsequent refreshes preserve the
  branch threshold. The target's threshold is never modified from a feature
  branch.
- The inherited/owned state is part of the read model, not just internals: the
  test detail responses carry `baselineInherited` (whether the baseline is still
  a clone that follows the target) and `inheritTarget` (which branch it follows).
  The test-level `origin` says whether the _test row_ is materialised; the two are
  different facts and the UI shows both.
- Promoting a branch to default (see Archive and delete) flips all of its
  variants to `isInherited = false` in the same transaction: the new default has
  no target, so its baselines become authoritative.

### Status

- `TestStatusService` is unchanged. It computes a test's status from that test's
  variants, and a test belongs to exactly one branch, so the persisted status is
  branch-scoped by construction.
- There is no cross-branch aggregate status. Project list counts and the inbox
  either aggregate by their own explicit rule (inbox: all non-archived branches)
  or are branch-scoped by query parameter.

### Branch View (read-through)

A single read seam, `BranchTestRepository.findEffectiveTests(branch)`, returns the
Branch View: for every test name in the target chain that is not materialized on
the branch, the nearest ancestor's test row, tagged `origin = "inherited"` and
`inheritedFrom = <branch name>`; materialized tests are tagged
`origin = "branch"`. Used by:

- the project test list,
- the project overview variants,
- test kind/details resolution for a branch-scoped read.

Rules:

- The nearest ancestor with the name wins (chain is walked from the branch
  upward). Default branch rows are `origin = "branch"` when viewed on the
  default branch.
- Inherited tests are read-only in the branch context: no delete, no threshold
  update, no approval. A pending comparison on the ancestor remains the
  ancestor's review; the inbox links to the ancestor branch. Attempts to mutate
  an inherited test return `409 CONFLICT` (a name absent from both the branch and
  its chain stays `404`).
- Materializing a test on a branch whose name exists in the target chain must
  keep the same `kind`; a mismatch is `CONFLICT`, mirroring the existing
  ensureTest rule.
- The inbox deliberately does not read through: it lists real pending
  comparisons, each with its owning branch.
- The effective set is resolved and paginated in one query (a recursive CTE that
  walks the chain and keeps the nearest materialized row per name), not by
  fetching both sides and paginating in memory. The dataset is Postgres-only, so
  a recursive CTE is acceptable.

### Archive and delete

- **Archive** sets `isArchived = true`. Archived branches are excluded from the
  inbox default, but remain readable with an explicit `?branch=` and are listed
  (marked) in the project branch switcher — hiding them there made "unarchive"
  unreachable once the page had been left. Uploads are rejected with `409`
  (`CONFLICT` — there is no per-error machine code in the envelope); unarchive via
  `PATCH` first. Archiving keeps the branch's pending reviews pending: it stops
  new uploads, not the review, so no jobs are cancelled.
- **Delete** is branch-scoped: cancel pending jobs for the branch's tests,
  collect screenshot + diff URLs, delete the `Branch` row (cascade to tests and
  the existing chain), and reclaim storage post-commit through
  `filterReclaimableUrls`. The default branch cannot be deleted (`CONFLICT`).
- Deleting a branch that other branches target is **refused** (`409 CONFLICT`,
  listing the dependants). The FK is `onDelete: SetNull`, so allowing it would
  silently re-point them at the project default and their inherited clones would
  keep the deleted branch's content under a new label — that is exactly the
  automatic re-targeting this design rules out. Retarget the dependants first
  (`PATCH /branches`) and delete afterwards.
- **Set default**: promoting a branch clears its `targetBranchId` (the default
  branch has no target) and flips its variants to branch-owned. Demoting the old
  default leaves it target-less, which means it now inherits from the new default
  branch. Branches with an explicit `targetBranchId` pointing at the old default
  keep doing so; branches with `null` follow the new default.
- An archived branch can still be an existing target (it remains readable), but
  it cannot be chosen as a target for a new or retargeted branch.
- Project deletion cascades through `Branch`; the existing project deletion path
  changes from "tests by projectId" to "tests via branch.projectId".

## API

Branch names are always transmitted as URL-encoded query or form fields, never as
path segments, because Git branch names contain `/`.

### Upload

`POST /api/v1/projects/:projectName/tests/:testName/upload?testKind=…`

Form fields: existing `viewport`, `browser`, `environment`, `file` plus

- `branch?` — defaults to the project's default branch
- `targetBranch?` — defaults to the project's default branch; used only when the
  branch is created. Naming a _different_ target for an already existing branch
  is a `409`: accepting it silently would leave CI uploading against an
  inheritance it did not get.

Responses gain `branch: string` (additive). Errors add:

- `409 BRANCH_ARCHIVED` — upload to an archived branch
- `404` — explicit `targetBranch` not found
- `409` — cycle or target/kind mismatch

### Reads

All branch-scoped reads accept `branch?` (default: project default; archived
allowed when named explicitly):

- `GET /projects/:projectName`
- `GET /projects/:projectName/tests` — adds `origin`, `inheritedFrom`
- `GET /projects/:projectName/tests/meta/pending` — branch-local pending list
- `GET /projects/:projectName/tests/:testName` and `/kind`
- PDF source/details routes
- Threshold update
- `DELETE /projects/:projectName/tests/:testName` — deletes a branch-local test;
  inherited tests return `409`

Approval endpoints are unchanged (comparison-id based).

The project list (`GET /projects/pending`, the project overview) keeps its
cross-branch role: `pendingCount` counts pending comparisons across all
non-archived branches, and `testCount` counts distinct test names across those
branches (so branch duplication does not inflate it). Project detail is
branch-scoped via `?branch=`. The branch list's own `testCount` is smaller by
design — it counts the tests materialised on that branch, not the inherited ones
the branch view also shows.

### Inbox

`GET /review/pending?branch=&projectName=` — no filter means all non-archived
branches and all projects. Each row adds `branchName`, `isDefaultBranch`. The
frontend filters and badges by branch/project.

### Branch management

- `GET /projects/:projectName/branches?includeArchived=` — list with `name`,
  `isDefault`, `isArchived`, `targetBranchName` (effective target; null only for
  the default branch), `testCount`, `pendingCount`, `createdAt`
- `PATCH /projects/:projectName/branches?branch=` — `{ isArchived?, targetBranch? }`.
  `targetBranch: null` and naming the default branch both mean "inherit from the
  default branch" (normalized to `null`). One request is one transaction, so a
  failing retarget cannot leave the archive half applied; a body with neither
  field is a `400`.
- `DELETE /projects/:projectName/branches?branch=` — default branch → `409`
- `PATCH /projects/:projectName` — accepts `defaultBranchName` to change the
  project default

Validation: names are trimmed, length-checked, rejected if empty and rejected if
they contain control characters — on the query **and** the body path (one value
object, `normalizeBranchName`, is the single owner of the rule, so a name that can
be created is always a name that can be read back through `?branch=`). A repeated
`?branch=` parameter is a `400`. Targets must exist, belong to the project, be
non-archived, sit within the maximum chain depth and not create a cycle; the
validation runs inside the write transaction, so two concurrent retargets cannot
persist a cycle.

### SDK

Regenerate the client SDK. Add optional `branch` / `targetBranch` to upload
params and optional `branch` to the affected reads; expose the branch management
functions. No hand-editing of `.gen.ts` files.

## Frontend

- New `branches` domain: model, mapper, query keys, `useProjectBranches` and
  branch mutation composables.
- Project detail gets a branch switcher (default: default branch) and renders
  inherited tests with a badge; their actions are disabled.
- Inbox rows show a branch badge; filters by branch and project; archived
  branches are hidden by default (all non-archived branches shown when no filter
  is set).
- Review loop (`useReviewSession`, `review-pass`) carries `?branch=` through
  test-detail navigation; the pending list is branch-scoped and the inbox row
  links to its owning branch.
- Branch management in the project header: archive/unarchive, delete, set
  default, change target. Default branch has no destructive actions; delete asks
  for confirmation.
- Test detail URL stays `/projects/:projectName/tests/:testName?branch=…`.

## Migration

One Prisma migration, in this order:

1. Create `Branch` (with relations) and add `Project.defaultBranchId`.
2. Insert one `main` branch per existing project; set `Project.defaultBranchId`.
3. Add `UnifiedTest.branchId` as nullable; backfill from the project's default
   branch.
4. Drop `@@unique([projectId, name])`; drop `UnifiedTest.projectId`.
5. Make `UnifiedTest.branchId` NOT NULL; add `@@unique([branchId, name])` and
   the branch index.
6. Add `UnifiedVariant.isInherited` with default `false`.

Existing clients keep working because a missing `branch` resolves to `main`.
Existing tests, baselines, comparisons and jobs move wholesale to `main`; no
storage objects are rewritten. Baseline clones created later share URLs with
their source and are protected by the existing referencedness rule.

Query surfaces that currently traverse `test.project` must switch to
`test.branch.project`: status signals, project read models, pending counts,
inbox, deletion, PDF ownership, and the raw `getTestCounts` query. This is a
known, enumerated change surface.

## Testing

Unit:

- branch name validation; target validation (same project, archived, cycle)
- inherited baseline clone creation, refresh (content changes, threshold
  preserved), disappearance of the target baseline
- upload decision against owned vs inherited baselines, including identical
- approval flips `isInherited` and leaves the target untouched
- threshold update on inherited baseline stays branch-local
- Branch View effective test set (nearest ancestor, origin tagging, kind conflict)
- branch deletion URL reclamation and job cancellation; shared URLs survive
- archive rejection on upload

Backend E2E:

- `main` baseline → feature upload inherits and diffs → approval on feature →
  `main` baseline unchanged
- second feature upload compares against the feature baseline
- target baseline changes before the first feature approval → feature follows;
  after approval → it no longer follows
- inbox includes the feature comparison with its branch name; filter works
- archive → upload `409`; unarchive → upload works
- delete feature branch reclaims its files but not the shared target file
- legacy upload without `branch` lands on the default branch

Frontend:

- branch badge and filter in the inbox
- branch switcher; inherited tests marked and read-only
- review loop preserves `?branch=` across approve/skip/back
- branch management dialogs (archive, delete, default, target)

Verification: `lint` → `typecheck:all` → `format` → `unitTest`, frontend
`pnpm test`, SDK drift check (`sdk:generate` + `sdk:build`).

## Rollout

1. Schema + migration + `Branch`/resolver + upload params (backend only, default
   branch behavior unchanged).
2. Branch-scoped reads + Branch View + status/count queries.
3. API + SDK + inbox branch badge/filter.
4. Frontend branch switcher and management UI.
5. Branch lifecycle hardening (archive/delete/default/target) + cleanup tests.
6. Docs: ADR for branch-scoped baselines, `CONTEXT.md` glossary and
   implementation notes.

## Risks and trade-offs

- **Baseline drift after the first approval**: a feature branch then compares
  against its own approved state, not the moving target. This is deliberate
  (regressions inside the PR are caught) but must be visible in the UI via the
  inherited/owned distinction.
- **Double review**: without promote, merging into `main` produces a new review
  on `main`. Accepted for this iteration.
- **Wide query change**: replacing `test.project` with `test.branch.project`
  touches many read paths; the compiler is the safety net, and the Branch View
  seam centralizes the new inheritance logic.
- **Shared files**: baseline clones reference the same object as the target; all
  deletion paths must keep using `filterReclaimableUrls`. This is already the
  rule, but branch deletion adds one more caller.
- **Branch sprawl**: archive/delete plus default-branch protection are part of
  the scope; auto-archive is deliberately deferred.
- **Migration locking**: dropping/re-adding the unique constraint and a NOT NULL
  backfill on `UnifiedTest` needs a single migration; the dataset is small for
  the self-hosted target.

## Alternatives considered

- **Branch as a variant dimension** (`UnifiedVariant.branchId`): no test
  duplication and a natural read-through, but it invalidates
  `UnifiedTest.status` (which would need per-`(branch, test)` persistence) and
  forces every status/pending/inbox query to grow a branch dimension. Larger
  blast radius for no extra isolation.
- **Branch as a project-name convention** (`app@feature/x`): no schema work, but
  no branch entity, no target, no archive, and no clean review isolation.
- **Compare against the target forever** (no branch-owned baselines): avoids
  drift but never allows a feature branch to converge; repeated diffs against
  `main` would need a suppression mechanism, which is a larger feature than
  branch support.

## Open questions

None. Merge/promote, branch rename and PR metadata are explicit non-goals for
this iteration.

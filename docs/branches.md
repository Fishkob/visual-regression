# Branches

A `Branch` is a named line of development inside a Project and owns its own
tests, baselines, comparisons, review state and thresholds. The model — how a
feature branch inherits its target's baseline, when a variant becomes
branch-owned, and which guards the lifecycle has — is decided in
[ADR-027](adr/ADR-027-branch-scoped-baselines.md); the vocabulary is in
[CONTEXT.md](../CONTEXT.md#language). This page is the procedure around it: what
to do with a branch before and after its merge.

## Before the merge

1. CI uploads with the branch that produced the capture
   (`branch=<your branch>`, see [ci-integration.md](ci-integration.md#2-upload-captures)).
   Omitting `branch` means the project's default branch.
2. The first upload of a fresh branch finds no baseline of its own and inherits
   the target's: it is compared against the target branch's current baseline, and
   the clone shares the target's file instead of copying it.
3. A difference needs an approval **on the branch**. The approval writes the
   candidate into the branch's own baseline and pins the variant, so from then on
   the branch is compared against its own approved state — not against the moving
   target.
4. **Nothing of this reaches the target branch.** Approving on a feature branch
   leaves `main` exactly where it was, with its own baseline and its own pending
   reviews.

## After the merge

The platform does not know that a merge happened: a branch that has been merged
is an ordinary branch, and nothing is archived or promoted automatically. (An
idle branch can be collected by the branch retention window described at the end
of this page — that is a time trigger, not a merge trigger.) `main`'s baseline is still the pre-merge reference, so the first
run on `main` after the merge is the one that sees the change — it uploads the
merged UI, diffs it against `main`'s own baseline and asks for a review.

That review is the price of the model, and it is not optional: as long as
`main`'s baseline is the old one, the next branch that forks from `main` inherits
that stale reference and reports the change you already shipped as new. Order
matters:

1. **Approve on the target branch.** Until this happens the target's baseline is
   stale. The diff is usually the same one you already approved on the feature
   branch, because both compare the same two images; it is genuinely new only if
   the target moved while the branch was open, in which case this is the review
   that looks at the combined result.
2. **Archive the branch** if its pipeline may still run: uploads are rejected
   with a `409`, and the branch disappears from the inbox, the project list and
   global search. Its tests, screenshots and runs stay readable.
3. **Delete the branch** when you no longer need its run reports. This is the
   only step that frees the name and the storage.

Steps 2 and 3 are one action in the branch menu — **Archive & delete branch** —
which archives first and deletes second, so uploads stop even if the deletion is
refused.

### What a deletion takes with it

| Kept                                                         | Removed                                            |
| ------------------------------------------------------------ | -------------------------------------------------- |
| `Approval` rows (who approved what, with hashes)             | the branch and its tests                           |
| `AuditEvent` rows                                            | variants, screenshots, comparisons and their files |
| `ComparisonOutcomeEvent` rows (trends, flake rates)          | queued and pending comparison jobs                 |
| files the target branch still references through inheritance | the branch's runs and run uploads                  |
|                                                              | the branch's `BaselineRevision` history            |

The last two are the ones that surprise people: a run report URL stops working as
soon as its branch is deleted, regardless of the project's run-history retention,
and the branch's undo history goes with its tests. Approve or restore before you
delete, not after.

### Branches that others inherit from

A deletion is refused with `409` while another branch names this one as its
target, and the response lists those dependants. That guard exists because the
foreign key would otherwise silently re-point them at the project default, and
their baseline comparisons would change without anyone noticing. Re-target the
dependants first (`Change target…`), then delete.

The archive half of the combined action is not blocked by that guard: an archived
target still resolves baselines for the branches that inherit from it, it only
rejects its own uploads.

## Cleaning up branches nobody uses any more

Branches are created by the first upload that names them, and the platform never
learns that the Git branch behind one was merged or deleted. Without a setting,
that list only grows: the branch of a long-merged pull request still shows next
to the two that are alive.

`BRANCH_RETENTION_DAYS` turns on an automatic sweep. It is **off by default (0)**;
set it on the worker (or with `Project.branchRetentionDays` per project, in the
same dialog as the other retention limits) to the number of days a branch may
stay quiet before it is deleted with the same cascade and the same audit row as a
manual delete. The audit actor is `system:branch-retention`.

**What counts as activity is uploads.** A branch is a candidate when it has seen
no upload for the window. Every successful upload touches the branch's activity
clock, whether the upload was identical, created the baseline or queued a diff,
and whether or not it carried a run key. Reviews do not keep a branch alive: an
approval on a merged branch does not reset its clock.

The sweep never touches:

- the project's **default branch**;
- an **archived** branch — archiving is the reversible way to keep one, so archive
  a branch you want to keep past the window instead of deleting it early;
- a branch **another branch targets** (re-target the dependants first, exactly as
  for a manual delete);
- a branch with an **unreviewed comparison** — pending review work is never
  destroyed, so that branch waits until the review is approved, retired or the
  branch is deleted by hand.

`Preview cleanup` on the project's storage panel runs the same predicate and
reports how many branches the next sweep would delete, without deleting
anything. Because the window is destructive and irreversible, pick a value above
your longest expected branch dormancy (a frozen release branch, a PR waiting on
design), and raise it rather than lowering it — the first sweep after an upgrade
only collects branches that were already idle for the full window.

# ADR 050: Approval Votes Are Audit and Outlive the Test

## Status

Accepted — 2026-11-01. Supersedes the `ApprovalVote` cleanup decision in
[ADR-042](./ADR-042-review-artifact-lifecycle.md).

## Context

ADR-042 treated `ApprovalVote` like `ReviewComment`: a row with no foreign key to
the test, deleted with the test and swept when the test was already gone. That
kept the tables tidy, but it erased the only record of the individual reviewers.

`Approval` is written once, when the approval threshold is reached. On a project
with `requiredApprovals > 1`, the votes are what show _who_ the four eyes were;
after deletion the surviving `Approval` row has no supporting votes, so the
question "which reviewers approved this?" becomes unanswerable. The schema
comment already promised the opposite ("the record of who approved what must
survive all of it").

## Decision

`ApprovalVote` is audit and is never deleted with the test, branch or project.

`ReviewArtifactRepository` deletes only `ReviewComment` on test/project deletion,
and `ReviewArtifactCleanupTask` sweeps only orphaned comments. Votes stay for the
lifetime of the database, like `Approval` and `AuditEvent`. `ReviewComment`
remains non-audit discussion and is still removed with its test.

## Alternatives considered

- **Keep deleting votes on project deletion only.** Rejected: "we deleted the
  project" is exactly the case where the approval trail matters most.
- **Copy the votes into `AuditEvent` before deleting them.** Rejected: it
  duplicates a structured trail into an opaque metadata blob and still loses the
  per-comparison query the review UI uses.
- **A retention window for votes.** Rejected: the trail is small (one row per
  reviewer per comparison) and the same argument already keeps `AuditEvent`
  forever.

## Consequences

- Deleting a test no longer removes its `ApprovalVote` rows; they are orphans by
  ID and readable by `comparisonId`/`projectName`.
- The tables grow with approvals, like the rest of the audit surface. Operators
  who must purge can do so deliberately; the application will not.
- ADR-042's artifact-cleanup mechanism remains for comments; only its vote half
  is superseded.

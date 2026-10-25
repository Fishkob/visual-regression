# ADR 040: Review Comments and Decision Reasons

## Status

Accepted — 2026-11-15

## Context

Approval records who and when, but not **why**. Reviewers also need to discuss a
comparison without leaving the app. The roadmap asks for a comment thread per
comparison/test (markdown-lite, resolve, mentions later), a structured approval
reason, and notifications via the existing webhooks.

## Decision

**Comments.**

- `ReviewComment` is a flat, append-only thread per test with an optional
  `comparisonId` filter. It stores `projectName`, `branchName`, `testId`,
  `comparisonId`, plain `body`, author id/name, and `resolvedAt`/`resolvedBy`.
- **No HTML rendering.** The body is plain text capped at 4000 characters and
  rendered with preserved line breaks; a markdown-lite renderer is a follow-up.
  This avoids stored-XSS surface in a review tool that shows untrusted input.
- `GET/POST /projects/:p/tests/:t/comments` and
  `PATCH .../comments/:id/resolve`; session-only (a comment needs a human
  identity), with comparison/test ownership validated before write.
- Creating a comment writes `review.comment` audit and a `review.comment`
  webhook outbox row; resolving writes `review.comment-resolve`. Mentions,
  edit/delete, image pins and pagination beyond the latest 200 are v2.

**Decision reasons.**

- `Approval.reason` (`INTENDED_CHANGE` | `FLAKE` | `INFRA`, nullable) and
  `Approval.note` (2000 chars, nullable) are written by the single-comparison
  approval endpoints alongside the existing audit row. Bulk/run "approve all"
  deliberately accepts no reason: it is a batch shortcut, not a reviewed
  decision.
- The reason is exposed on the approval history DTO and in the approval audit
  metadata, so reports/exports can group intended changes vs flakes vs infra.
- The approval remains one row per finalized comparison; 4-eyes votes stay in
  `ApprovalVote` and the final approver's reason is the decision of record.

## Alternatives considered

- **Storing comments as JSON on the comparison**: no thread, no resolve, no
  per-test comments without a comparison.
- **Markdown-to-HTML with a sanitizer**: extra dependency and XSS surface for a
  v1; plain text is sufficient and safe.
- **Reason as free text only**: not groupable; the enum makes flake/infra
  reporting possible while `note` keeps context.
- **Reason required**: slows the common intended-change approval; optional with
  a visible "No reason" default.

## Consequences

- Comments survive comparison deletion (denormalized, no FK); test/project
  deletion leaves orphan comment rows until a retention/cleanup task exists.
- The approval history now carries reason/note; clients that assert the old
  exact DTO shape must tolerate the new nullable fields.
- No comment notifications beyond the webhook event (in-app unread state is a
  follow-up).

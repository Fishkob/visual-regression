# ADR 028: Baseline Revisions and Restore

## Status

Accepted — 2026-10-25

## Context

Approval folds the reviewed candidate into the baseline row in place and the
previous baseline file is reclaimed after the commit
(`ApprovalService` → `UnifiedScreenshotRepository.updateBaselineScreenshot`).
Only the durable `Approval` audit row survives, and it keeps hashes and ids but
not the image URL. A wrong approval is therefore irreversible: the reviewer
cannot look at what the baseline was before, and cannot put it back.

The review UI already binds each variant to its baseline screenshot row, and the
reclaim chain (`filterReclaimableUrls`) protects any URL a live row references.
What was missing was a durable row that keeps an overwritten baseline's file
alive.

## Decision

Every overwrite records a `BaselineRevision`.

- **What is recorded.** Test, variant, the denormalized variant dimensions, the
  canonical `imageUrl`, `imageHash`, `pageCount`, `pixelDiffThreshold`, the
  actor, a `reason` (`approval` | `restore` | `import`) and the timestamp. The
  variant/test foreign keys cascade, so deleting a test or variant also removes
  its history.
- **When it is written.** Inside the same `StateChangeWorkflow` transaction as
  the baseline overwrite: approval records the outgoing baseline before
  `updateBaselineScreenshot`, and restore does the same for the baseline it
  replaces. A history row can never commit without the overwrite (or vice
  versa).
- **Restore semantics.** Restoring a revision rewrites the baseline row in place
  (same `baselineId`) with the revision's image, hash, page count and threshold,
  retires pending comparisons and cancels queued jobs through
  `ComparisonRetirementService.supersedeForVariant`, recomputes the test status
  and writes a `baseline_updated` event. The restored threshold travels with the
  restored image. A revision that already equals the current baseline is a
  `409 CONFLICT`; an inherited variant is read-only (`409`) because restoring it
  would fork ownership — the branch must own the baseline first.
- **Retention.** `BASELINE_HISTORY_LIMIT` (default 10, per variant) bounds the
  history. Pruning is synchronous on write, keeps newest-first, deletes the rows
  and releases their URLs through the reclaim chain. No cron is needed; pruning
  happens exactly when the history grows.
- **Storage safety.** `BaselineRevision` URLs are part of the referencedness
  seam (`findReferencedUrls`) and the reclaim chain
  (`filterReclaimableUrls`), so the orphan/unreferenced sweeps cannot delete a
  file the history view shows, and pruning one branch's revision cannot delete a
  file another branch's revision shares.
- **Read/command surface.** `GET /projects/:projectName/tests/:testName/baseline-history`
  (branch- and variant-scoped, newest first, bounded by the limit) and
  `POST .../baseline-restore` with `{ revisionId }`. Read DTOs follow the
  canonical-plus-presigned URL convention.

Auto-accepted within-threshold diffs (R1) do **not** create a revision: they
keep the baseline, so there is nothing to preserve.

## Rationale

- The revision row is the smallest thing that makes an approval undoable: it
  reuses the existing baseline row and the existing storage URL instead of
  copying the image or adding a second content store.
- Writing it in the approval transaction keeps "what was replaced" atomic with
  "what replaced it", the same invariant the `Approval` audit row already
  follows.
- Synchronous pruning avoids a maintenance task and a window where the history
  grows past the configured limit. The limit is small (10 by default), so the
  prune query is cheap.
- Restore is deliberately a new baseline write with the normal supersede
  semantics, not a time-travel of comparison history.

## Alternatives Considered

- **Keep the old file without a row.** The unreferenced-object sweep would
  eventually delete it (nothing references it). Rejected.
- **Version the screenshot row (multiple BASELINE rows per variant).** Breaks
  the `(testId, variantId, type)` uniqueness and every read that assumes one
  baseline per variant, including branch inheritance. Rejected.
- **Event-sourced history / audit-only.** An audit row without the file cannot
  restore the image. Rejected.
- **A background retention task.** More moving parts for the same result; the
  write-time prune is deterministic. Rejected.

## Consequences

- Storage grows by the retained history only; the limit bounds it.
- `Approval` stays the "who approved what" record; `BaselineRevision` is the
  "what did the baseline look like" record. They complement rather than
  duplicate each other.
- The baseline history of an inherited variant lives on the branch that owns the
  baseline; the read only resolves owned tests.
- A future import feature can write a revision with `reason = 'import'` without
  changing the model.

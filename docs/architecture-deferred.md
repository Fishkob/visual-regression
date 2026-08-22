# Deferred architecture work

## ✅ Completed

### 1. Collapse the upload pipeline

**Done:** `ImageUploadPipeline` and `PdfUploadPipeline` were consolidated into an
`UploadIntake` orchestrator (`intake/application/upload-intake.service.ts`) driving an
`IntakeKind` strategy interface (`intake/application/intake-kind.ts`) with
`ImageIntakeKind` and `PdfIntakeKind` implementations.

**What changed:**

- Shared upload orchestration lives in `UploadIntake.upload()`: hash → dispatch by kind →
  `resolveTestAndBaseline()` → outcome switch (`identical` / `baseline_created` /
  `comparison_needed`)
- Storage upload + compensating delete (on DB failure) centralized in the orchestrator via
  the `StateChangeWorkflow` `onFailure` callback
- Stale-URL cleanup centralized in `handleComparisonNeeded` (`cleanupStaleUrls` in a
  `finally`), aggregating pending-stale URLs from the kind and stale URLs returned by
  `writeComparisonAndEnqueue`
- Each kind implements kind-specific hooks: `resolveTestAndBaseline`, `writeBaseline`,
  `writeComparisonAndEnqueue`, `getFileName`, `getMimeType`, `getComparisonQueuedResult`
- Kind dispatch via the `INTAKE_KINDS` multi-provider registry + `resolveKind()`

### 2. Decompose bloated repositories (partial)

**Done:** Mapper functions extracted, `#ensureVariant` relocated.

**What changed:**

- Extracted `toScreenshotEntity()` to `core/infrastructure/mappers/screenshot.mapper.ts`
- Extracted `toComparisonEntity()`, `toComparisonEntityWithRelations()`,
  `extractVariantFromBaseline()` to `core/infrastructure/mappers/comparison.mapper.ts`
- Moved `#ensureVariant()` from `UnifiedScreenshotRepository` to `UnifiedTestRepository`
  as public `ensureVariant()`
- `UnifiedScreenshotRepository` now injects `UnifiedTestRepository` for variant operations

**Still deferred:** Splitting each repo into base + image subclass + PDF subclass.
This was scoped out due to the 31+ consumer files it would touch. Revisit when
image and PDF flows diverge further (e.g., different DB tables per kind).

### 3. Decompose TestsController

**Done:** `TestsController` (335 lines) split into three focused controllers:

- `TestsQueriesController` — GET endpoints for test listing, details, baselines, comparisons
- `PdfController` — GET endpoints for PDF details, render, download
- `TestCommandsController` — PATCH threshold, DELETE test

Each controller injects only the services it needs.

## Deferred — Round 3 (2026-08-04)

### ✅ PDF retirement happens before the file store (PDF upload) — DONE in Round 4

`PdfIntakeKind.resolveStale` used to retire the stale pending comparison in the
resolve transaction, _before_ `StorageStateChangeWorkflow` stores the new file, so a
failed store deleted the pending comparison with no replacement. **Fixed (2026-08-04,
Task C2):** `resolveStale` was removed entirely; both intake kinds now retire inside
`writeComparisonAndEnqueue` (the write transaction), and stale files are cleaned via a
single `staleFromResult` slot. A failed store or enqueue now leaves the old pending
comparison intact.

### Identical re-upload skips status recompute

`UploadIntake.handleIdentical` emits the CURRENT event but does not retire a stale
pending comparison or recompute the test status. An existing unit test asserts the
current behavior (`upload-intake.image.spec.ts:145`). The correct fix (retire stale
pending + recompute) collides with `deleteForTest` also removing APPROVED image
history. Domain decision required.

### Job "unchanged" verdict is not a duplicate of the threshold rule

`ComparisonJobProcessor` uses `mismatchCount(result) === 0` to choose unchanged vs
diff. This is NOT a duplicate of `isThresholdExceeded`: per CONTEXT.md any non-zero
mismatch produces PENDING_APPROVAL, whereas `isThresholdExceeded` is the review-time
display rule against the baseline `pixelDiffThreshold`. Do not consolidate.

## Deferred — Round 4 (2026-08-04)

### Orphan/failed-job cleanup storage semantics

`FailedJobCleanupTask` deletes failed-job candidate storage objects without verifying
the owning `UnifiedScreenshot` row still exists, and `JobRetentionService` has a
find-then-delete TOCTOU with the DLQ retry path. Correct semantics depend on a product
decision about what "failed" means for storage ownership. Revisit with that decision.

### `UnifiedVariant.baselineId` kept alongside screenshot `variantId`

Screenshots are now variant-scoped (unique `[testId, variantId, type]`), making
`UnifiedVariant.baselineId` derivable. It is kept as the documented reference to the
baseline screenshot. A follow-up could derive it and drop the column.

### PDF sidecar tolerance 0.2 vs pixelmatch 0.1

The processor normalizes via `engineTolerance()`; reconciling the sidecar's default
threshold is a tuning decision.

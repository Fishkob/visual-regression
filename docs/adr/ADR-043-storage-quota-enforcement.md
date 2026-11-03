# ADR 043: Storage Quota Enforcement at the Stored-Write Seam

## Status

Accepted — 2026-10-26

Superseded by: [ADR-060](ADR-060-storage-usage-is-a-cached-total.md) for how the
check obtains the used byte total (a cached `SUM` instead of an aggregate per
upload). The rest of this decision — the stored-write seam, the `charge`
convention, `QUOTA_EXCEEDED`/`413` — stands.

## Context

The per-project storage quota (R20) was checked at exactly one of the four
object writers: the upload intake. Diff artifacts, PDF render pages and
page-count blobs wrote bytes the quota never saw — and in this product the diff
artifact is the largest byte class. The check also had a value bug:
`!project?.storageQuotaBytes` reads `0` as "no quota" and a negative value as
"reject everything", while the controller parsed the raw string with
`BigInt(...)`, so a non-numeric value surfaced as a 500.

The two evidence writers already share one convention: both store their bytes
through `StateChangeWorkflow.executeWithStoredFile`, which owns the
compensating delete when the transaction fails. The render cache does not, and
its keys (`pdf-render/<base PDF object name>/…`) carry no project at all.

## Decision

**The quota is a precondition of the stored write.**

- `StateChangeWorkflow.executeWithStoredFile` requires
  `charge: { projectName, bytes }` and asserts the quota before `store()`. A
  stored write that does not name its charge does not compile — the same
  compile-enforced convention as `PersistedChange`.
- `IStorageProvider.putObject` stays policy-free. It stores bytes; it does not
  know about projects, and it must not start knowing.
- Only **evidence** bytes count: BASELINE/CURRENT screenshot rows and diff
  artifacts, i.e. the two byte columns the aggregates already sum. The
  `pdf-render/` cache is exempt **by construction** — it never crosses the
  stored-write convention, so no `purpose` flag has to be trusted or policed.
- A blocked evidence write is `QUOTA_EXCEEDED` → `413`. The error filter already
  puts the domain `code` in the body, so a CI client can tell "quota full" from
  a broken upload without parsing prose.
- The quota value is validated at the DTO: `null` = unlimited, `0`, negative or
  non-numeric = `422`. The controller stops parsing.
- `QUOTA_EXCEEDED` joins the non-retryable codes: a rejected diff fails its job
  immediately and shows up as a failed job in the Run, instead of burning three
  backoff attempts on a deterministic verdict.
- The check stays **admission control, not a ledger**: it reads the byte
  aggregates outside the transaction, so concurrent evidence writes can
  overshoot by roughly one object. The byte rows remain the truth, and the next
  write re-checks.

## Alternatives considered

- **Charge inside `putObject` with a mandatory `purpose`.** The most
  obviously-correct seam, but it requires the render cache to know its project,
  which means re-keying the `pdf-render/` namespace and migrating the existing
  objects — real cost to charge bytes that a maintenance task sweeps anyway. It
  also drags the quota owner into `internal/storage`, which the codebase
  otherwise reaches only through a token.
- **A separate `StorageQuota.assertCapacity` called by both evidence writers.**
  Correct today, but the discipline lives with the caller: the next evidence
  writer has to remember it. The workflow is already the documented convention
  for stored writes, so the rule rides a convention that exists instead of
  creating a second one.
- **A strict reservation ledger.** Would make the enforcement exact and remove
  the overshoot, at the price of a third source of truth beside the object and
  its row. The overshoot is about one object and self-corrects on the next
  write.
- **Degrade instead of reject: persist the comparison without its diff
  artifact.** Rejected. A review without the diff image cannot be judged, and
  4-eyes would then approve a change nobody saw — silently weaker than a failed
  job the Run reports.

## Consequences

- The stored-write convention becomes load-bearing: a future writer that stores
  evidence bytes outside `executeWithStoredFile` is free of charge. This is
  stated in CONTEXT.md so it is a documented rule, not a trap.
- The diff worker needs the project in its job payload. Denormalizing
  `projectName` at enqueue (like `runId`/`runKey`) is one field instead of a
  test→branch→project query per diff.
- Clients that send `"0"` expecting "unlimited" now get `422`. Deliberate: a
  value that silently disables the quota is worse than a rejected one. The
  dashboard needs no change — its dialog already refuses a `0` in the field and
  sends `null` for "no quota". A stored `0` (or a negative value) from before
  this rule keeps reading as unlimited, so no existing project is bricked.
- Deploy note: `JobData.projectName` is required, so an in-flight
  `ComparisonJob` enqueued before the deploy fails its decode (`INVALID_STATE`,
  non-retryable) and lands in the DLQ. Drain the comparison queue first, or
  backfill the field into `ComparisonJob.payload` — the same shape of note as
  the job-queue column migration.
- Bucket usage can exceed the sum of project quotas by the render-cache
  namespace. That is accepted and bounded by `PdfRenderCacheCleanupTask`, not by
  the quota.
- Diff bytes for rows written before size tracking rely on the already-shipped
  backfill (`findMissingDiffSizes`, sentinel `0`), so no separate migration.

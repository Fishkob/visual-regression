# ADR 060: The storage quota check reads a cached byte total

## Status

Accepted — 2026-11-23. Partially supersedes
[ADR-043](ADR-043-storage-quota-enforcement.md) — for how the check obtains the
used byte total, not for the seam, the charge convention or the `413`.

Enforced by `storage-usage.service.spec.ts` (a fresh total is trusted without an
aggregate, a stale or missing one is re-derived and recorded, an admitted charge
is added and a rejected one is not) and by the column's writers: only
`ProjectRepository.recordStorageUsage` (absolute, from a re-derive) and
`addStorageUsage` (a charge) touch it, both called from `StorageUsageService`.

## Context

ADR-043 made the quota a precondition of the stored write and accepted an
overshoot of "about one object" because the check reads the byte aggregates
outside the transaction. What it did not price is the aggregate itself: every
upload summed **every** evidence row of the project.

Measured on a real migrated schema (1000 resp. 10000 tests × 25 variants × 2
screenshots), one `SUM(sizeBytes)` + `COUNT(*)` over the project:

| screenshot rows                                         | time    |
| ------------------------------------------------------- | ------- |
| 50 000                                                  | 13.7 ms |
| 500 000                                                 | 68.4 ms |
| 500 000 + covering index `(testId) INCLUDE (sizeBytes)` | 58.1 ms |

The cost is linear in the project and **no index fixes it**: the aggregate has
to visit every row, and the covering index only moved the plan from a seq scan to
an index-only-ish scan (−15 %). Every upload pays it — plus the same shape for
diff artifacts.

## Decision

**The project caches its evidence byte total; the check re-derives it at most
once per window.**

- `Project.storageUsedBytes` (`BigInt?`) and `Project.storageUsageComputedAt`
  (`DateTime?`) hold the last derived total. `null` means "never computed", which
  is not the same as `0` bytes.
- `StorageUsageService.assertWithinQuota` uses the cached total when it is
  younger than `USAGE_CACHE_TTL_MS` (5 s); otherwise it derives the total from
  the rows with the existing aggregates and records it.
- An admitted charge is then added to the cached total, so the window stays live
  instead of every upload of one window being decided against the same number
  (a CI burst would otherwise land as a block). Rejected charges are not added.
- The cache is written **outside** the upload transaction. The `Project` row is
  shared by every concurrent upload of that project, so writing it inside the
  upload transaction would serialize them — the very contention the cache is
  meant to avoid.
- The byte rows stay the truth. The cached number is a plain `SUM` over them,
  re-derived from scratch on every refresh; there is no delta bookkeeping, so
  nothing can drift: a wrong value is corrected by the next refresh by
  construction.
- `GET …/storage` keeps deriving exactly. It also reports the file and diff
  counts, which a byte total cannot answer, and it is a page view, not a
  per-upload cost.
- No backfill migration: the first check of a project derives the total, so a
  fresh installation and an upgraded one behave identically.

## What this costs

The overshoot bound stays ADR-043's: concurrent uploads of one project each read
the same total before any of them charges, so they can overshoot by the
concurrency — one object per in-flight upload, not one per window. What the
window does change is the other direction: a deletion, a failed store whose
charge was already counted, and any lost charge are only corrected by the next
re-derive, so the check over-reports and rejects slightly early rather than late
for at most 5 s. Both follow from ADR-043's own framing — the check is admission
control, not a ledger.

## Alternatives considered

- **A counter maintained in every write path** (`+n` on insert, `−n` on delete).
  The most exact option, and rejected: it spreads one invariant across the size
  writers, the sweepers, both approval kinds, and **database cascades** (deleting
  a test or branch deletes screenshot and comparison rows without the repository
  seeing them), so the counter would silently drift the first time a path is
  added. It also needs the `Project` row in every upload transaction, which
  serializes concurrent uploads of one project.
- **A database trigger maintaining the counter.** Cannot be forgotten by
  application code, but takes the `Project` row lock for the length of each
  upload transaction — the same serialization, now invisible to the code.
- **An in-process cache per API instance.** No schema change, but each replica
  diverges and the overshoot multiplies by the replica count; the shared column
  converges instead.
- **A snapshot table refreshed by a maintenance task.** The same staleness with
  an extra table and a scheduler dependency, and the burst right after a refresh
  is exactly the case a scheduled refresh handles worst.
- **Keep the aggregate and accept the cost.** Defensible up to a few 10k rows;
  at 500k it is 68 ms of database time per upload for a number that changes by
  one object per upload.

## Consequences

- The quota check is O(1): the project row is already loaded, so the common case
  adds no query at all (before: two aggregates).
- `Project` carries two derived columns. They are cache, not state: a reader that
  needs the number must go through `StorageUsageService`, and a writer must not
  invent one.
- The refresh window is a constant in the service, not configuration. It is a
  property of this trade-off, not of an installation.
- The quota grant stays in the DTO (`null` unlimited), untouched here.

# ADR 036: Test Lifecycle (Rename, Tags, Mute, Flake)

## Status

Accepted — 2026-10-25

## Context

Tests currently exist only because an upload created one. There is no way to
rename a typo, document a test, group tests by tag, silence a known-broken test,
or tell whether a test flips between pass and fail. Image comparisons are
deleted on approval (a PDF approval keeps its APPROVED row as history), so flake
signals must come from the R8 outcome history, not the live comparison table.

Mute needs a precise meaning: the comparison still has to be produced and
recorded (the history and the next approval depend on it), but it must not page a
reviewer or fail a CI run.

## Decision

- **Metadata on `UnifiedTest`:** `description`, `tags String[]`, `mutedUntil`,
  `muteReason`. Tags are lowercased, trimmed, deduped and bounded (20 × 40
  chars). Metadata writes skip `StateChangeWorkflow` because they never change
  test status, but they run in an explicit `PrismaUnitOfWork` transaction so the
  audit row commits with the patch.
- **Rename:** unique per branch (`@@unique([branchId, name])`), `409` on
  collision, audit `test.update` keeps `renamedFrom`. Project rename is a
  separate audited `PATCH /projects/:name` (`project.rename`); historical audit
  and approval rows keep the old name, the project row is the identity.
- **Mute is test-level in v1:** every variant is muted. `mutedUntil` in the
  future hides the test from the inbox and pending list; a past timestamp/null
  un-mutes. `muteReason` is required for a future mute. Variant-specific mute is
  deferred (would move the fields to `UnifiedVariant` and complicate the inbox
  query).
- **Mute does not stop comparison:** the upload, job, comparison and outcome
  history still run. `run.status.mutedPending` counts muted pending
  comparisons; the gate treats `pendingComparisons - mutedPending` as the
  blocking count and the action reports the muted subset.
- **Flake:** 30-day oscillation count over `ComparisonOutcomeEvent` for the
  test (transitions between changed and clean), surfaced in the test metadata.
  No ML; one transition is normal, repeated flips are the signal.
- **Inbox:** muted tests are excluded; a `tag` filter combines with the existing
  filters. A per-row tag badge is deferred until the inbox payload carries tags.

## Alternatives considered

- **Delete muted comparisons / skip the job:** would lose history and make
  unmute unable to show the pending review; rejected.
- **Global mute list in config:** not per test, not auditable, no expiry.
- **Flake from live comparisons:** image comparisons are deleted on approval and
  the table never holds a clean diff, so only the durable outcome history can
  show an oscillation.
- **Variant-level mute now:** more precise but the inbox/variant queries and the
  UI need a second dimension; test-level covers the common quarantine case.
- **Project rename via recreate:** would break URLs/ids and split history;
  update the row instead.

## Consequences

- Muted pending comparisons still appear in the run detail (with a muted count)
  but do not block the gate; reviewers can unmute to restore the queue entry.
- Renames change the test URL; the UI replaces the route and keeps branch/query.
- Project rename has an API but no dashboard control yet.
- Flake is a count, not a probability; it is cheap to compute and explain.

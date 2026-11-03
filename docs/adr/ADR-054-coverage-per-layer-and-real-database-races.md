# ADR 054: Coverage Is Gated Per Layer, and Database Races Are Proven Against Postgres

## Status

Accepted — 2026-11-01. Partially supersedes
[ADR-020](./020-testing-strategy.md): the single global coverage threshold and
the rule that a test may never touch a service without HTTP. Decision 5 is
partially superseded by
[ADR-059](./ADR-059-query-policy-vs-mechanism.md): a repository unit test keeps
its query-policy assertions, and only the mechanism assertion moves to the
database-race suite.

## Context

ADR-020 set one coverage gate for the whole backend (95% statements / 85%
branches) and rejected a middle test layer. Both decisions aged differently than
intended.

The single threshold was not measured against the code it was supposed to hold.
When the gate was re-run in November 2026 it failed at 86.9% statements / 77.4%
branches while all 1881 unit tests passed, so it had been red without anybody
noticing:
`pnpm run unitTest` (the local gate in `scripts/verify.sh`) never enabled
coverage. The gap was concentrated exactly where the number was least meaningful:

| layer                     | statements | branches |
| ------------------------- | ---------- | -------- |
| `core/domain`             | 98.0%      | 97.5%    |
| `common`                  | 96.5%      | 93.0%    |
| `internal`                | 91.1%      | 78.0%    |
| `public/…/application`    | 83.6%      | 69.1%    |
| `public/…/infrastructure` | 77.4%      | 73.5%    |
| `public/…/presentation`   | 54.4%      | 54.2%    |

A single 95% therefore demanded query-shape assertions in the repositories (the
layer that maps rows to entities) and could never be met by the controllers (the
layer whose contract is a status code), so it was met by testing the mocks.

The "no middle layer" rule has the same problem from the other side. Some
guarantees are made neither by business logic nor by the HTTP surface, but by
Postgres: `FOR UPDATE SKIP LOCKED` handing a job to exactly one claimant, a
unique index backing a check-then-insert, `Serializable` turning a lost update
into a retry. None of those can be proven through a mocked client — the unit
suite can only assert the SQL string it sent. The queue's own tests did exactly
that (`expect(sql).toContain('FOR UPDATE SKIP LOCKED')`), which stays green when
the property is gone.

ADR-020 named "advisory locks, race conditions" as the threshold for
reconsidering. That threshold is met; the suite is 3 minutes, not 10.

## Decision

**1. The coverage gate is per layer, and it runs where people run tests.**
`backend/vitest.config.ts` holds one threshold per architectural layer (domain,
common, application, infrastructure, internal) instead of one global number, and
`scripts/verify.sh` runs `unitTest:cov` so the numbers are checked on every push.
Each number is held at what that layer's own tests can prove; a number is raised
after closing a gap and never lowered to turn a red run green.

**2. Controllers are owned by the HTTP suite.**
`**/presentation/**` is excluded from the unit gate: a unit test there can only
assert a delegation. The HTTP suite is what covers them, and its coverage is now
measured (see 3) instead of assumed.

**3. Both suites report coverage, and the merge is the honest picture.**
The e2e run writes its own map (`coverage/e2e`), the unit run writes
`coverage/unit`, and `pnpm run coverage:all` merges them per file and fails when
a file with statements is executed by neither suite. The gate stays on the unit
run (it is the fast one); the merge is the report that shows which layer is
responsible for what.

**4. A database guarantee is tested against a real database, at the component
boundary.**
Tests that assert a locking, constraint, isolation or retry guarantee may drive a
service or queue from the running Nest application against the real Postgres, in
`test/e2e/`. This is the one sanctioned exception to ADR-020's "no middle layer":
the property under test belongs to the database and cannot be observed through
either the HTTP surface (a race needs two arrivals at once) or a stub.

**5. A repository unit spec asserts mapping and guards, not the query skeleton.**
Returned entities, computed values and refusals (`assertInTransaction`) belong in
the unit suite. `expect(client.x.findMany).toHaveBeenCalledWith({ where: … })` is
a restatement of the source and moves to the HTTP suite, where the effect of the
query is visible as rows.

**6. A concurrency test must fail when the guarantee is removed.**
A test that only passes because the requests happened to serialize proves
nothing. Each race test here was checked by removing the mechanism
(`FOR UPDATE SKIP LOCKED`, `Serializable`) and watching it fail.

## Rationale

- **A gate that is not in the local path is not a gate.** The failure was not the
  threshold value, it was that nobody ran it. Moving the check into
  `scripts/verify.sh` is what makes the numbers current.
- **A metric should judge the layer it measures.** 95% on a repository can only
  be reached by asserting on mocks; 95% on a controller can only be reached by
  duplicating the HTTP suite. Per-layer numbers say who owns what.
- **The database is the authority for its own guarantees.** `SKIP LOCKED`,
  `@@unique` and `Serializable` are exactly the behaviours a mocked client
  cannot have, and they are the ones that break silently.
- **The merge closes the "who covers this?" question.** Before it, a file at 0%
  in the unit report was either an E2E-covered controller or dead code, and
  nothing distinguished the two.

## Alternatives Considered

- **Keep one global 95% and backfill the gap.** Rejected: the missing points sat
  in controllers (HTTP-shaped) and repositories (query-shaped), so backfilling
  means writing assertions on mocks — coverage that rises without confidence.
- **Lower the global number to 87%.** Rejected: it hides that `core/domain` is at
  98% and the repositories at 77%; one number cannot express both.
- **Gate the merged report instead of the unit run.** Rejected as the primary
  gate: it needs Docker and ~3 minutes, so it would leave the push path
  unguarded again. The merge is a report; the unit run is the gate.
- **A separate integration suite** (`test/integration/`) as ADR-020 first had it.
  Rejected again: it duplicates the app bootstrap. The five race cases live in
  `test/e2e/` next to the suite that already owns the database.
- **`coverage.thresholds.perFile`.** Rejected for now: it turns every untested
  helper into a build failure, which pushes authors toward trivial tests. The
  layer buckets are the intended granularity.

## Consequences

- A new backend file is covered by the unit run or the e2e run; the merge fails
  when neither executes it.
- A new repository method gets a unit test for its mapping and, if it carries a
  database guarantee, an e2e test that proves the guarantee.
- A new controller gets an e2e test; its unit coverage is explicitly not
  required.
- The unit gate is ~21 seconds (`scripts/verify.sh` includes it); counting the
  merged report means `pnpm run coverage:all` and a running Docker stack.
- `backend/coverage/unit`, `coverage/e2e` and `coverage/merged` are separate
  directories; `coverage:open` opens the unit report.

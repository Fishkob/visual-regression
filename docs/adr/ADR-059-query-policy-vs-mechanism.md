# ADR 059: A Repository Unit Test Asserts Query Policy, the Database Proves Mechanism

## Status

Accepted — 2026-11-03. Partially supersedes
[ADR-054](./ADR-054-coverage-per-layer-and-real-database-races.md) decision 5.

Enforced by: `backend/eslint.config.ts` — the local rule
`no-locking-clause-assertions` rejects a locking token inside a `toContain` /
`toMatch` literal in `test/unit/`, so decision 2's mechanism half cannot come
back. The policy-versus-mechanism line beyond those tokens is review: no rule can
tell a policy predicate from a mechanism one. The exception in decision 4 carries
an `eslint-disable-next-line` with its reason, and the gap is recorded in
[`docs/testing.md`](../testing.md) rather than implied here.

## Context

[ADR-054](./ADR-054-coverage-per-layer-and-real-database-races.md) decision 5 drew
a line through the repository test suite and said the second half moves to the
HTTP suite:

> A repository unit spec asserts mapping and guards, not the query skeleton.
> `expect(client.x.findMany).toHaveBeenCalledWith({ where: … })` is a restatement
> of the source and moves to the HTTP suite, where the effect of the query is
> visible as rows.

An audit on 2026-11-03 found the line unmoved: the 17 repository unit specs carry
131 `toHaveBeenCalledWith` assertions, 100 of them about a `where` clause, plus 9
assertions on raw SQL text. Either the rule is right and the suite is debt nobody
paid, or the rule drew the line in the wrong place. The measurement says the
second.

What those `where` assertions pin is not the query's skeleton but its _visibility
policy_: an archived branch is out of scope unless it is named, a project selects
its own rows, only `PENDING_APPROVAL` comparisons count as pending, a page holds
a bounded number of rows. That is a domain rule, written once, in the layer that
translates it into SQL. The unit suite is the cheapest place to change it and the
only place where one rule can be exercised without a fixture per branch state;
moving those assertions to HTTP would trade a direct assertion for an indirect
one.

The assertions that are worthless are of a different kind: the ones on
_mechanism_. `expect(sql).toContain('FOR UPDATE SKIP LOCKED')` proves a string is
present, not that two claimants cannot both win — it stays green for every bug in
the transaction around it, which is where the guarantee actually lives. ADR-054
already said this about the queue, and supplied the place to prove it instead: a
database-race test in `test/e2e/` that must fail when the mechanism is removed.

So the line is not "repository versus HTTP". It is **policy versus mechanism**.

## Decision

1. **A repository unit test may assert the query as policy** — the filter fields
   that decide visibility, the ordering, the bound, the selected shape. Assert
   the policy fields (`expect.objectContaining(...)`), not the whole argument
   object: a full `toEqual` breaks on an unrelated column and teaches nothing
   about the rule it is supposed to protect.
2. **It may not assert the mechanism** — locking clauses, isolation levels, lock
   ordering, or any raw SQL text whose meaning is "a concurrent writer cannot
   break this". Those are the database-race suite's business, and nowhere else
   can they be observed (ADR-054 decisions 4 and 6).
3. **In a raw-SQL repository, the statement is the policy surface.** A repository
   that writes SQL by hand has no `where` object to assert, so it may assert the
   policy tokens inside the statement — the bound (`LIMIT 20`), the predicate
   (`"claimedAt" = NULL`) — while the locking tokens stay forbidden.
4. **An exception is named, not implied.**
   `webhook-delivery.repository.spec.ts` still asserts `FOR UPDATE SKIP LOCKED`
   because no concurrency case exists for the webhook lease. The assertion is
   recorded as a gap in [`docs/testing.md`](../testing.md) and goes when the case
   arrives.
5. **This ADR owns the rule; `docs/testing.md` owns the inventory.** Which suite
   covers what, and how many race cases exist, is stated there and nowhere else.

## Rationale

- **The policy has exactly one home.** Visibility rules live in the repository's
  `where`; asserting them there keeps the test next to the code that decides
  them, and a changed rule fails one test instead of an integration fixture.
- **A mechanism cannot be asserted by reading it back.** The guarantee is a
  property of the database under concurrency, so it is a race test or it is
  nothing. A string assertion survives exactly the bugs it is meant to catch.
- **A line the code contradicts every day stops being a line.** ADR-054 decision
  5 has been quoted in review while 100 assertions ignored it, which teaches that
  ADRs are advisory. Recording the correction — and the one case that still does
  not follow it — keeps the rule usable as a review criterion.

## Alternatives Considered

- **Enforce decision 5 as written** and migrate the 100 `where` assertions to the
  HTTP suite. Rejected: it duplicates query-filter knowledge into fixtures
  (archived branches, project scoping, page bounds) and replaces a one-line
  assertion with a multi-request flow, while the HTTP suite already covers the
  effect for the flows a user can reach.
- **Treat the assertions as debt and keep the rule.** Rejected: a rule that the
  code contradicts is quoted in review and argues against every repository
  change.
- **Ban `toHaveBeenCalledWith` in repository specs entirely.** Rejected: the
  brittle part is the full-object `toEqual`, not the call assertion.
  `expect.objectContaining` on the policy fields is precise and survives a new
  column.
- **Delete the webhook mechanism assertion now.** Rejected: it is the only check
  of that lease today. Removing it without the concurrency case would lower the
  net and hide that fact, which is the opposite of what this ADR is for.

## Consequences

- A new repository method gets a unit test for its mapping plus one case per
  visibility rule it introduces; a database guarantee gets a race case in
  `test/e2e/` instead.
- A reviewer can reject an assertion on a locking clause by pointing here, and
  must accept one on a policy field.
- The remaining gap is visible rather than implied: `docs/testing.md` names the
  webhook lease as the one mechanism assertion still in the unit suite, and
  closing it is a concurrency case in `webhook-delivery.e2e-spec.ts`.
- ADR-054 keeps decisions 1-4 and 6 unchanged; only decision 5 is superseded.

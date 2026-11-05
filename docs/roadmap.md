# Roadmap

Status: living document · Last reviewed: 2026-11-04 · Owner: maintainers

Phases 1–6 are shipped (R1–R26), and the phase-by-phase record — scope,
acceptance criteria, verification notes, design sketches, the alternatives that
were weighed — stays in git (`git log -p docs/roadmap.md`) and in the
[CHANGELOG](../CHANGELOG.md). The `R1`…`R26` numbers the ADRs and commit messages
refer to are those rounds.

This page now answers one question: what is next.

## Where it stands

The upload → compare → review → approve pipeline is complete for both kinds
(image and PDF), branch-scoped, gated by a run, tolerant by config-as-code and
audited end to end. What is left is not a new surface: it is depth — finishing
what shipped at 80 %, and the long-tail items a real deployment asks for.

## Candidates

Not commitments: pick by demand. Size is for one developer including tests, docs
and review (`S` ≈ 1–3 days, `M` ≈ 1–2 weeks, `L` ≈ 2–4 weeks).

| ID  | Item                                        | Why now                                                                                                         | Size |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| N2  | Cursor pagination for review comments       | The read is capped at the newest 200 with no way past them (ADR-040 names it).                                  | S    |
| N3  | Project-rename UI                           | The API, the audit row and the slug rules exist; only the dialog is missing.                                    | S    |
| N4  | Typed-confirmation bulk delete              | Bulk test deletion has an API but no multi-row UI; the delete is irreversible.                                  | S–M  |
| N5  | Per-project orphan grace                    | Grace is global because a storage object carries no project attribution; needs an object→project mapping first. | M    |
| N6  | Retention window for share-link access rows | `share.access` rows are audit and grow without a bound.                                                         | S    |
| N7  | `job.failed` webhook                        | ADR-029 leaves it out until the queue's failure path has an observer seam.                                      | S–M  |
| N8  | Email notifications                         | Webhooks reach Slack/Teams; email is a separate infrastructure decision (SMTP, no vendor).                      | M    |
| N9  | OIDC / SAML login                           | Trigger, not a plan: a deployment that must use an IdP. Zero-dependency stance until then (ADR-025).            | L    |
| N10 | Variant-level mute                          | Mute is per test today, so it covers every variant. Needs a rule for a muted variant in the run gate.           | M    |

### Shipped

- **N1 — quality-gallery gaps** (2026-11-04). The share page and the run detail
  got gallery cases (story, fixture, `readyTestId`), so every route now has a
  pixel baseline and an axe scan in both themes and the opt-out list in
  `gallery-coverage.test.ts` is empty. The run detail's fixture is a finished run
  with a failed job, so the state that matters most is what the shot shows.

## Open questions

1. **Is a fourth role needed?** `ADMIN` / `MEMBER` / `VIEWER` cover today's
   routes; a deployment that wants "may approve, may not upload" would need an
   `APPROVER` in the permission matrix (ADR-031).
2. **Should a run finish without an explicit `finish`?** It finishes on
   `POST .../runs/:key/finish`, and a maintenance task closes runs idle for 24 h. A
   shorter quiet period would spare callers that forget the call, but it guesses
   when a pipeline is done — and a wrong guess reads as a passing gate.
3. **Does the audit trail need a retention policy?** `AuditEvent`,
   `ComparisonOutcomeEvent` and `ApprovalVote` are append-only by design
   (ADR-050) and grow with usage; see
   [deployment.md](deployment.md#retention-runs-in-the-worker) for the operator's
   side of that trade.

## Considered and rejected

### Ignore regions / masks — dropped by product decision (2026-10-25)

No ignore regions, selector masks or per-region tolerances. Consequences, accepted
with the decision: dynamic content keeps producing pendings, the threshold only
absorbs global noise, and tests must be made deterministic on the capture side.
**Revisit trigger:** if false positives from dynamic regions dominate review time
(more than a third of pendings are "known noise"), reconsider — the comparison
engine and the variant/baseline config are the seams to extend.

### Reject endpoint — out of scope (ADR-023)

Pending changes are retired by a newer upload, threshold auto-accept or deletion.
A reviewer records _why_ a change was fine instead of rejecting it.

### Branch-scoped follow-ups — out of scope (ADR-027)

Baseline promotion/merge, branch rename, branch-scoped permissions and API keys,
auto-archiving, a branch-level threshold. Commit metadata landed at run level
(ADR-030), which is narrower than the branch-level metadata ADR-027 deferred.

### Also deferred

Email/SMTP (webhooks cover the reach), SSO/OIDC/SAML (see N9), a built-in crawler
or browser capture (the platform stays capture-agnostic), and multi-tenancy/orgs
(single-tenant self-hosting is the product).

## Maintaining this document

- A shipped candidate moves to a `Shipped` line with its date and leaves the
  table; the acceptance criteria live in the commit and the ADR, not here.
- A dropped candidate goes to **Considered and rejected** with the reason and a
  revisit trigger — never deleted.
- A rule change belongs in [CONTEXT.md](../CONTEXT.md), a hard-to-reverse decision
  in [`docs/adr/`](adr/). This page only tracks status.

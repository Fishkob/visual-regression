# Roadmap

Status: living document · Last reviewed: 2026-11-12 · Owner: maintainers

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

Not commitments: the order is a priority, not a promise. Every row names what
asks for it — a user symptom, an operator symptom or the ADR it closes; a row that
can only cite an ADR is tolerated, not justified. Size is for one developer
including tests, docs and review (`S` ≈ 1–3 days, `M` ≈ 1–2 weeks, `L` ≈
2–4 weeks). `Priority` is `now` (next up), `on demand` (starts when a deployment
asks for it) or `trigger` (starts when the named condition holds).

| ID  | Item               | Why now / who asks                                                          | Size | Priority  |
| --- | ------------------ | --------------------------------------------------------------------------- | ---- | --------- |
| N10 | Variant-level mute | Mute is per test, so one flaky variant silences every variant of that test. | M    | on demand |

SSO is no longer a candidate: the trusted-header path shipped as N12 below, so a
deployment that runs an IdP proxy is covered and one that insists on OIDC or SAML
inside the app itself stays out of scope.

N10 lost its second half: the run gate no longer counts a muted pending
comparison (`run-state.policy.ts` subtracts `mutedPending`), so muted work already
does not fail a run. What remains is granularity — a test-level mute covers every
variant, and a variant that is known-unstable cannot be muted on its own.

### Shipped

- **N12 — trusted-header auth behind a proxy** (2026-11-12). `AUTH_TRUSTED_HEADER`
  (empty = off) names the header an authenticating proxy — oauth2-proxy, an IdP
  sidecar, an ingress with auth — fills with the signed-in username. The guard
  resolves it to an existing **active** user and attaches that user's own role, so
  `@Roles`, the VIEWER write ban and the same-origin rule apply unchanged; nothing
  is auto-provisioned, and neither the session cookie nor the API key moved. The
  header is checked last so a proxy that stamps it on every request cannot drop a
  CI key's scopes or its project allowlist, and it ignores `mustChangePassword`
  because the local password is not part of that credential. The path is one env
  var because the security property is a deployment fact: the API must stay
  unreachable around the proxy, and the proxy must overwrite the header rather
  than append to it ([ADR-077](adr/ADR-077-trusted-header-auth.md)). Covered by
  guard unit cases for the identity, the precedence, the origin check and the
  viewer ban, an env-validation case, and an e2e file that switches the env var on
  and proves the proxy's user reaches the product API while a header naming
  nobody active does not.
- **N2 — cursor pagination for review comments** (2026-11-12). The read still
  returns the newest 200, but it now takes `limit` (1–200) and `before` — the id
  of the oldest comment the caller holds — so a thread is no longer frozen at its
  200th-newest post. The cursor is the `(createdAt, id)` pair the query already
  sorts by (and `createdAt` is `TIMESTAMP(3)`), so a page neither skips nor
  repeats a row; a cursor from another thread is a 404, not a silent read from an
  unrelated point. The response stays a `CommentDto[]`: a full page is the only
  "there may be older" signal that shape carries, so the panel's "load older"
  control appears on a full page, disappears at the thread end, and the rail's
  tab count reads `200+` until then — no envelope, no client-SDK major. The list
  query became a DTO (whitelist, so an unknown parameter is a 422), and that DTO
  closed a hole the resolve route had: `branch` was read from `@Query` but never
  reached the OpenAPI contract, so no client could send the branch a comment on a
  feature branch needs — it can now, and "resolves a comment on the branch the
  thread belongs to" pins both answers. The panel's thread is a TanStack infinite
  query that stitches older pages in front; the repository's policy test, the
  service's cursor cases, a 205-comment two-page e2e partition and the panel's
  load-older test pin it.

- **N13 — rotate and revoke in the API-key list** (2026-11-12). The list could
  already render a revoked or a retiring key, but its only action was the hard
  delete — the one action that takes the row and its audit trail with it. A live
  key now offers Rotate (active, not already replaced) and Revoke (any active
  key, including a retiring one); revoked and expired rows keep only Delete.
  Rotate asks for the endpoint's grace window (0–1440 minutes, default 60) and
  hands the successor's one-time raw key to the same reveal dialog creation uses,
  with its own title; Revoke takes an optional reason (≤200 characters) and keeps
  the row. The backend is unchanged — both were already session-only admin
  routes. Component tests pin the per-status visibility, the grace validation
  and both payloads, the CT suite pins the rotate/reveal and revoke flows, and a
  keyboard case pins the rotation dialog's focus. The line in
  [ci-integration.md](ci-integration.md#key-lifecycle) claiming the dashboard
  offers "the one action it should: delete" is gone with the code it described.
- **N4 — typed-confirmation bulk delete** (2026-11-12). The project page's
  accordion group is the test, so selection is per test, not per variant row: a
  header checkbox marks the whole test, "select all" takes every test the branch
  owns, and a group that only exists as an inherited shadow on this branch gets
  no checkbox because the endpoint would answer `NOT_FOUND` for it. The delete
  goes through the existing `POST .../bulk/test-deletions` with the branch, lands
  its per-test failures in the existing failure dialog, and refreshes the
  directory, the project counts and the inbox. `ConfirmDialog` gained a typed
  confirmation: the selection is deleted only after the project name is typed,
  and the text resets on every reopening so a reopened dialog cannot be confirmed
  by a leftover match; callers that pass no phrase keep the plain confirm. A
  component test pins the payload, select-all and the failure rows, the CT flow
  pins disabled → typed → request, the CT keyboard case pins focus in / Escape /
  focus back, and the endpoint's own behaviour stays covered by
  `bulk-actions.e2e-spec.ts`.
- **N3 — project rename UI** (2026-11-11). The settings page gained the project's
  name as its first section and the dialog behind it; an admin (and a member — the
  PATCH endpoint is gated by the API-key scope, not by `@Roles`) renames without
  curl, and the page follows to the new address instead of leaving the old one on
  screen. The cached read families are refreshed on the way, because the name is
  part of nearly every project-scoped key. The dialog also closed a hole the API
  had: `UpdateProjectDto.name` accepted a name that `ProjectNameValidationPipe`
  then rejected on every route, so a rename could make a project unreachable —
  the body now carries the same rule as `CreateProjectDto` (charset, reserved
  names, length) and trims before it applies, and the write is covered by
  "rejects a rename to a name no path route could address".
- **N7 — `job.failed` webhook** (2026-11-11). A comparison job that exhausts its
  retry budget, hits a non-retryable error, arrives with a corrupt payload or
  stalls until its lease runs out now publishes one `job.failed` delivery. The
  seam is the point: the queue publishes through `JOB_FAILURE_OBSERVERS` (a token
  in `common/domain`) and the webhook module subscribes, so the queue imports no
  webhook code and `run.finished`/`quota.exceeded` have the same place to land.
  The delivery is written after the `FAILED` row commits — a lost notification,
  never a lost failure ([ADR-076](adr/ADR-076-job-failure-notifications.md)).
- **N5 — per-project orphan grace** (2026-10-25). `Project.orphanGraceHours`
  governs the row-level orphan sweeps (screenshots and baselines) and is set
  through `PATCH /storage` and shown by the retention preview. The
  unreferenced-object sweep stays global on purpose: an object with no row has no
  project to read a grace from.
- **Branch retention** (2026-11-06). `BRANCH_RETENTION_DAYS` (default 0 = off)
  and `Project.branchRetentionDays` delete a non-default branch once it has seen
  no upload for the window; archived branches, branches other branches target and
  branches with an unreviewed comparison are never collected, and the storage
  preview reports the set first. It closes the "auto-archiving is out of scope"
  line of ADR-027 with a deletion instead of an archive (ADR-067).
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
3. **Does the audit trail need a retention policy?** `AuditEvent` and
   `ComparisonOutcomeEvent` are append-only by design and grow with usage.
   `share.access` rows are the fastest-growing case
   (formerly candidate N6): they come from every share-link open, so they are worth
   deciding here rather than pruning alone, which would break append-only for one
   action type. See
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

### Email notifications — dropped (2026-11-05)

Webhooks reach Slack, Teams and any endpoint a deployment runs, and they are the
channel a review team already watches. SMTP would add a surface the product owns
and must keep correct — deliverability, bounces, addresses, unsubscribe — for a
person-reach that an integration covers today. **Revisit trigger:** a deployment
needs to reach a **person** (a named reviewer, a digest, an escalation) rather than
a channel, and cannot do it with the webhook they already receive.

### Reject endpoint — out of scope (ADR-023)

Pending changes are retired by a newer upload, threshold auto-accept or deletion.
A reviewer records _why_ a change was fine instead of rejecting it.

### Branch-scoped follow-ups — out of scope (ADR-027)

Baseline promotion/merge, branch rename, branch-scoped permissions and API keys,
a branch-level threshold. Commit metadata landed at run level (ADR-030), which is
narrower than the branch-level metadata ADR-027 deferred. Auto-archiving was
reopened on operator demand and shipped as the branch retention window
([ADR-067](adr/ADR-067-branch-retention.md)), which deletes idle branches instead
of archiving them — the archive stays the manual "keep this" action, so it can
shield a branch from the sweep.

### Also deferred

SSO/OIDC/SAML beyond the trusted-header path (N12, ADR-077), a built-in crawler or
browser capture (the platform stays capture-agnostic), and multi-tenancy/orgs
(single-tenant self-hosting is the product).

## Maintaining this document

- A shipped candidate moves to a `Shipped` line with its date and leaves the
  table; the acceptance criteria live in the commit and the ADR, not here.
- A dropped candidate goes to **Considered and rejected** with the reason and a
  revisit trigger — never deleted.
- Re-read the code when this page is reviewed. A candidate whose feature already
  exists is shipped, not open, and a candidate whose reason has expired is
  rewritten or dropped (N5 was built while it still sat in the table).
- An entry needs a demand or a trigger sentence. "An ADR names it" is not a
  demand; it is how the list fills up with things nobody misses.
- A rule change belongs in [CONTEXT.md](../CONTEXT.md), a hard-to-reverse decision
  in [`docs/adr/`](adr/). This page only tracks status.

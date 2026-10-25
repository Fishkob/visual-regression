# Roadmap

Status: living document · Last reviewed: 2026-10-25 · Owner: maintainers

This roadmap turns the gap analysis of the current feature set into an ordered,
independently shippable backlog. It is not a release plan: every item is useful
on its own, and phases only express sequencing and dependencies.

Related: [CONTEXT.md](../CONTEXT.md) (domain language), [docs/adr/](adr/),
[docs/ci-integration.md](ci-integration.md), [README.md](../README.md).

## How to read this

- **Size** is for one developer including tests, docs and review: `S` ≈ 1–3
  days, `M` ≈ 1–2 weeks, `L` ≈ 2–4 weeks, `XL` ≈ 4–6+ weeks.
- **Phase** is sequencing, not a release. Ship an item when it is ready; do not
  hold it for the next phase.
- Every item follows the same **definition of done**:

  - [ ] Backend unit tests + E2E coverage for new/changed API behavior
  - [ ] Frontend unit tests; axe WCAG A/AA scan for new views
        (`./scripts/quality.sh a11y`)
  - [ ] SDK regenerated and built when the API changes (`sdk:generate`,
        `sdk:build`)
  - [ ] `CONTEXT.md` updated when the item introduces a domain term
  - [ ] ADR added/updated for cross-cutting decisions
  - [ ] Docs updated (`ci-integration.md`, `local-development.md` for new env
        vars, `README.md` for user-facing workflows)
  - [ ] `lint` → `typecheck:all` → `format` → `unitTest` green
  - [ ] Forward-only Prisma migration (`prisma migrate`), no data rewrite in
        application code

## What this roadmap optimizes

1. **Signal quality** — fewer false pendings, better diff inspection.
2. **Trust** — approvals are safe, undoable and auditable.
3. **Reach** — reviewers hear about work without opening the dashboard; CI can
   gate on a run instead of a single upload.
4. **Team** — more than one operator can use the platform safely.
5. **Scale** — storage, retention, formats and localization do not become
   surprises later.

## At a glance

| ID  | Item                                     | Phase | Size | Depends on                    | Status      |
| --- | ---------------------------------------- | ----- | ---- | ----------------------------- | ----------- |
| R1  | Threshold auto-accept at diff time       | 1     | S    | —                             | Shipped     |
| R2  | Diff UX v1                               | 1     | M    | —                             | Shipped     |
| R3  | Baseline history & restore               | 2     | L    | —                             | In progress |
| R4  | Webhooks & notifications                 | 2     | L    | R6 (optional, `run.finished`) | Shipped     |
| R5  | Global audit log                         | 2     | M    | —                             | Shipped     |
| R6  | Run grouping                             | 3     | XL   | ADR-030                       | Shipped     |
| R7  | Batch upload & capture integrations      | 3     | L    | R6                            | Shipped     |
| R8  | Reporting & exports                      | 3     | M–L  | R6 · ADR-033                  | Shipped     |
| R9  | Users, roles & permissions               | 4     | L    | ADR-031                       | Planned     |
| R10 | Auth hardening (password, sessions, 2FA) | 4     | M    | R9                            | Planned     |
| R11 | API key scopes & ownership               | 4     | S–M  | R9                            | Planned     |
| R12 | Bulk actions                             | 5     | M    | —                             | Planned     |
| R13 | Test lifecycle (rename, tags, mute)      | 5     | M–L  | R9 (actor), R8 (outcomes)     | Planned     |
| R14 | Search & discovery                       | 5     | M    | —                             | Planned     |
| R15 | Retention, quotas & storage visibility   | 5     | M    | R3, R6                        | Planned     |
| R16 | Image formats & size policy              | 5     | M    | ADR-032                       | Planned     |
| R17 | Internationalization                     | 5     | M    | —                             | Planned     |
| R18 | Share links                              | 5     | M    | R9                            | Planned     |
| R19 | Review assignment, SLA & 4-eyes          | 5     | L    | R9, R4                        | Planned     |
| R20 | Review comments & decision notes         | 5     | M    | R9                            | Planned     |

Status is `Planned`, `In progress` or `Shipped`; a shipped item keeps its
section and checked acceptance criteria so the history stays readable.

Rough envelope: phases 1–5 are about 7–9 months for one developer. The order is
deliberate: cheap noise reduction first, then trust, then the CI product, then
team capability, then long-tail comfort.

---

## Phase 1 — Review noise & diff quality

The two cheapest changes that make the review queue trustworthy. Both are
backward compatible and need no migration.

### R1 — Threshold auto-accept at diff time

**Why.** `pixelDiffThreshold` is currently a retroactive cleanup rule: a new
comparison is always `PENDING_APPROVAL` when `mismatch > 0`, no matter what the
threshold says. The computed `thresholdExceeded` flag is plumbed to the frontend
but never rendered, so a 12 px diff blocks CI despite a tolerance of 50
([comparison-job-processor.ts](../backend/src/modules/public/visualTest/intake/workers/comparison-job-processor.ts),
[threshold-policy.ts](../backend/src/modules/public/visualTest/core/domain/policies/threshold-policy.ts)).

**Scope (v1).**

- In the worker, after the engine comparison: if the kind is `image` and
  `mismatch <= baseline.pixelDiffThreshold`, treat the attempt like the existing
  unchanged path — reclaim the candidate, store no comparison and no diff
  artifact, keep the baseline, test stays `UNCHANGED`, job ends `COMPLETED` with
  `comparison: null`.
- Keep the baseline (no silent promotion). This matches the existing
  threshold-update behavior (it deletes pendings, it does not move the baseline)
  and avoids cumulative drift.
- Add `within_threshold` to `ComparisonCompletionOutcome` and the metrics
  mapping.
- Render `thresholdExceeded` in the review UI (badge/tooltip: "within tolerance:
  30 ≤ 50 px") and explain auto-accept in the threshold editor.
- Document the behavior in `ci-integration.md` and the composite action.
- `threshold = 0` (the default) keeps today's behavior byte-for-byte.

**Not in scope.** Silent baseline promotion, PDF thresholds, per-project default
threshold (needs project settings, see R15), ignore regions (dropped, see
[Considered and rejected](#considered-and-rejected)).

**Design sketch.**

- Branch in `processWithEngine` before `handleDiff` so the diff artifact is never
  uploaded; reuse `CandidateReclamationService.reclaimCandidateInChange` for the
  candidate row/file and its in-transaction race guard.
- Read the threshold from the baseline row the supersession check already loads
  (`findBaselineByVariant`) — no schema change, no new endpoint.
- One policy function owns the boundary (`<=`), shared with the threshold-update
  path so the two cannot drift.
- Race: the worker reads the threshold at the pre-compare gate; a raise while the
  job is queued (or before it starts) therefore wins. A raise during the compare
  itself is picked up by the next upload; lowering a threshold never resurrects
  a retired comparison.

**Acceptance.**

- [x] Threshold 50, diff 30 → no comparison row, no candidate row, no diff
      object, test `UNCHANGED`, job `COMPLETED` with `comparison: null`
- [x] Threshold 50, diff 51 → `PENDING_APPROVAL` as today
- [x] Threshold 0 → identical behavior to today
- [x] Threshold raised while the job is queued → auto-accepted
- [x] Composite action exits 0 for within-threshold; outputs unchanged
- [x] Flag visible in the UI; docs updated

**Decision.** Keep the baseline (implemented): the candidate is reclaimed, no
comparison is stored, and approval stays the only baseline writer. Silent
promotion remains out of scope.

**Size / dependencies.** S · independent.

### R2 — Diff UX v1

**Why.** Reviewers get side-by-side and diff-only plus zoom. There is no overlay,
no wipe/slider, no fit-to-screen, no pan, no percentage — spotting a 10 px shift
in a 4K screenshot is guesswork
([ViewModeToggle.vue](../frontend/src/components/ui/view-mode-toggle/ViewModeToggle.vue),
[InteractiveImageViewer.vue](../frontend/src/components/detail-panels/InteractiveImageViewer.vue)).

**Scope (v1).**

- View modes: side-by-side, diff-only, **overlay** (candidate over baseline with
  opacity), **wipe/slider** (draggable split).
- Fit-to-screen and 1:1, pan by drag and arrow keys, zoom at cursor.
- Synchronized pan/zoom in side-by-side.
- Mismatch as **percentage** next to the pixel count (derived from the image's
  natural size — no schema change).
- Fullscreen/lightbox; keyboard shortcuts: `1–4` modes, `+`/`-` zoom, `0` reset,
  arrows pan, `Esc` exit.
- Remember mode/zoom per user in `localStorage` (no backend).

**Not in scope.** Annotations/comments (R20), diff-region list, heatmaps,
pixel ruler, color-blind simulation.

**Design sketch.**

- Extend the presentational viewer; the page keeps owning navigation.
- Wipe via `clip-path` on the candidate layer; overlay via opacity slider; both
  reuse the already-loaded images (no new requests).
- Percentage = `mismatchPixelCount / (width * height)` using the baseline's
  natural size already captured on image load.
- No new dependency. Keyboard and focus handling must pass the axe suite.

**Acceptance.**

- [x] All four modes render the same variant without refetching images
- [x] Zoom is anchored at the cursor; fit recalculates on resize
- [x] Wipe works with mouse and keyboard (left/right arrows when focused)
- [x] Percentage matches the pixel count for a known fixture
- [x] Works in light and dark theme; a11y scan clean (detail views, light+dark)

**Decision.** Overlay and wipe are hidden for PDF comparisons (layering rendered
pages does not make sense), so the shared toggle takes `showLayered`. Touch drag
is a follow-up; mouse and keyboard are the tested paths.

**Size / dependencies.** M · independent.

---

## Phase 2 — Trust & reach

Approvals become undoable and observable. These items add tables, but no changes
to the comparison pipeline.

### R3 — Baseline history & restore

**Why.** An approval overwrites the baseline row in place and reclaims the
previous file (unless a branch clone shares it); only an `Approval` row
survives, without the image. A wrong approval cannot be undone, and reviewers
cannot compare against "what it looked like before"
([approval.service.ts](../backend/src/modules/public/visualTest/review/application/approval.service.ts),
[unified-screenshot.repository.ts](../backend/src/modules/public/visualTest/core/infrastructure/repositories/unified-screenshot.repository.ts)).

**Scope (v1).**

- New `BaselineRevision` table: test/variant (branch implied by the test),
  `imageUrl`, `imageHash`, `pageCount`, `pixelDiffThreshold`, `createdAt`,
  `createdBy`, `reason` (`approval` | `restore` | `import`). The durable
  `Approval` row stays the "who approved what" record.
- Write a revision for the **outgoing** baseline before every overwrite. Stop
  reclaiming a previous-baseline URL while a revision references it.
- Retention: keep the last N revisions per variant (`BASELINE_HISTORY_LIMIT`,
  default 10). Pruning is synchronous on write, row-first, then file reclaim —
  no separate cron task.
- Read API: `GET /projects/:projectName/tests/:testName/baseline-history`
  (branch- and variant-scoped, newest first, bounded by the limit).
- Restore API: `POST .../baseline-restore` with `revisionId`. Restore is a state
  change: it retires pending comparisons for the variant, cancels pending jobs
  and recomputes the test status in the same transaction, and records the actor
  on the new revision (the global audit log arrives in R5).
- UI: history drawer with thumbnails, actor/time/reason, "current" badge, restore
  with confirmation. PDFs show page count and open the existing PDF viewer.

**Not in scope.** Diffing two historical revisions, importing an arbitrary file as
baseline (candidate: separate item), annotations.

**Design sketch.**

- Record the revision inside the approval/restore `StateChangeWorkflow` change
  before `updateBaselineScreenshot`; do not reclaim `previousBaselineUrl` when a
  revision holds it.
- Extend the storage-referencedness seam
  ([storage-referencedness.interface.ts](../backend/src/common/domain/storage-referencedness.interface.ts))
  so the orphan and unreferenced sweeps see revision URLs, and the reclaim
  chain drops revision-referenced URLs.
- Restore goes through `StateChangeWorkflow` and `ComparisonRetirementService`,
  exactly like an upload supersede. PDF restore reuses or lazily re-renders the
  cache keyed by the restored PDF URL; the source is retained as a revision, so
  no eager cache invalidation is needed.
- Branch scope: an inherited variant is read-only (`409`) — restoring it would
  fork ownership, so the branch must own the baseline first (decided; no
  pin-on-restore).

**Acceptance.**

- [ ] Approving twice leaves two revisions, both files still readable
- [x] Restoring revision 1 makes its hash the baseline and retires pendings
- [ ] Old files survive the daily orphan/unreferenced sweeps
- [ ] Cleanup keeps the newest N and reclaims the rest
- [x] Inherited variant restore returns `409`; the revision records actor and reason
- [x] Storage growth visible in the API/UI

**Verification.** Unit (history service, reclaim chain, approval ordering) and
frontend CT/axe are green. The three unchecked lines are DB-backed behaviors;
they need an e2e spec (approve twice, sweep, retention) before R3 can be called
fully shipped. The visual screenshot baselines for both detail views need
`./scripts/quality.sh visual --update` because the panel adds a section.

**Size / dependencies.** L · independent; grows R15.

### R4 — Webhooks & notifications

**Why.** "Something needs review" only exists inside the dashboard, and a failed
job only surfaces in the DLQ. Teams live in Slack/Teams and CI lives in pull
requests
([ci-integration.md](ci-integration.md) explicitly defers webhooks).

**Scope (v1).**

- `WebhookEndpoint` per project: URL, secret, subscribed events, active flag.
  Config UI to create/test/disable; delivery log with response status and replay.
  Until R9 (roles) exists, gate webhook administration behind `x-admin-key` so a
  CI key cannot register an endpoint.
- Events: `review.requested` (a comparison became `PENDING_APPROVAL`),
  `comparison.approved`, `job.failed` (after max attempts), `run.finished` (once
  R6 lands).
- Signed delivery: `X-VRT-Signature: sha256=<hmac(timestamp + body)>` plus
  `X-VRT-Timestamp`; retries with exponential backoff; 5 attempts; then the
  delivery is marked failed and visible in the UI.
- Slack-compatible JSON preset (incoming webhook, no OAuth app). Generic JSON is
  the default.
- Payload carries project/test/branch/variant, comparison id, mismatch, and a
  dashboard link (not an expiring presigned URL).

**Not in scope.** Email/SMTP delivery, GitHub App/check-runs, chat bots, inbound
webhooks, per-user notification preferences.

**Design sketch.**

- Outbox pattern: write a `WebhookDelivery` row in the same transaction as the
  domain change where possible (approval, comparison creation); the worker writes
  `job.failed`. A dispatcher loop in the worker process claims pending deliveries
  with `SKIP LOCKED`, sends them and updates the rows. This adds durable delivery,
  which ADR-004 deliberately avoided — record it in an ADR (ADR-029) as a
  complement to ADR-004, not a reintroduction of the in-process bus.
- Do not reuse `ObservabilityEvent` as the payload: it carries primitives for
  metrics, not project/test context. Emit webhook records beside it.
- SSRF: endpoints are admin-only; block link-local/metadata addresses by default
  (RFC1918 stays allowed — the product is self-hosted in private networks), with
  an optional explicit allowlist.
- Testing: a "send test event" button writes a delivery with a synthetic payload.

**Acceptance.**

- [x] A changed comparison produces exactly one `review.requested` delivery
- [x] Signature verifies with the endpoint secret; wrong secret fails
- [x] Retries stop after 5 attempts and are visible with the last error
- [x] Replay resends the same payload idempotently (`X-VRT-Delivery-Id`)
- [x] Disabling an endpoint stops new deliveries but keeps the log
- [x] Slack preset produces a usable message

**Verification.** Backend unit tests cover URL guard, signing, dispatch/retry,
sender formats and settings; the frontend view test covers create + one-time
secret, active toggle, delete, deliveries and replay. `job.failed` is deferred
per ADR-029 (needs a queue observer seam). The webhooks view is not yet in the
Playwright quality/axe gallery — follow-up.

**Size / dependencies.** L · independent of R6, but `run.finished` ships with R6.

### R5 — Global audit log

**Why.** Approvals are auditable per test, but deletions, branch operations,
restores and settings changes are not; there is no cross-project view or export
([approval.service.ts](../backend/src/modules/public/visualTest/review/application/approval.service.ts)).

**Scope (v1).**

- `AuditEvent` table: actor, action (`approval`, `restore`, `deletion`,
  `branch.*`, `api-key.*`, `webhook.*`, `user.*`), target (project/test/branch or
  id), metadata JSON, timestamp.
- `GET /audit` with filters (project, actor, action, date range), server
  pagination; CSV export.
- UI page `/audit` (admin/member once R9 lands; admin key or all users before).
- Keep `Approval` as the detailed approval record and write an `AuditEvent` as
  the cross-project view. The small duplication is deliberate: the audit read
  must paginate and filter over one table, not a union of action-specific
  tables. API keys keep their own `createdBy`/`revoked*` fields.

**Design sketch.**

- Write in the same transaction as the mutation (deletions must not commit
  without their audit row) via `StateChangeWorkflow`; approval already has the
  pattern.
- Destroyed entities: audit rows keep denormalized names/ids, like `Approval`.

**Acceptance.**

- [x] Deleting a test writes an audit row naming actor, project and test
- [x] Filters and pagination agree with `meta.total`
- [x] CSV export contains the filtered set
- [x] Audit writes roll back with the mutation

**Verification.** Unit tests cover the audit service, approval/restore/webhook
writes and test/variant deletion records; the frontend view test covers rows,
filters, pagination, empty state and CSV export. No DB-backed e2e for the audit
read yet. The `/audit` page is not in the Playwright quality/axe gallery —
follow-up (same as R4).

**Size / dependencies.** M · independent; actor roles enrich it after R9.

---

## Phase 3 — CI as a first-class citizen

The largest product leap. R6 is a design spike first; R7 and R8 build on it.

### R6 — Run grouping

**Why.** There is no build/run concept: every upload compares immediately against
the branch baseline, parallel CI jobs supersede each other (latest-wins), and
there is no way to say "this pull request has 12 changes" or gate on a run
([CONTEXT.md](../CONTEXT.md), "Identical-upload vs queued-job race").

**Scope (v1).**

- `Run` per project + branch: client-supplied `runKey`, `commitSha`,
  `commitMessage`, `ciUrl`, metadata JSON, `createdAt`/`lastActivityAt`,
  `finishedAt`/`finishedBy`.
- Optional `runKey` (+ commit fields) on upload; link jobs, comparisons and
  approval audit rows to the run. No `runKey` → today's behavior.
- Read API: list runs, run detail (tests/variants/status counts), run status for
  CI, run filter in the inbox.
- Run-level approve-all (per-test loop with partial results).
- Composite action: `run-key`, `commit`, wait for the run, `fail-on-pending` at
  run level, GitHub step summary. Repeated single uploads still work.
- Finish semantics: explicit `POST .../runs/:key/finish`; a maintenance task
  auto-finishes runs idle for 24 h so abandoned runs do not stay open forever.

**Not in scope.** Per-run candidate isolation (latest-wins stays; that is a much
deeper rework), merge queues, GitHub App/check-runs, cross-project runs.

**Design sketch.**

- Additive table + nullable `runId` columns on `ComparisonJob`, `UnifiedComparison`
  and `Approval` (denormalized so history survives deletions).
- Derive run status from the run's upload rows plus pending comparisons/jobs and
  approvals; do not maintain aggregate counters.
- Inbox: add a run filter and badge; keep the existing project/group grouping.
- The run does **not** fix upload races — document that explicitly. It provides
  grouping and a gate, not isolation.
- ADR-027 deferred "PR/commit metadata" for the branch slice. R6 introduces
  commit metadata at run level: write ADR-030 and reference the narrower scope.

**Acceptance.**

- [x] Two uploads with the same `runKey` appear under one run
- [x] Run status returns counts and a terminal state after `finish`
- [x] Action fails once for the run when any comparison is pending, not per file
- [x] Uploads without `runKey` behave exactly as today
- [x] Deleting a branch/project leaves no orphan run rows
- [x] Run page paginated; inbox run filter combines with existing filters

**Verification.** `run-grouping.e2e-spec.ts` covers grouping, status/finish,
no-run-key and project-cascade against Postgres. The action run mode was
exercised against a local stub API (11 scenarios), and the frontend view/
composable tests cover the list, detail, polling, finish/approve-all and the
inbox run filter. `RunUpload` makes baseline-only uploads count as run tests
(jobs/comparisons alone would miss them). The new runs views are not yet in the
Playwright quality/axe gallery — follow-up.

**Size / dependencies.** XL · ADR-030 first; touches upload, job, review reads,
SDK, action.

### R7 — Batch upload & capture integrations

**Why.** The action uploads one file per step; there is no Playwright/Cypress/
Storybook integration, so onboarding means writing upload loops by hand.

**Scope (v1).**

- Action input `manifest` (JSON) uploading N captures into one run; bounded
  concurrency that respects `429` + `Retry-After`. A `directory` input is
  deferred (manifest only in v1).
- SDK: `uploadMany` with bounded concurrency and retry/backoff.
- One first-class integration: Playwright reporter (test end → upload) with
  naming conventions for project/test/variant. It ships as the
  `client-sdk/playwright` subpath (no Playwright dependency inside the SDK);
  Cypress and Storybook adapters follow the same contract.

**Not in scope.** A built-in crawler or browser capture; users bring their own
capture tooling.

**Design sketch.**

- Hand-written SDK helpers under `client-sdk/src/`, exposed as subpath exports;
  `sdk:generate` only rewrites the generated files, so the helpers survive
  regeneration. A separate workspace package was not needed for a zero-dependency
  reporter.
- Batch upload reuses the existing endpoint; the manifest adds metadata only.
- Rate limits: batch uploads need a documented budget; the action backs off on
  `429` instead of failing.

**Acceptance.**

- [x] A 100-capture manifest uploads with bounded concurrency and one run
- [x] Rate limiting produces backoff, not data loss
- [x] Reporter uploads on failure too (`--retries` aware)
- [x] Docs show a complete Playwright example

**Verification.** `uploadMany` and the reporter are covered by SDK unit tests
(concurrency bound, 429 retry, non-retryable 400, progress, failure-only and
retry-skip); the action manifest mode was exercised against a local stub API
(100 captures at concurrency 4, 429-then-success, permanent 503, invalid/missing
manifest/file/field, multi-project rejection, budget exhaustion). The reporter
never fails the test run; upload failures are collected for the caller.

**Size / dependencies.** L · depends on R6.

### R8 — Reporting & exports

**Why.** CI gets pass/fail and the dashboard has no trends; stakeholders get no
report.

**Scope (v1).**

- JUnit XML per run (tests as cases; pending review **and failed jobs** as
  failures with a dashboard link), self-contained HTML report, CSV.
- Run summary page: counts, review state, links to comparisons. Duration is
  derivable from the run timestamps but is not surfaced in v1.
- A bounded `ComparisonOutcome` history (test/variant/run, outcome, mismatch,
  timestamp) written on every completion. Comparisons are deleted on approval, so
  this is the only durable source for trends and flake rates.
- Trend data from that history: comparisons/day, pending review age, approval
  latency, flake rate.
- Report endpoints are read-only and scoped by project/branch.

**Not in scope.** BI/warehouse export, PDF reports, scheduled email reports.

**Design sketch.**

- Build reports from the R6 run read model plus the outcome history; one additive
  table, no changes to the comparison pipeline.
- HTML report links to tests rather than embedding thumbnails: presigned URLs
  expire, and the report must stay useful when downloaded later.
- JUnit is the CI contract; the action's optional `report-path` writes it to
  disk after the gate is read.

**Acceptance.**

- [x] JUnit parses in a standard CI viewer
- [x] Pending and failed cases carry dashboard links
- [x] Summary counts match the run status endpoint
- [x] CSV export is stable across pages

**Verification.** Report builders are unit-tested (XML escaping, pending/failed
failures, CSV rows, HTML links); an e2e covers the JUnit/CSV/trends endpoints;
the action writes `report-path` after the gate; the trends page and report
downloads are covered by frontend tests. JUnit XML is generated with escaped
attributes and one `<testcase>` per test/variant; the CSV endpoint is unpaginated.
The HTML report intentionally links to tests instead of embedding expiring
presigned screenshots.

**Size / dependencies.** M–L · depends on R6.

---

## Phase 4 — Team

Multiple operators, least privilege, and safe key management.

### R9 — Users, roles & permissions

**Why.** Only the bootstrap admin exists; every authenticated principal is
all-powerful. A team cannot share the platform safely
([auth.controller.ts](../backend/src/modules/internal/auth/auth.controller.ts),
[authenticated-request.ts](../backend/src/common/http/authenticated-request.ts)).

**Scope (v1).**

- `User.role`: `ADMIN` (users, settings, API keys, project/branch deletion),
  `MEMBER` (upload, approve, restore, test/variant deletion), `VIEWER`
  (read-only).
- Admin user management: create with a temporary password, force change on first
  login, deactivate, reset password, revoke sessions.
- Auth context carries `userId` + `role`; a `@Roles()` decorator guards
  endpoints; the UI hides actions the role cannot use.
- Bootstrap admin becomes `ADMIN`; remove bootstrap env after first login.
- Audit every user and permission change (R5).

**Not in scope.** Per-project memberships (groups are explicitly not
permissions), SSO/OIDC, SCIM, teams/orgs (single-tenant self-hosting).

**Design sketch.**

- Add `role` with a migration default; extend `AuthenticatedRequest.auth`;
  the global guard loads role with the session/key.
- One permission matrix document + compile-time decorator; frontend mirrors it in
  a single auth store, not per-component checks.
- API keys inherit a role/scope in R11; until then treat them as `MEMBER`.

**Acceptance.**

- [ ] Viewer gets `403` on approve/delete and sees no action buttons
- [ ] Member cannot create users or keys
- [ ] Deactivating a user invalidates live sessions
- [ ] Role changes are audited and take effect without re-login
- [ ] Bootstrap admin is `ADMIN` and can be demoted only by another admin

**Size / dependencies.** L · ADR-031 (permission matrix) first.

### R10 — Auth hardening

**Why.** No password change, no reset, no session overview, no second factor;
OIDC is deferred, but the basics should not be.

**Scope (v1).**

- Self-service password change, admin reset, "log out all sessions", session list
  (created, last seen, IP, user agent) with revoke.
- TOTP 2FA per user with recovery codes, implemented with `node:crypto`
  (zero-dependency, matching ADR-025).
- Cookie/CSRF review: keep `SameSite=Lax` + `helmet`; require `AUTH_COOKIE_SECURE`
  in production docs; rate-limit password endpoints.
- OIDC/SAML stays deferred; record the trigger (a deployment that requires an
  IdP) in the ADR.

**Not in scope.** Email-based reset (no SMTP yet), WebAuthn, SSO.

**Design sketch.**

- New auth endpoints; session rows already exist, add `lastSeenAt`/`userAgent`/
  `ip` on use.
- Recovery codes are hashed like API keys; store only hashes.
- Admin reset generates a one-time password shown once, like an API key.

**Acceptance.**

- [ ] Password change requires the current password and revokes other sessions
- [ ] 2FA enroll/verify/recovery works and is enforced on login
- [ ] Session revoke takes effect on the next request
- [ ] Login/2FA endpoints respect the rate limiter

**Size / dependencies.** M · depends on R9 for roles (admin reset).

### R11 — API key scopes & ownership

**Why.** Keys are global and all-powerful: a CI key can approve, delete and read
every project. Rotation exists, but least privilege does not.

**Scope (v1).**

- Key fields: owner (`userId`), scopes (`upload`, `read`, `approve`, `admin`),
  optional project allowlist, expiry/rotation unchanged.
- Enforce scopes in the guard/endpoint decorators; `403` names the missing scope.
- UI: scope picker, project badges, last used, owner.
- CI default: `upload` only; `approve` is opt-in.

**Not in scope.** Per-key rate-limit overrides (cheap follow-up), key templates.

**Design sketch.**

- Add columns + a `scopes` join table or text[]; decide based on query needs.
- Map scopes onto the R9 permission matrix so there is one authorization model.

**Acceptance.**

- [ ] Upload-only key gets `403` on approve/list
- [ ] Project-scoped key cannot read another project
- [ ] Existing keys migrate to `admin` scope (backward compatible)
- [ ] Rotation preserves scopes

**Size / dependencies.** S–M · depends on R9.

---

## Phase 5 — Comfort & scale

Long-tail work; sequence by demand.

### R12 — Bulk actions

**Why.** "Approve all" exists only per test; inbox cleanup is click-heavy.

**Scope.** Multi-select in the inbox/project list: approve all pending (per-test
loop with partial results), delete selected (typed confirmation), move projects.
Batch endpoints return per-item outcomes; the UI never reports a silent partial
success.

**Size.** M · independent.

### R13 — Test lifecycle

**Why.** No rename, tags, mute/quarantine or flake signal; tests only appear via
upload.

**Scope.** Rename project/test (unique per branch; audit keeps historical names);
tags/description with filters; mute/quarantine per test/variant with reason and
expiry (excluded from inbox, CI action reports it, status shows muted); flake
detection over the outcome history from R8 — start with oscillation counters, not
ML.

**Size.** M–L (rename/tags/mute); flake separate L · depends on R9 (actor), R8
(outcomes).

### R14 — Search & discovery

**Why.** Only per-list `q`; no global search or command palette.

**Scope.** Global search endpoint (projects/tests/branches, Postgres `ILIKE`/
trigram), `Ctrl/Cmd+K` palette with recent items, favorites persisted locally,
combine with existing filters; server-paginated.

**Size.** M · independent.

### R15 — Retention, quotas & storage visibility

**Why.** Only `JOB_RETENTION_DAYS` is configurable; there is no per-project
retention, no storage usage view, and once R3 adds baseline revisions the growth
becomes real.

**Scope.** Per-project retention (baseline revisions, run history, orphan grace)
with global defaults; storage usage per project (maintained counters or cached
bucket listing); soft/hard quota on upload; cleanup tasks with metrics and a
dry-run preview.

**Size.** M · depends on R3.

### R16 — Image formats & size policy

**Why.** Uploads accept PNG only; a dimension mismatch fails the job with
`BAD_REQUEST` instead of being reviewable
([test-kind.ts](../backend/src/common/domain/test-kind.ts)).

**Scope.** Accept JPEG/WebP (decode to RGBA for comparison or convert on ingest);
per-test size policy: fail (default) / pad / crop / resize; clearer limit errors;
action docs. Dependency choice (sharp vs. pure JS) in ADR-032.

**Size.** M · independent.

### R17 — Internationalization

**Why.** The UI is English-only; the docs and audience are not.

**Scope.** `vue-i18n` (new dependency — confirm against ADR-001 and
`package.json` first), extract strings, German + English, persisted locale,
date/number formatting, translated a11y labels, CI check for missing keys.

**Size.** M · independent.

### R18 — Share links

**Why.** Stakeholders need read-only views without accounts.

**Scope.** Signed, expiring, revocable share tokens scoped to project/test/run;
read-only page (never approve); optional passphrase; access audit; rate limit;
hashing at rest.

**Size.** M · depends on R9 for creation permissions.

### R19 — Review assignment, SLA & 4-eyes

**Why.** The inbox is a shared queue with no ownership, due dates or
multi-approval.

**Scope.** Assign test/run to a user; "my reviews" filter; notifications via R4;
due dates and aging report; per-project required approvals (1..N) with per-user
approval rows finalized on threshold.

**Size.** L · depends on R9 + R4.

### R20 — Review comments & decision notes

**Why.** Approval has no reason, and reviewers cannot discuss a comparison.

**Scope.** Comment thread per comparison/test (markdown-lite), resolve, mentions
later; structured approval reason (`intended change` / `flake` / `infra`) stored
in `Approval`; optional image pins in a later v2. Notifications via R4.

**Size.** M · depends on R9.

---

## Considered and rejected

### Ignore regions / masks — dropped by product decision (2026-10-25)

We deliberately do not build ignore regions, selector masks or per-region
tolerances. Consequences, accepted with the decision:

- Dynamic content (timestamps, ads, avatars, animations) keeps producing
  pendings; the threshold only absorbs global noise (anti-aliasing, subpixel
  shifts), not moving regions.
- Tests must be made deterministic on the capture side (fixed data, frozen clock,
  disabled animations).
- Revisit trigger: if false positives from dynamic regions dominate review time
  (e.g. more than a third of pendings are "known noise"), reconsider — the
  comparison engine and variant/baseline config are the seams to extend.

R2 (Diff UX) fills the review-quality slot this item had in the original gap
list.

### Reject endpoint — remains out of scope (ADR-023)

Pending changes are retired by a newer upload, threshold auto-accept or
deletion. R20 adds decision notes so a reviewer can record why a change was
fine, without a reject action.

### Branch-scoped follow-ups — remain out of scope (ADR-027)

Baseline promotion/merge, branch rename, branch-scoped permissions/API keys,
auto-archiving and a branch-level threshold stay deferred. R6 adds run-level
commit metadata, which is narrower than the branch-level metadata ADR-027
deferred; record the distinction in ADR-030.

### Also deferred

- Email/SMTP notifications — webhooks reach Slack/Teams; email is a separate
  infrastructure decision.
- SSO/OIDC/SAML — revisit when a deployment requires an IdP (ADR-025 keeps the
  zero-dependency stance).
- Built-in crawler / browser capture — the platform stays capture-agnostic.
- Multi-tenancy/orgs — single-tenant self-hosting is the product.

---

## Decisions to make (ADRs)

| ADR                                          | Topic                                            | Status   |
| -------------------------------------------- | ------------------------------------------------ | -------- |
| [ADR-028](adr/ADR-028-baseline-revisions.md) | Baseline revisions, retention, restore semantics | Accepted |
| [ADR-029](adr/ADR-029-webhook-delivery.md)   | Webhook outbox & delivery (complements ADR-004)  | Accepted |
| [ADR-030](adr/ADR-030-run-grouping.md)       | Run model, finish semantics, commit metadata     | Accepted |
| ADR-031                                      | Roles & permission matrix                        | Planned  |
| ADR-032                                      | Image decoding & size/resize policy              | Planned  |
| ADR-033                                      | Share-link security (tokens, expiry, audit)      | Planned  |

Numbering starts after ADR-027. Each ADR follows the existing template
(context, decision, rationale, alternatives, consequences).

## Open questions

1. ~~**R1 semantics** — keep the baseline on auto-accept (recommended) or promote
   silently?~~ Resolved: keep the baseline (implemented in R1).
2. ~~**R3 inherited variants** — is restore on a feature branch allowed (pinning
   ownership) or `409` until the variant is owned?~~ Resolved: `409`, no
   pin-on-restore (ADR-028).
3. **R6 run finish** — explicit `finish` only, or also a quiet-period heuristic
   for callers that forget it?
4. **R4 transport** — outbox dispatcher in the worker vs. a second job type in
   the existing queue.
5. **R9 roles** — three roles enough, or is a separate `APPROVER` needed?
6. **R11 keys** — can an `approve`-scoped API key approve, or is approval
   session-only going forward?
7. **R15 defaults** — how many baseline revisions per variant, and how long do
   runs stay visible?
8. **R18 share links** — passphrase support or token-only?

## Sequencing rationale

- R1/R2 are cheap, independent and immediately reduce noise and review effort;
  they also validate the review UX before bigger surfaces build on it.
- R3–R5 make the existing pipeline trustworthy (undo, notifications, audit)
  without touching its core; they are prerequisites for asking teams to rely on
  approvals.
- R6 is the product leap but also the riskiest change; it gets a spike/ADR first
  and lands after the trust items so reviewers already have history and audit.
- R7/R8 convert run grouping into everyday CI value (batch upload, reports).
- R9–R11 make the platform safe for a team; doing them before R12+ avoids
  reworking permissions into every later feature.
- R12–R20 are demand-driven; ship them in the order customers ask for.

## Maintaining this document

- Check off acceptance criteria as items ship and set the at-a-glance status to
  `Shipped`; keep the section so the history stays readable. Git history carries
  the commit.
- When an item is dropped, record it under
  [Considered and rejected](#considered-and-rejected) with the reason and a
  revisit trigger — do not delete the row.
- Keep the at-a-glance table and the per-item sections in sync.

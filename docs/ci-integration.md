# CI Integration

Visual Regression is built to run from a pipeline: upload a capture, wait for the comparison, and fail the job when the change needs a human review.

## 1. Authenticate

Create an API key once and store it as a secret (for example `VRT_API_KEY`):

- In the dashboard: **API keys** (`/api-keys`) → create.
- From a bootstrap shell, using `ADMIN_API_KEY`:

```bash
curl -X POST http://localhost:3000/api/v1/admin/api-keys \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"name":"github-actions"}'
```

The response contains `rawKey`, shown exactly once. Send it as `x-api-key` on every product request. Pass `scopes` (for example `["upload","read"]`, or `["upload","read","approve","admin"]` for scripting) and `projectNames` to narrow the key; the default is `upload` only.

A single-file upload needs `upload`; `run-key` mode also needs `read` for the status poll and, while `finish-run` is on (the default), `admin` to finish the run.

### Key lifecycle

Create one key per pipeline, so a leak is revoked without touching the others.
Listing, creating, rotating, revoking and deleting keys all require a **browser
session** — an API key cannot manage keys, so a leaked CI key cannot escalate into
permanent access:

```bash
# Both require a browser session — an API key cannot manage keys.
POST /api/v1/api-keys/:id/rotate   {"graceMinutes": 60}
POST /api/v1/api-keys/:id/revoke   {"reason": "rotated in CI"}
```

Rotation keeps the scopes and the project allowlist and returns the new `rawKey`
once. `graceMinutes` (default 0) keeps the previous key working for that long, so a
pipeline can be switched without a failed build; omitting `expiresInDays` inherits
the predecessor's remaining lifetime. Revocation is immediate and records the
reason in the audit trail. The dashboard shows owner, scopes, project badge, last
use and expiry per key and offers the one action it should: delete.

## 2. Upload and wait

Project and test names use letters, digits, `-` and `_`. The first upload creates
the project, its default branch and the test, so a fresh install needs no manual
setup — a name nobody has used yet is fine.

```bash
# 1) Upload the capture.
curl -X POST \
  "https://vrt.example.com/api/v1/projects/checkout/tests/login/upload?testKind=image" \
  -H "x-api-key: $VRT_API_KEY" \
  -F "file=@artifacts/login.png" \
  -F "viewport=1920x1080" \
  -F "browser=Chromium" \
  -F "environment=staging" \
  -F "branch=$GITHUB_HEAD_REF"
```

The upload returns one of three statuses:

| Status              | Meaning                                                       | CI outcome        |
| ------------------- | ------------------------------------------------------------- | ----------------- |
| `identical`         | The capture matches the baseline.                             | pass              |
| `baseline_created`  | This was the first capture of the variant.                    | pass              |
| `comparison_queued` | A comparison job was enqueued; the response includes `jobId`. | wait, then decide |

```json
{
  "status": "comparison_queued",
  "jobId": "cm...",
  "branch": "feature/x",
  "...": "..."
}
```

The upload also accepts the optional form fields `runKey`, `commitSha`, `commitMessage` and `ciUrl` to group the capture into a CI run; see [Runs](#runs). Without `runKey` the request behaves exactly as shown here.

```bash
# 2) Wait for the job (wait is capped at 30s per request; repeat until terminal).
curl --get \
  "https://vrt.example.com/api/v1/projects/checkout/tests/login/jobs/$JOB_ID" \
  -H "x-api-key: $VRT_API_KEY" \
  --data-urlencode "branch=feature/x" \
  --data-urlencode "wait=30"
```

```json
{
  "id": "cm...",
  "status": "COMPLETED",
  "testId": "cm...",
  "error": null,
  "createdAt": "2026-10-28T10:00:00.000Z",
  "completedAt": "2026-10-28T10:00:02.000Z",
  "comparison": {
    "id": "cm...",
    "status": "PENDING_APPROVAL",
    "mismatchPixelCount": 157,
    "mismatchPageCount": null,
    "pageCount": null
  }
}
```

`comparison` is `null` when the job produced no reviewable comparison (for example an unchanged capture, or the comparison was already retired). A `PENDING_APPROVAL` comparison means the pipeline should fail and link the reviewer to the dashboard:

```
https://vrt.example.com/projects/checkout/tests/login?branch=feature%2Fx
```

Job states: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`. `COMPLETED` with `comparison.status === "APPROVED"` is also a pass.

## 3. GitHub Action

The repository ships a composite action at the root. Reference it by tag or SHA (replace `Fishkob/visual-regression` with the ref you deploy; the examples pin `v2.1.0`):

```yaml
name: Visual regression
on: [pull_request]

jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Capture login
        run: ./scripts/capture-login.sh # writes artifacts/login.png

      - uses: Fishkob/visual-regression@v2.1.0
        with:
          api-url: https://vrt.example.com
          api-key: ${{ secrets.VRT_API_KEY }}
          project: checkout
          test: login
          file: artifacts/login.png
          viewport: 1920x1080
          browser: Chromium
          environment: staging
          branch: ${{ github.head_ref || github.ref_name }}
          wait-seconds: "60"
          fail-on-pending: "true"
```

Without a `manifest`, the action uploads once, waits for a queued job, and exits non-zero when:

- the job fails,
- the comparison still needs review and `fail-on-pending` is `true` (default),
- the wait budget is exhausted.

It exits zero for `identical`, `baseline_created`, a completed comparison without a reviewable change, and an already `APPROVED` comparison.

Outputs: `status`, `job-id`, `comparison-id`, `comparison-status`. In run mode it also sets `run-key`, `run-state` and `run-pending-count`, and a manifest adds `upload-count` and `upload-failed-count` (see [Runs](#runs)). Use them in later steps:

```yaml
- if: always()
  run: echo "comparison=${{ steps.visual.outputs.comparison-id }}"
```

The action needs `curl` and `jq`; GitHub-hosted runners include both. `wait-seconds` is the overall budget; the action makes one request per up-to-15s wait, so a longer budget does not mean one long-held connection. In manifest mode it also bounds the uploads.

### Runs

Set `run-key` to group the uploads of one pipeline into a run and gate the step on the run instead of on a single comparison.

| Input            | Default  | Meaning                                                                 |
| ---------------- | -------- | ----------------------------------------------------------------------- |
| `run-key`        | `""`     | Run identity, unique per project + branch. Omit for the overview above. |
| `commit`         | `""`     | Commit SHA tested by the run. Sent as `commitSha`.                      |
| `commit-message` | `""`     | Commit message. Sent as `commitMessage`.                                |
| `ci-url`         | `""`     | Link back to the CI build. Sent as `ciUrl`.                             |
| `finish-run`     | `"true"` | Finish the run after the upload(s), then gate on the run status.        |
| `report-path`    | `""`     | Optional path for a JUnit XML report of the run (requires `run-key`).   |
| `manifest`       | `""`     | JSON manifest of captures to upload into the run (see below).           |
| `concurrency`    | `"4"`    | Maximum parallel manifest uploads, 1-16.                                |

```yaml
- uses: Fishkob/visual-regression@v2.1.0
  with:
    api-url: https://vrt.example.com
    api-key: ${{ secrets.VRT_API_KEY }}
    project: checkout
    test: login
    file: artifacts/login.png
    viewport: 1920x1080
    browser: Chromium
    environment: staging
    branch: ${{ github.head_ref || github.ref_name }}
    run-key: ${{ github.run_id }}-${{ github.run_attempt }}
    commit: ${{ github.sha }}
    commit-message: ${{ github.event.head_commit.message }}
    ci-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    finish-run: "true"
```

With `run-key` set, the action adds `runKey`, `commitSha`, `commitMessage` and `ciUrl` to the upload described in section 2. Everything else about the upload is unchanged: the three response statuses, the job wait and the per-upload outputs still apply. Without `run-key` the action sends exactly the request from section 2 and never calls a run endpoint.

**Finish and gate.** After a successful upload (including `identical` and `baseline_created`) the action calls `POST /api/v1/projects/{project}/runs/{runKey}/finish?branch=...` once when `finish-run` is `true`, then polls `GET /api/v1/projects/{project}/runs/{runKey}/status?branch=...` every ~5 s until the state is terminal or the `wait-seconds` budget runs out. The budget is shared with the job wait, and the last sleep is capped to the time left. Finish is idempotent, and a later upload into a finished run reopens it (new content means the run was not actually done).

Run states and exit codes:

| State     | Meaning                                                                                     | Exit                                                                         |
| --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `passed`  | No failed jobs, nothing pending, run finished.                                              | `0`                                                                          |
| `failed`  | At least one job failed (`status.failedJobs`).                                              | `1`                                                                          |
| `pending` | Comparisons await review, or jobs are still running.                                        | `1` when `fail-on-pending` is `true` (default), `0` with a warning otherwise |
| `open`    | Not finished and no pending work when the budget expired (also with `finish-run: "false"`). | `1`                                                                          |

`wait-seconds` therefore bounds both waits; a run that is still `open` at the deadline fails with the run link instead of passing silently. When `finish-run` is `false` the step never closes the run, so an `open` run at the deadline fails with an explanation (set `finish-run: "true"` or finish the run separately).

Run-mode outputs are `run-key`, `run-state` and `run-pending-count` (comparisons awaiting review, i.e. `status.pendingComparisons`), in addition to the single-upload outputs. `status.mutedPending` is the subset belonging to muted/quarantined tests; those do not hold the run gate, and the step summary shows the count. If a queued job did not reach a terminal state before the budget, `status` stays `comparison_queued` and the run status decides. The action also appends a markdown block with the run key, state and counts to `GITHUB_STEP_SUMMARY`, and failure messages link to the run detail page:

```
https://vrt.example.com/projects/checkout/runs/12345?branch=feature%2Fx
```

#### Batch upload (manifest)

`manifest` uploads many captures into one run in a single step, which is what you want for a pipeline that produces more than one screenshot. It requires a run key: set `run-key` or a top-level `runKey` in the manifest.

```json
{
  "runKey": "ci-12345",
  "branch": "feature/x",
  "commitSha": "9fceb02",
  "commitMessage": "feat: checkout v2",
  "ciUrl": "https://github.com/org/repo/actions/runs/1",
  "captures": [
    {
      "project": "checkout",
      "test": "login",
      "file": "artifacts/login.png",
      "kind": "image",
      "viewport": "1920x1080",
      "browser": "chromium",
      "environment": "staging"
    },
    {
      "test": "cart",
      "file": "artifacts/cart.pdf",
      "kind": "pdf",
      "viewport": "1024x768",
      "browser": "chromium",
      "environment": "staging"
    }
  ]
}
```

```yaml
- uses: Fishkob/visual-regression@v2.1.0
  with:
    api-url: https://vrt.example.com
    api-key: ${{ secrets.VRT_API_KEY }}
    project: checkout
    manifest: artifacts/visual-regression.json
    run-key: ${{ github.run_id }}-${{ github.run_attempt }}
    commit: ${{ github.sha }}
    commit-message: ${{ github.event.head_commit.message }}
    ci-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    concurrency: "4"
    wait-seconds: "120"
```

Rules:

- `project` per capture falls back to the `project` input, and every capture must resolve to the same project: a run belongs to one project. `test`, `file`, `viewport`, `browser` and `environment` are required per capture; `kind` defaults to `image`.
- `runKey`, `branch`, `commitSha`, `commitMessage` and `ciUrl` come from the manifest when present and otherwise from the matching action input. `file` paths are relative to `GITHUB_WORKSPACE`; absolute paths are used as-is.
- When `manifest` is set the single-file inputs (`file`, `test`, `kind`, `viewport`, `browser`, `environment`) are ignored. The manifest is validated before anything is uploaded: valid JSON, a non-empty `captures` array, every required field, one project, and every file present.
- Up to `concurrency` captures upload in parallel (default 4, range 1-16). Each upload is the request from section 2 with the run fields added. A `429`, a `5xx` or a network error is retried up to three attempts, honouring a numeric `Retry-After` and backing off 1 s then 2 s otherwise.
- `wait-seconds` is one budget for the uploads, the retries and the run gate. When it is exhausted the action stops launching uploads, marks the rest failed, writes the summary and fails the step.

If any capture fails the step fails with the run link, the number of failures and the first three errors, and the run is left unfinished for inspection. Once every capture uploads, the action finishes the run (when `finish-run` is `true`) and gates on the run status exactly as described above.

Manifest outputs: `upload-count` (successful uploads), `upload-failed-count`, `status` (`batch_completed` or `batch_failed`), `run-key`, and (after a successful batch) `run-state` and `run-pending-count`. The step summary lists the capture count, uploaded/failed counts, the failures and the run state.

**JUnit report.** Set `report-path` to write the run's JUnit XML to disk (for example `reports/vrt-junit.xml`). The action downloads it after the run status is read, so the file exists for both a passing and a failing gate; a download problem is a warning, not a second failure. JUnit is the CI contract; see [Reports and trends](#4-reports-and-trends) for the other formats.

**Single file or manifest.** Uploading one file per step is still supported and behaves exactly as described above. Use the manifest for multi-capture runs. A run groups and gates; it does not isolate candidates — two uploads for the same variant still follow latest-wins, so parallel jobs for the same test can supersede each other.

### Playwright reporter (SDK)

The TypeScript client ships a Playwright reporter that uploads a test's screenshot attachment when the test ends. It needs no Playwright dependency at runtime and never fails the test run when VRT is unreachable.

The client is not on npm: it is the tarball attached to a platform release, and its version is the release tag. Install the one that matches your server.

```bash
# private repository: the asset needs an authenticated download
gh release download v2.1.0 -R Fishkob/visual-regression -p 'fishkob-vrt-*.tgz'
npm i ./fishkob-vrt-2.1.0.tgz
```

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { createVrtReporter } from "@fishkob/vrt/playwright";

export default defineConfig({
  reporter: [
    ["list"],
    [
      "@fishkob/vrt/playwright",
      {
        apiUrl: "https://vrt.example.com/api/v1",
        apiKey: process.env.VRT_API_KEY!,
        project: "checkout",
        runKey: process.env.GITHUB_RUN_ID,
        branch: process.env.GITHUB_HEAD_REF || "main",
        environment: "ci",
        uploadOnFailureOnly: false,
      },
    ],
  ],
});
```

- The reporter uploads the first attachment whose content type or name looks like a screenshot (`image/png`) or PDF, as `<project> / <titlePath joined with " / ">`.
- `uploadOnFailureOnly: true` uploads only failed/timed-out tests; `skipRetries: true` ignores Playwright's retry attempts so only the final result is uploaded.
- `concurrency`/`maxAttempts` are forwarded to `uploadMany` (default 4 / 3). Upload failures are collected in `reporter.results()` and via `onUpload`; they do not fail the test run.
- See [client-sdk/README.md](../client-sdk/README.md) for the full `uploadMany` API, the other subpath imports and how the tarball is built.

#### Config-as-code thresholds (`.vrt.json`)

A repository can carry its visual tolerances next to the tests. The reporter
reads `.vrt.json` from the working directory (override with `configPath`) and
sends the matching value as the upload's `pixelDiffThreshold`:

```json
{
  "thresholds": {
    "checkout.spec.ts / cart summary": 12,
    "login works": 4
  }
}
```

- Keys are the reporter's canonical name (`<title path joined with " / ">`); the
  bare test title and the last path segment are accepted as fallbacks.
- The server applies the value when the upload creates the baseline. On an
  existing baseline it can only **tighten** (lower) the threshold — a raise is
  ignored, because raising a threshold auto-accepts pending comparisons and is
  an ADMIN action ([ADR-057](adr/ADR-057-config-as-code-thresholds.md)).
- Any HTTP caller can use the same field: send `pixelDiffThreshold=<pixels>` in
  the upload multipart body. Thresholds are image-only; a PDF upload ignores
  them.
- The file is optional; a missing file means "no thresholds". An unreadable or
  invalid file is reported through `onConfigError`, and uploads proceed without
  thresholds.
- A project-wide default (not per test) is set by an ADMIN in **Project
  settings → Pixel threshold**; it applies to variants that have no threshold of
  their own and takes effect for comparisons that run after saving.

## 4. Reports and trends

Run reports are read-only, project/branch-scoped and use the same authentication as the rest of the API:

```bash
curl -H "x-api-key: $VRT_API_KEY" \
  "https://vrt.example.com/api/v1/projects/checkout/runs/$RUN_KEY/report/junit?branch=main"
```

| Format  | Content                                                                                                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `junit` | One `<testcase>` per test/variant uploaded in the run. A pending review or a failed job is a `<failure>` whose text links to the dashboard test page, so a standard CI viewer shows the gate exactly as the API does. |
| `html`  | Self-contained report (counts, pending/failed/approved rows, dashboard links). It links to tests rather than embedding thumbnails — presigned screenshot URLs expire.                                                 |
| `csv`   | Stable rows (project, run, branch, test, kind, variant, outcome, mismatch, detail) for spreadsheets/BI; the endpoint is not paginated, so repeated exports of an unchanged run are identical.                         |

The run detail page has the same three downloads. `GET /api/v1/projects/{project}/trends?days=30` returns:

- `daily[]` — changed / unchanged / within-threshold comparison counts per day.
- `pendingReview` — count plus average/max age of comparisons awaiting review, in seconds.
- `approvalLatency` — count plus average time from comparison completion to approval, in seconds (matched through the durable outcome history).
- `flakeRate` — tests with both changed and clean outcomes in the window vs. all tests.
- `reviewReasons` — approvals by decision reason (`intendedChange`, `flake`, `infra`), plus `noReason` for the approvals that recorded none (a bulk "approve all" deliberately writes no reason) and `knownNoise` / `knownNoiseRate` = `(flake + infra) / withReason`. That rate is the number behind the platform's ignore-region decision: if a third of the reviewed changes are known noise, masks come back on the table.

The dashboard shows these on the project's Trends page (the review-reason breakdown is API-only today). The underlying `ComparisonOutcomeEvent` rows are written after each comparison completes (outside the comparison transaction) and survive test/branch deletion, so trends do not depend on comparisons that approval deletes. The `reviewReasons` block reads the durable `Approval` rows instead, because the reason lives with the approval (ADR-040), not with the comparison outcome.

## 5. Notes and limits

- **Formats:** image uploads accept PNG, JPEG and WebP; JPEG/WebP are normalized to PNG at intake. A dimension mismatch follows the test's size policy (`FAIL` default, `PAD`, `CROP`, `RESIZE`).
- **Branch:** omit `branch` to use the project default; a new branch inherits the target branch's baseline. Pass the branch that produced the capture.
- **Wait cap:** the API accepts `wait` up to 30 seconds per request. Loop for longer budgets (the action does).
- **Idempotency:** uploads are content-addressed per test/variant; an identical capture short-circuits as `identical`. A retried job-status request is safe.
- **Runs:** `runKey` groups uploads and adds commit metadata; `manifest` uploads many captures into one run. Finish the run explicitly (idempotent) and gate on the run status. Runs do not isolate candidates — latest-wins still applies per variant. See [Runs](#runs).
- **Threshold:** an image diff at or below the baseline's `pixelDiffThreshold` is auto-accepted — the candidate is discarded, the baseline is kept, and the job completes with `comparison: null` (the action passes). A threshold of 0, the default, keeps every non-zero diff reviewable. The threshold is per variant and image-only; PDF comparisons always need review.
- **Webhooks:** project endpoints can subscribe to `review.requested`, `comparison.approved`, `review.assigned` and `review.comment` (dashboard → project → **Webhooks**; `ADMIN` session only). Deliveries are signed with `X-VRT-Timestamp` + `X-VRT-Signature: sha256=<hmac(secret, timestamp.body)>`, retried with backoff, and identified by `X-VRT-Delivery-Id` (at-least-once). The payload carries a dashboard link, not a presigned storage URL. Pipelines can still use the wait endpoint or the action. See [Webhooks](webhooks.md) for payloads, signature verification, the admin API and troubleshooting.
- **Rate limit:** uploads are capped per API key (`UPLOAD_RATE_LIMIT_PER_MINUTE`, default 60). The status endpoint is not upload-rate-limited.

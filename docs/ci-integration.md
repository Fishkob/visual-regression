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
  -d '{"name":"ci-pipeline"}'
```

The response contains `rawKey`, shown exactly once. Send it as `x-api-key` on every product request. Pass `scopes` (for example `["upload","read"]`, or `["upload","read","approve","admin"]` for scripting) and `projectNames` to narrow the key; the default is `upload` only.

A single-file upload needs `upload`. A `runKey` upload also needs `read` for the status poll and `admin` for `POST .../finish`.

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
  -F "branch=$BRANCH"
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

The upload also accepts the optional form fields `runKey`, `commitSha`, `commitMessage` and `ciUrl` to group the capture into a CI run; see [Runs and gates](#3-runs-and-gates). Without `runKey` the request behaves exactly as shown here.

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

## 3. Runs and gates

The upload accepts four optional form fields that put the capture into a run:
`runKey`, `commitSha`, `commitMessage` and `ciUrl`. A run is unique per project
and branch, carries the commit a pipeline tested into the dashboard, and groups
the captures of that pipeline. It groups and gates work; it does not isolate
candidates — latest-wins still applies per variant, so two jobs that upload the
same variant supersede each other.

Finish the run with `POST /api/v1/projects/{project}/runs/{runKey}/finish` and
read the gate from `GET /api/v1/projects/{project}/runs/{runKey}/status` (both
take `branch`). Finish is idempotent, and a later upload into a finished run
reopens it: new content means the run was not done.

| State     | Meaning                                              | Your job             |
| --------- | ---------------------------------------------------- | -------------------- |
| `passed`  | No failed jobs, nothing pending, run finished.       | pass                 |
| `failed`  | At least one job failed (`status.failedJobs`).       | fail                 |
| `pending` | Comparisons await review, or jobs are still running. | fail (or warn)       |
| `open`    | Not finished and no pending work when you read it.   | fail: finish the run |

`status.mutedPending` is the subset of pending comparisons that belongs to muted
or quarantined tests. Those do not hold the gate, so a run can be `passed` with
them listed. A queued job that has not reached a terminal state does not change
the answer: the run status decides.

The run's JUnit, HTML and CSV reports come from
`GET /api/v1/projects/{project}/runs/{runKey}/report/{format}`; the formats are
described in [Reports and trends](#5-reports-and-trends).

## 4. Playwright reporter (SDK)

The TypeScript client ships a Playwright reporter that uploads a test's screenshot attachment when the test ends. It needs no Playwright dependency at runtime and never fails the test run when VRT is unreachable.

The client is not on npm: it is the tarball attached to a platform release, and its version is the release tag. Install the one that matches your server.

```bash
# private repository: the asset needs an authenticated download
gh release download v3.4.0 -R Fishkob/visual-regression -p 'fishkob-vrt-*.tgz'
npm i ./fishkob-vrt-3.4.0.tgz
```

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    ["list"],
    [
      "@fishkob/vrt/playwright",
      {
        apiUrl: "https://vrt.example.com/api/v1",
        apiKey: process.env.VRT_API_KEY!,
        project: "checkout",
        runKey: process.env.CI_RUN_ID,
        branch: process.env.CI_BRANCH || "main",
        environment: "ci",
        uploadOnFailureOnly: false,
      },
    ],
  ],
});
```

- The reporter uploads the first attachment whose content type or name looks like a screenshot (`image/png`) or PDF, into `<project>`, and names the test after the Playwright title path. A test name is a path segment, so it is reduced to `[A-Za-z0-9_-]`, at most 100 characters: `checkout.spec.ts / cart summary` becomes `checkout-spec-ts-cart-summary`. An over-long name keeps a stable hash of the full title path, so two tests that share a prefix stay two tests.
- The test attaches the capture itself: `testInfo.attach("screenshot", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" })`. Playwright attaches a `toHaveScreenshot` image only when it writes or diffs a snapshot, so a matching assertion uploads nothing of its own.
- `uploadOnFailureOnly: true` uploads only failed/timed-out tests; `skipRetries: true` ignores Playwright's retry attempts so only the final result is uploaded.
- `concurrency`/`maxAttempts` are forwarded to `uploadMany` (default 4 / 3). Upload failures are collected in `reporter.results()` and via `onUpload`; they do not fail the test run.
- `apiUrl` is the API root and carries `/api/v1`.
- See [client-sdk/README.md](../client-sdk/README.md) for the full `uploadMany` API, the other subpath imports and how the tarball is built.

### Config-as-code thresholds (`.vrt.json`)

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

- Keys are the reporter's canonical name (`<title path joined with " / ">`), the
  reduced name the dashboard shows, the bare test title, or the last path
  segment.
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

## 5. Reports and trends

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

The dashboard shows these on the project's Trends page. The underlying `ComparisonOutcomeEvent` rows are written after each comparison completes (outside the comparison transaction) and survive test/branch deletion, so trends do not depend on comparisons that approval deletes.

## 6. Notes and limits

- **Formats:** image uploads accept PNG, JPEG and WebP; JPEG/WebP are normalized to PNG at intake, without applying EXIF orientation — a capture that relies on it lands rotated. A dimension mismatch follows the test's size policy (`FAIL` default, `PAD`, `CROP`, `RESIZE`).
- **Variant:** `viewport`, `browser` and `environment` are the baseline's identity and are matched verbatim, case included. Keep them identical across runs: a changed value is a new variant, whose first upload creates a baseline and passes without comparing.
- **Branch:** omit `branch` to use the project default; a new branch inherits the target branch's baseline. Pass the branch that produced the capture. Approving on a branch never touches the target — what to do after the merge is in [branches.md](branches.md).
- **Wait cap:** the API accepts `wait` up to 30 seconds per request. Loop for longer budgets.
- **Idempotency:** uploads are content-addressed per test/variant; an identical capture short-circuits as `identical`. A retried job-status request is safe.
- **Runs:** `runKey` groups uploads and adds commit metadata. Finish the run explicitly (idempotent) and gate on the run status. Runs do not isolate candidates — latest-wins still applies per variant. See [Runs and gates](#3-runs-and-gates).
- **Threshold:** an image diff at or below the baseline's `pixelDiffThreshold` is auto-accepted — the candidate is discarded, the baseline is kept, and the job completes with `comparison: null`. A threshold of 0, the default, keeps every non-zero diff reviewable. The threshold is per variant and image-only; PDF comparisons always need review.
- **Webhooks:** project endpoints can subscribe to `review.requested`, `comparison.approved`, `review.assigned` and `review.comment` (dashboard → project → **Webhooks**; `ADMIN` session only). Deliveries are signed with `X-VRT-Timestamp` + `X-VRT-Signature: sha256=<hmac(secret, timestamp.body)>`, retried with backoff, and identified by `X-VRT-Delivery-Id` (at-least-once). The payload carries a dashboard link, not a presigned storage URL. Pipelines can still use the wait endpoint. See [Webhooks](webhooks.md) for payloads, signature verification, the admin API and troubleshooting.
- **Rate limit:** uploads are capped per API key (`UPLOAD_RATE_LIMIT_PER_MINUTE`, default 240). The status endpoint is not upload-rate-limited.

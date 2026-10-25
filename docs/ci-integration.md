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

The response contains `rawKey`, shown exactly once. Send it as `x-api-key` on every product request. See [CI Authentication](../README.md#ci-authentication) for key rotation and scope details.

## 2. Upload and wait

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

The repository ships a composite action at the root. Reference it by tag or SHA (replace `Fishkob/visual-regression` with the ref you deploy):

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

      - uses: Fishkob/visual-regression@v1
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

The action uploads once, waits for a queued job, and exits non-zero when:

- the job fails,
- the comparison still needs review and `fail-on-pending` is `true` (default),
- the wait budget is exhausted.

It exits zero for `identical`, `baseline_created`, a completed comparison without a reviewable change, and an already `APPROVED` comparison.

Outputs: `status`, `job-id`, `comparison-id`, `comparison-status`. In run mode it also sets `run-key`, `run-state` and `run-pending-count` (see [Runs](#runs)). Use them in later steps:

```yaml
- if: always()
  run: echo "comparison=${{ steps.visual.outputs.comparison-id }}"
```

The action needs `curl` and `jq`; GitHub-hosted runners include both. `wait-seconds` is the overall budget; the action makes one request per up-to-15s wait, so a longer budget does not mean one long-held connection.

### Runs

Set `run-key` to group the uploads of one pipeline into a run and gate the step on the run instead of on a single comparison.

| Input            | Default  | Meaning                                                                 |
| ---------------- | -------- | ----------------------------------------------------------------------- |
| `run-key`        | `""`     | Run identity, unique per project + branch. Omit for the overview above. |
| `commit`         | `""`     | Commit SHA tested by the run. Sent as `commitSha`.                      |
| `commit-message` | `""`     | Commit message. Sent as `commitMessage`.                                |
| `ci-url`         | `""`     | Link back to the CI build. Sent as `ciUrl`.                             |
| `finish-run`     | `"true"` | Finish the run after the upload, then gate on the run status.           |

```yaml
- uses: Fishkob/visual-regression@v1
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

Run-mode outputs are `run-key`, `run-state` and `run-pending-count` (comparisons awaiting review, i.e. `status.pendingComparisons`), in addition to the single-upload outputs. If a queued job did not reach a terminal state before the budget, `status` stays `comparison_queued` and the run status decides. The action also appends a markdown block with the run key, state and counts to `GITHUB_STEP_SUMMARY`, and failure messages link to the run detail page:

```
https://vrt.example.com/projects/checkout/runs/12345?branch=feature%2Fx
```

**One upload per step.** Until the batch/manifest upload in R7 the action uploads exactly one file, so it cannot populate a whole run by itself: a multi-capture run means uploading the other captures through the API with the same `runKey` and letting one action step (for the last capture) finish and gate the run, or finishing the run explicitly and gating with `finish-run: "false"` while another process closes it within `wait-seconds`. `finish-run: "false"` is not an "upload only" mode — a run still `open` at the deadline fails by design. A run groups and gates; it does not isolate candidates — two uploads for the same variant still follow latest-wins, so parallel jobs for the same test can supersede each other.

## 4. Notes and limits

- **Branch:** omit `branch` to use the project default; a new branch inherits the target branch's baseline. Pass the branch that produced the capture.
- **Wait cap:** the API accepts `wait` up to 30 seconds per request. Loop for longer budgets (the action does).
- **Idempotency:** uploads are content-addressed per test/variant; an identical capture short-circuits as `identical`. A retried job-status request is safe.
- **Runs:** `runKey` groups uploads and adds commit metadata; finish the run explicitly (idempotent) and gate on the run status. Runs do not isolate candidates — latest-wins still applies per variant. See [Runs](#runs).
- **Threshold:** an image diff at or below the baseline's `pixelDiffThreshold` is auto-accepted — the candidate is discarded, the baseline is kept, and the job completes with `comparison: null` (the action passes). A threshold of 0, the default, keeps every non-zero diff reviewable. The threshold is per variant and image-only; PDF comparisons always need review.
- **Webhooks:** project endpoints can subscribe to `review.requested` and `comparison.approved` (dashboard → project → Webhooks). Deliveries are signed with `X-VRT-Timestamp` + `X-VRT-Signature: sha256=<hmac(secret, timestamp.body)>`, retried with backoff, and identified by `X-VRT-Delivery-Id` (at-least-once). The payload carries a dashboard link, not a presigned storage URL. Pipelines can still use the wait endpoint or the action.
- **Rate limit:** uploads are capped per API key (`UPLOAD_RATE_LIMIT_PER_MINUTE`, default 60). The status endpoint is not upload-rate-limited.

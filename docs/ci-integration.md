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

Outputs: `status`, `job-id`, `comparison-id`, `comparison-status`. Use them in later steps:

```yaml
- if: always()
  run: echo "comparison=${{ steps.visual.outputs.comparison-id }}"
```

The action needs `curl` and `jq`; GitHub-hosted runners include both. `wait-seconds` is the overall budget; the action makes one request per up-to-15s wait, so a longer budget does not mean one long-held connection.

## 4. Notes and limits

- **Branch:** omit `branch` to use the project default; a new branch inherits the target branch's baseline. Pass the branch that produced the capture.
- **Wait cap:** the API accepts `wait` up to 30 seconds per request. Loop for longer budgets (the action does).
- **Idempotency:** uploads are content-addressed per test/variant; an identical capture short-circuits as `identical`. A retried job-status request is safe.
- **Threshold:** an image diff at or below the baseline's `pixelDiffThreshold` is auto-accepted — the candidate is discarded, the baseline is kept, and the job completes with `comparison: null` (the action passes). A threshold of 0, the default, keeps every non-zero diff reviewable. The threshold is per variant and image-only; PDF comparisons always need review.
- **Webhooks:** project endpoints can subscribe to `review.requested` and `comparison.approved` (dashboard → project → Webhooks). Deliveries are signed with `X-VRT-Timestamp` + `X-VRT-Signature: sha256=<hmac(secret, timestamp.body)>`, retried with backoff, and identified by `X-VRT-Delivery-Id` (at-least-once). The payload carries a dashboard link, not a presigned storage URL. Pipelines can still use the wait endpoint or the action.
- **Rate limit:** uploads are capped per API key (`UPLOAD_RATE_LIMIT_PER_MINUTE`, default 60). The status endpoint is not upload-rate-limited.

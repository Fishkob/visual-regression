# Composite action

`action.yml` at the repository root runs `github-action.sh` from this directory.
It is a client of `/api/v1`: it runs in your pipeline and posts to the instance
behind `api-url`, so its tag does not have to match the server you deploy — only
the API version it speaks does. It is not part of the platform and not part of the
product documentation; the flow it wraps is described in
[docs/ci-integration.md](../../docs/ci-integration.md).

## Usage

Pin a tag or SHA; the examples use `v3.4.0`.

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

      - uses: Fishkob/visual-regression@v3.4.0
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
```

`api-url` is the site root; the action appends `/api/v1`. The API key needs
`upload`; run mode (below) also needs `read` and `admin`.

Without a `manifest`, the action uploads once, waits for a queued job, and exits
non-zero when:

- the job fails,
- the comparison still needs review and `fail-on-pending` is `true` (default),
- the wait budget is exhausted.

It exits zero for `identical`, `baseline_created`, a completed comparison without
a reviewable change, and an already `APPROVED` comparison.

Outputs: `status`, `job-id`, `comparison-id`, `comparison-status`. In run mode it
also sets `run-key`, `run-state` and `run-pending-count`, and a manifest adds
`upload-count` and `upload-failed-count`. Use them in later steps:

```yaml
- if: always()
  run: echo "comparison=${{ steps.visual.outputs.comparison-id }}"
```

The action needs `curl` and `jq`; GitHub-hosted runners include both.
`wait-seconds` is the budget the action tracks itself; it makes one request per
up-to-15s wait, so a longer budget does not mean one long-held connection. In
manifest mode it also bounds the uploads.

## Inputs

| Input             | Default  | Meaning                                                            |
| ----------------- | -------- | ------------------------------------------------------------------ |
| `api-url`         | required | Base URL of the instance, e.g. `https://vrt.example.com`.          |
| `api-key`         | required | Sent as the `x-api-key` header; store it as a repository secret.   |
| `project`         | `""`     | Project name. Required without `manifest`.                         |
| `test`            | `""`     | Test name. Required without `manifest`.                            |
| `file`            | `""`     | PNG or PDF path. Required without `manifest`.                      |
| `kind`            | `image`  | `image` or `pdf`.                                                  |
| `viewport`        | `""`     | Variant coordinate, e.g. `1920x1080`. Required without `manifest`. |
| `browser`         | `""`     | Variant coordinate, e.g. `Chromium`. Required without `manifest`.  |
| `environment`     | `""`     | Variant coordinate, e.g. `staging`. Required without `manifest`.   |
| `branch`          | `""`     | Branch that produced the upload; defaults to the project default.  |
| `manifest`        | `""`     | JSON manifest of captures; ignores the single-file inputs.         |
| `run-key`         | `""`     | Run key that groups uploads. Required with `manifest`.             |
| `commit`          | `""`     | Commit SHA tested by the run. Sent as `commitSha`.                 |
| `commit-message`  | `""`     | Commit message. Sent as `commitMessage`.                           |
| `ci-url`          | `""`     | Link back to the CI build. Sent as `ciUrl`.                        |
| `finish-run`      | `"true"` | Finish the run after the upload(s), then gate on the run status.   |
| `report-path`     | `""`     | Optional path for a JUnit XML report of the run (needs `run-key`). |
| `concurrency`     | `"4"`    | Maximum parallel manifest uploads, 1-16.                           |
| `wait-seconds`    | `"30"`   | Budget for the uploads, the job wait and the run status poll.      |
| `fail-on-pending` | `"true"` | Fail when the run (or comparison) still needs human review.        |

## Run mode

Set `run-key` to group the uploads of one pipeline into a run and gate the step on
the run instead of on a single comparison. `commit`, `commit-message` and `ci-url`
are only sent when a run key is set.

```yaml
- uses: Fishkob/visual-regression@v3.4.0
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

With `run-key` set, the action adds `runKey`, `commitSha`, `commitMessage` and
`ciUrl` to the upload. Everything else about the upload is unchanged: the three
response statuses, the job wait and the per-upload outputs still apply. Without
`run-key` the action never calls a run endpoint.

**Finish and gate.** After a successful upload (including `identical` and
`baseline_created`) the action calls
`POST /api/v1/projects/{project}/runs/{runKey}/finish?branch=...` once when
`finish-run` is `true`, then polls
`GET /api/v1/projects/{project}/runs/{runKey}/status?branch=...` every ~5 s until
the state is terminal or the `wait-seconds` budget runs out. The budget is shared
with the job wait, and the last sleep is capped to the time left. Finish is
idempotent, and a later upload into a finished run reopens it (new content means
the run was not actually done).

Run states and exit codes:

| State     | Meaning                                                                                     | Exit                                                                         |
| --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `passed`  | No failed jobs, nothing pending, run finished.                                              | `0`                                                                          |
| `failed`  | At least one job failed (`status.failedJobs`).                                              | `1`                                                                          |
| `pending` | Comparisons await review, or jobs are still running.                                        | `1` when `fail-on-pending` is `true` (default), `0` with a warning otherwise |
| `open`    | Not finished and no pending work when the budget expired (also with `finish-run: "false"`). | `1`                                                                          |

`wait-seconds` therefore bounds both waits; a run that is still `open` at the
deadline fails with the run link instead of passing silently. When `finish-run`
is `false` the step never closes the run, so an `open` run at the deadline fails
with an explanation (set `finish-run: "true"` or finish the run separately).

Run-mode outputs are `run-key`, `run-state` and `run-pending-count` (comparisons
awaiting review, i.e. `status.pendingComparisons`), in addition to the
single-upload outputs. `status.mutedPending` is the subset belonging to
muted/quarantined tests; those do not hold the run gate, and the step summary
shows the count. If a queued job did not reach a terminal state before the budget,
`status` stays `comparison_queued` and the run status decides. The action also
appends a markdown block with the run key, state and counts to
`GITHUB_STEP_SUMMARY`, and failure messages link to the run detail page:

```
https://vrt.example.com/projects/checkout/runs/12345?branch=feature%2Fx
```

## Batch upload (manifest)

`manifest` uploads many captures into one run in a single step. It requires a run
key: set `run-key` or a top-level `runKey` in the manifest.

```json
{
  "runKey": "ci-12345",
  "branch": "feature/x",
  "commitSha": "9fceb02",
  "commitMessage": "feat: checkout v2",
  "ciUrl": "https://example.com/ci/runs/1",
  "captures": [
    {
      "project": "checkout",
      "test": "login",
      "file": "artifacts/login.png",
      "kind": "image",
      "viewport": "1920x1080",
      "browser": "Chromium",
      "environment": "staging"
    },
    {
      "test": "cart",
      "file": "artifacts/cart.pdf",
      "kind": "pdf",
      "viewport": "1024x768",
      "browser": "Chromium",
      "environment": "staging"
    }
  ]
}
```

```yaml
- uses: Fishkob/visual-regression@v3.4.0
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

- `project` per capture falls back to the `project` input, and every capture must
  resolve to the same project: a run belongs to one project. `test`, `file`,
  `viewport`, `browser` and `environment` are required per capture; `kind`
  defaults to `image`.
- `runKey`, `branch`, `commitSha`, `commitMessage` and `ciUrl` come from the
  manifest when present and otherwise from the matching action input. `file` paths
  are relative to `GITHUB_WORKSPACE`; absolute paths are used as-is.
- When `manifest` is set the single-file inputs (`file`, `test`, `kind`,
  `viewport`, `browser`, `environment`) are ignored. The manifest is validated
  before anything is uploaded: valid JSON, a non-empty `captures` array, every
  required field, one project, and every file present.
- Up to `concurrency` captures upload in parallel (default 4, range 1-16). Each
  upload is the single-file request with the run fields added. A `429`, a `5xx` or
  a network error is retried up to three attempts, honouring a numeric
  `Retry-After` and backing off 1 s then 2 s otherwise.
- `wait-seconds` is one budget for the uploads, the retries and the run gate. When
  it is exhausted the action stops launching uploads, marks the rest failed,
  writes the summary and fails the step.

If any capture fails the step fails with the run link, the number of failures and
the first three errors, and the run is left unfinished for inspection. Once every
capture uploads, the action finishes the run (when `finish-run` is `true`) and
gates on the run status exactly as described above.

Manifest outputs: `upload-count` (successful uploads), `upload-failed-count`,
`status` (`batch_completed` or `batch_failed`), `run-key`, and (after a successful
batch) `run-state` and `run-pending-count`. The step summary lists the capture
count, uploaded/failed counts, the failures and the run state.

## JUnit report

Set `report-path` to write the run's JUnit XML to disk (for example
`reports/vrt-junit.xml`). The action downloads it after the run status is read, so
the file exists for both a passing and a failing gate; a download problem is a
warning, not a second failure. JUnit is the CI contract; the other formats and the
endpoint behind them are in
[docs/ci-integration.md](../../docs/ci-integration.md#5-reports-and-trends).

## Notes

- Uploading one file per step is still supported and behaves exactly as described
  above. Use the manifest for multi-capture runs. A run groups and gates; it does
  not isolate candidates — two uploads for the same variant still follow
  latest-wins, so parallel jobs for the same test can supersede each other.
- The variant coordinates (`viewport`, `browser`, `environment`) are matched
  verbatim, case included; a changed value is a new variant whose first upload
  creates a baseline and passes without comparing.
- The action exists for GitHub-hosted pipelines. The platform itself does not
  depend on it: everything it does is `/api/v1` calls that any pipeline can make
  directly.

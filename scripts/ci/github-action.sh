#!/usr/bin/env bash
# Composite GitHub Action entry point: upload one artifact, wait for the queued
# comparison and, when a run key is set, close the run and gate the step on the
# run status. Kept as a script (not inline YAML) so it can be run locally
# against a test server.
set -euo pipefail

fail() {
  echo "::error::$*" >&2
  exit 1
}

set_output() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >>"$GITHUB_OUTPUT"
  fi
}

require() {
  local name=$1 value=$2
  [ -n "$value" ] || fail "Input '$name' is required."
}

require "api-url" "${INPUT_API_URL:-}"
require "api-key" "${INPUT_API_KEY:-}"
require "project" "${INPUT_PROJECT:-}"
require "test" "${INPUT_TEST:-}"
require "file" "${INPUT_FILE:-}"
require "viewport" "${INPUT_VIEWPORT:-}"
require "browser" "${INPUT_BROWSER:-}"
require "environment" "${INPUT_ENVIRONMENT:-}"

KIND="${INPUT_KIND:-image}"
case "$KIND" in
  image | pdf) ;;
  *) fail "Input 'kind' must be 'image' or 'pdf' (got '$KIND')." ;;
esac

[ -f "$INPUT_FILE" ] || fail "File '$INPUT_FILE' does not exist."
command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v jq >/dev/null 2>&1 || fail "jq is required."

API_URL="${INPUT_API_URL%/}"
WAIT_SECONDS="${INPUT_WAIT_SECONDS:-30}"
FAIL_ON_PENDING="${INPUT_FAIL_ON_PENDING:-true}"
FINISH_RUN="${INPUT_FINISH_RUN:-true}"
RUN_KEY="${INPUT_RUN_KEY:-}"
COMMIT="${INPUT_COMMIT:-}"
COMMIT_MESSAGE="${INPUT_COMMIT_MESSAGE:-}"
CI_URL="${INPUT_CI_URL:-}"
case "$WAIT_SECONDS" in
  '' | *[!0-9]*) fail "Input 'wait-seconds' must be a non-negative integer." ;;
esac
case "$FAIL_ON_PENDING" in
  true | false) ;;
  *) fail "Input 'fail-on-pending' must be 'true' or 'false'." ;;
esac
case "$FINISH_RUN" in
  true | false) ;;
  *) fail "Input 'finish-run' must be 'true' or 'false'." ;;
esac

uri() { jq -rn --arg value "$1" '$value|@uri'; }

PROJECT_URI=$(uri "$INPUT_PROJECT")
TEST_URI=$(uri "$INPUT_TEST")
BRANCH_URI=""
if [ -n "${INPUT_BRANCH:-}" ]; then
  BRANCH_URI=$(uri "$INPUT_BRANCH")
fi
UPLOAD_URL="$API_URL/api/v1/projects/$PROJECT_URI/tests/$TEST_URI/upload?testKind=$KIND"

RUN_URI=""
RUN_LINK=""
if [ -n "$RUN_KEY" ]; then
  RUN_URI=$(uri "$RUN_KEY")
  RUN_LINK="$API_URL/projects/$PROJECT_URI/runs/$RUN_URI"
  if [ -n "$BRANCH_URI" ]; then
    RUN_LINK="$RUN_LINK?branch=$BRANCH_URI"
  fi
fi

JOB_ERROR=""
run_response=""
run_state=""
run_pending=0
run_pending_jobs=0
run_failed=0
run_approved=0
run_tests=0

write_summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] || return 0
  {
    printf "### Visual regression run \`%s\`\n\n" "$RUN_KEY"
    printf "| Field | Value |\n"
    printf "| --- | --- |\n"
    printf "| Run | [\`%s\`](%s) |\n" "$RUN_KEY" "$RUN_LINK"
    printf "| State | \`%s\` |\n" "$run_state"
    printf "| Pending comparisons | %s |\n" "$run_pending"
    printf "| Pending jobs | %s |\n" "$run_pending_jobs"
    printf "| Failed jobs | %s |\n" "$run_failed"
    printf "| Approved | %s |\n" "$run_approved"
    printf "| Tests | %s |\n" "$run_tests"
    if [ -n "$COMMIT" ]; then
      printf "| Commit | \`%s\` |\n" "$COMMIT"
    fi
    if [ -n "${INPUT_BRANCH:-}" ]; then
      printf "| Branch | \`%s\` |\n" "$INPUT_BRANCH"
    fi
  } >>"$GITHUB_STEP_SUMMARY"
}

parse_run_status() {
  local response=$1
  run_state=$(jq -r '.status.state // empty' <<<"$response") ||
    fail "Run status returned invalid JSON."
  [ -n "$run_state" ] || fail "Run status response has no state."
  run_pending=$(jq -r '.status.pendingComparisons // 0' <<<"$response") ||
    fail "Run status returned invalid JSON."
  run_pending_jobs=$(jq -r '.status.pendingJobs // 0' <<<"$response") ||
    fail "Run status returned invalid JSON."
  run_failed=$(jq -r '.status.failedJobs // 0' <<<"$response") ||
    fail "Run status returned invalid JSON."
  run_approved=$(jq -r '.status.approved // 0' <<<"$response") ||
    fail "Run status returned invalid JSON."
  run_tests=$(jq -r '.status.testCount // 0' <<<"$response") ||
    fail "Run status returned invalid JSON."
}

fetch_run_status() {
  local url args response
  url="$API_URL/api/v1/projects/$PROJECT_URI/runs/$RUN_URI/status"
  args=(
    --silent --show-error --fail-with-body --get "$url"
    --header "x-api-key: $INPUT_API_KEY"
  )
  if [ -n "${INPUT_BRANCH:-}" ]; then
    args+=(--data-urlencode "branch=$INPUT_BRANCH")
  fi
  if ! response=$(curl "${args[@]}"); then
    printf '%s\n' "$response" >&2
    fail "Run status request failed."
  fi
  printf '%s\n' "$response"
}

# Run mode: close the run (unless finish-run is false) and gate the step on its
# derived state instead of on the single comparison that was just uploaded.
run_gate() {
  local finish_url finish_response
  local remaining poll_sleep
  local -a finish_args

  set_output run-key "$RUN_KEY"

  if [ "$FINISH_RUN" = "true" ]; then
    finish_url="$API_URL/api/v1/projects/$PROJECT_URI/runs/$RUN_URI/finish"
    if [ -n "$BRANCH_URI" ]; then
      finish_url="$finish_url?branch=$BRANCH_URI"
    fi
    finish_args=(
      --silent --show-error --fail-with-body
      --request POST
      "$finish_url"
      --header "x-api-key: $INPUT_API_KEY"
    )
    if ! finish_response=$(curl "${finish_args[@]}"); then
      printf '%s\n' "$finish_response" >&2
      fail "Finishing run '$RUN_KEY' failed."
    fi
    run_response="$finish_response"
  else
    run_response=$(fetch_run_status)
  fi

  while :; do
    parse_run_status "$run_response"
    case "$run_state" in
      passed | failed) break ;;
    esac
    remaining=$((DEADLINE - SECONDS))
    if [ "$remaining" -le 0 ]; then
      break
    fi
    poll_sleep=5
    [ "$poll_sleep" -gt "$remaining" ] && poll_sleep=$remaining
    sleep "$poll_sleep"
    run_response=$(fetch_run_status)
  done

  set_output run-state "$run_state"
  set_output run-pending-count "$run_pending"

  case "$run_state" in
    passed)
      write_summary
      echo "::notice::Run '$RUN_KEY' passed. See $RUN_LINK"
      ;;
    failed)
      write_summary
      if [ -n "$JOB_ERROR" ]; then
        fail "Run '$RUN_KEY' failed: $JOB_ERROR. See $RUN_LINK"
      fi
      fail "Run '$RUN_KEY' failed: ${run_failed} job(s) failed. See $RUN_LINK"
      ;;
    pending)
      write_summary
      if [ "$FAIL_ON_PENDING" = "true" ]; then
        if [ "$run_pending_jobs" -gt 0 ]; then
          fail "Run '$RUN_KEY' has ${run_pending} comparison(s) awaiting review and ${run_pending_jobs} job(s) still running. Review: $RUN_LINK"
        fi
        fail "Run '$RUN_KEY' has ${run_pending} comparison(s) awaiting review. Review: $RUN_LINK"
      fi
      echo "::warning::Run '$RUN_KEY' still has pending work, but fail-on-pending is false. Review: $RUN_LINK"
      ;;
    open)
      write_summary
      if [ "$FINISH_RUN" = "true" ]; then
        fail "Timed out after ${WAIT_SECONDS}s: run '$RUN_KEY' is still open (not finished) and still has work. See $RUN_LINK"
      fi
      fail "Timed out after ${WAIT_SECONDS}s: run '$RUN_KEY' is still open and finish-run is false, so the step did not close it. Set finish-run: true or finish the run explicitly. See $RUN_LINK"
      ;;
    *)
      fail "Unexpected run state '$run_state'."
      ;;
  esac
}

upload_args=(
  --silent --show-error --fail-with-body
  --request POST
  "$UPLOAD_URL"
  --header "x-api-key: $INPUT_API_KEY"
  --form "file=@$INPUT_FILE"
  --form "viewport=$INPUT_VIEWPORT"
  --form "browser=$INPUT_BROWSER"
  --form "environment=$INPUT_ENVIRONMENT"
)
if [ -n "${INPUT_BRANCH:-}" ]; then
  upload_args+=(--form "branch=$INPUT_BRANCH")
fi
if [ -n "$RUN_KEY" ]; then
  upload_args+=(
    --form "runKey=$RUN_KEY"
    --form "commitSha=$COMMIT"
    --form "commitMessage=$COMMIT_MESSAGE"
    --form "ciUrl=$CI_URL"
  )
fi

if ! upload_response=$(curl "${upload_args[@]}"); then
  printf '%s\n' "$upload_response" >&2
  fail "Upload failed."
fi

upload_status=$(jq -r '.status // empty' <<<"$upload_response") ||
  fail "Upload returned invalid JSON."
[ -n "$upload_status" ] || fail "Upload response has no status."

# One budget for the whole step: the per-job wait and the run poll share it.
DEADLINE=$((SECONDS + WAIT_SECONDS))

case "$upload_status" in
  identical)
    set_output status "identical"
    echo "::notice::Upload is identical to the baseline."
    ;;
  baseline_created)
    set_output status "baseline_created"
    echo "::notice::Baseline created; this run has nothing to compare."
    ;;
  comparison_queued)
    job_id=$(jq -r '.jobId // empty' <<<"$upload_response") ||
      fail "Upload returned invalid JSON."
    [ -n "$job_id" ] || fail "Queued upload did not return a jobId."
    set_output job-id "$job_id"

    job_status=""
    job_response=""
    while :; do
      remaining=$((DEADLINE - SECONDS))
      poll_wait=$remaining
      [ "$poll_wait" -gt 15 ] && poll_wait=15
      [ "$poll_wait" -lt 0 ] && poll_wait=0

      job_url="$API_URL/api/v1/projects/$PROJECT_URI/tests/$TEST_URI/jobs/$(uri "$job_id")"
      job_args=(
        --silent --show-error --fail-with-body --get "$job_url"
        --header "x-api-key: $INPUT_API_KEY"
        --data-urlencode "wait=$poll_wait"
      )
      if [ -n "${INPUT_BRANCH:-}" ]; then
        job_args+=(--data-urlencode "branch=$INPUT_BRANCH")
      fi
      if ! job_response=$(curl "${job_args[@]}"); then
        printf '%s\n' "$job_response" >&2
        fail "Job status request failed."
      fi

      job_status=$(jq -r '.status // empty' <<<"$job_response") ||
        fail "Job status returned invalid JSON."
      case "$job_status" in
        COMPLETED | FAILED) break ;;
        PENDING | PROCESSING)
          if [ "$remaining" -le 0 ]; then
            if [ -n "$RUN_KEY" ]; then
              echo "::warning::Job $job_id is still $job_status after ${WAIT_SECONDS}s; falling back to the run status."
              break
            fi
            fail "Timed out after ${WAIT_SECONDS}s waiting for job $job_id."
          fi
          sleep 1
          ;;
        *) fail "Unexpected job status '$job_status'." ;;
      esac
    done

    if [ "$job_status" = "FAILED" ]; then
      JOB_ERROR=$(jq -r '.error // "comparison failed"' <<<"$job_response")
      set_output status "failed"
      if [ -z "$RUN_KEY" ]; then
        fail "Comparison job failed: $JOB_ERROR"
      fi
    fi

    if [ "$job_status" = "COMPLETED" ]; then
      comparison_id=$(jq -r '.comparison.id // empty' <<<"$job_response")
      comparison_status=$(jq -r '.comparison.status // empty' <<<"$job_response")
      if [ -n "$comparison_id" ]; then
        set_output comparison-id "$comparison_id"
      fi
      if [ -n "$comparison_status" ]; then
        set_output comparison-status "$comparison_status"
      fi

      case "$comparison_status" in
        PENDING_APPROVAL)
          set_output status "pending_approval"
          if [ -n "$RUN_KEY" ]; then
            echo "::notice::Visual changes need review; the run gate decides this step's result."
          elif [ "$FAIL_ON_PENDING" = "true" ]; then
            fail "Visual changes need review: $API_URL/projects/$PROJECT_URI/tests/$TEST_URI"
          else
            echo "::warning::Visual changes need review, but fail-on-pending is false."
          fi
          ;;
        APPROVED)
          set_output status "approved"
          echo "::notice::Comparison is already approved."
          ;;
        *)
          set_output status "unchanged"
          echo "::notice::Comparison completed without a reviewable change."
          ;;
      esac
    fi
    ;;
  *)
    fail "Unexpected upload status '$upload_status'."
    ;;
esac

if [ -n "$RUN_KEY" ]; then
  run_gate
fi

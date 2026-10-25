#!/usr/bin/env bash
# Composite GitHub Action entry point: upload one artifact, wait for the queued
# comparison, and translate the result into a step exit code. Kept as a script
# (not inline YAML) so it can be run locally against a test server.
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
case "$WAIT_SECONDS" in
  '' | *[!0-9]*) fail "Input 'wait-seconds' must be a non-negative integer." ;;
esac
case "$FAIL_ON_PENDING" in
  true | false) ;;
  *) fail "Input 'fail-on-pending' must be 'true' or 'false'." ;;
esac

uri() { jq -rn --arg value "$1" '$value|@uri'; }

PROJECT_URI=$(uri "$INPUT_PROJECT")
TEST_URI=$(uri "$INPUT_TEST")
UPLOAD_URL="$API_URL/api/v1/projects/$PROJECT_URI/tests/$TEST_URI/upload?testKind=$KIND"

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

if ! upload_response=$(curl "${upload_args[@]}"); then
  printf '%s\n' "$upload_response" >&2
  fail "Upload failed."
fi

upload_status=$(jq -r '.status // empty' <<<"$upload_response") ||
  fail "Upload returned invalid JSON."
[ -n "$upload_status" ] || fail "Upload response has no status."

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
    deadline=$((SECONDS + WAIT_SECONDS))
    while :; do
      remaining=$((deadline - SECONDS))
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
            fail "Timed out after ${WAIT_SECONDS}s waiting for job $job_id."
          fi
          sleep 1
          ;;
        *) fail "Unexpected job status '$job_status'." ;;
      esac
    done

    if [ "$job_status" = "FAILED" ]; then
      job_error=$(jq -r '.error // "comparison failed"' <<<"$job_response")
      set_output status "failed"
      fail "Comparison job failed: $job_error"
    fi

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
        if [ "$FAIL_ON_PENDING" = "true" ]; then
          set_output status "pending_approval"
          fail "Visual changes need review: $API_URL/projects/$PROJECT_URI/tests/$TEST_URI"
        fi
        set_output status "pending_approval"
        echo "::warning::Visual changes need review, but fail-on-pending is false."
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
    ;;
  *)
    fail "Unexpected upload status '$upload_status'."
    ;;
esac

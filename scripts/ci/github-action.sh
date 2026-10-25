#!/usr/bin/env bash
# Composite GitHub Action entry point: upload one artifact or a manifest of
# captures, wait for the queued comparisons and, when a run key is set, close
# and gate the CI run. Kept as a script (not inline YAML) so it can be run
# locally against a test server.
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

MANIFEST="${INPUT_MANIFEST:-}"
MANIFEST_MODE=false
if [ -n "$MANIFEST" ]; then
  MANIFEST_MODE=true
else
  require "project" "${INPUT_PROJECT:-}"
  require "test" "${INPUT_TEST:-}"
  require "file" "${INPUT_FILE:-}"
  require "viewport" "${INPUT_VIEWPORT:-}"
  require "browser" "${INPUT_BROWSER:-}"
  require "environment" "${INPUT_ENVIRONMENT:-}"
fi

if [ "$MANIFEST_MODE" = false ]; then
  KIND="${INPUT_KIND:-image}"
  case "$KIND" in
    image | pdf) ;;
    *) fail "Input 'kind' must be 'image' or 'pdf' (got '$KIND')." ;;
  esac
  [ -f "$INPUT_FILE" ] || fail "File '$INPUT_FILE' does not exist."
fi

command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v jq >/dev/null 2>&1 || fail "jq is required."

API_URL="${INPUT_API_URL%/}"
WAIT_SECONDS="${INPUT_WAIT_SECONDS:-30}"
FAIL_ON_PENDING="${INPUT_FAIL_ON_PENDING:-true}"
FINISH_RUN="${INPUT_FINISH_RUN:-true}"
CONCURRENCY="${INPUT_CONCURRENCY:-4}"
RUN_KEY="${INPUT_RUN_KEY:-}"
COMMIT="${INPUT_COMMIT:-}"
COMMIT_MESSAGE="${INPUT_COMMIT_MESSAGE:-}"
CI_URL="${INPUT_CI_URL:-}"
REPORT_PATH="${INPUT_REPORT_PATH:-}"
BRANCH="${INPUT_BRANCH:-}"
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
case "$CONCURRENCY" in
  '' | *[!0-9]*) fail "Input 'concurrency' must be an integer between 1 and 16." ;;
esac
if [ "$CONCURRENCY" -lt 1 ] || [ "$CONCURRENCY" -gt 16 ]; then
  fail "Input 'concurrency' must be an integer between 1 and 16 (got '$CONCURRENCY')."
fi

uri() { jq -rn --arg value "$1" '$value|@uri'; }

PROJECT=""
PROJECT_URI=""
TEST_URI=""
BRANCH_URI=""
RUN_URI=""
RUN_LINK=""
CAPTURE_COUNT=0
UPLOAD_OK=0
UPLOAD_FAILED=0
CAP_PROJECT=()
CAP_TEST=()
CAP_FILE=()
CAP_KIND=()
CAP_VIEWPORT=()
CAP_BROWSER=()
CAP_ENVIRONMENT=()
FAILURES=()
BATCH_PIDS=()
UPLOAD_ARGS=()
TMP_DIR=""
JOB_ERROR=""
run_response=""
run_state=""
run_pending=0
run_pending_jobs=0
run_failed=0
run_approved=0
run_tests=0

cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

write_summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] || return 0
  {
    printf "### Visual regression run \`%s\`\n\n" "$RUN_KEY"
    printf "| Field | Value |\n"
    printf "| --- | --- |\n"
    printf "| Run | [\`%s\`](%s) |\n" "$RUN_KEY" "$RUN_LINK"
    if [ "$MANIFEST_MODE" = true ]; then
      printf "| Captures | %s |\n" "$CAPTURE_COUNT"
      printf "| Uploaded | %s |\n" "$UPLOAD_OK"
      printf "| Upload failures | %s |\n" "$UPLOAD_FAILED"
    fi
    if [ -n "$run_state" ]; then
      printf "| State | \`%s\` |\n" "$run_state"
      printf "| Pending comparisons | %s (%s muted) |\n" "$run_pending" "$run_muted"
      printf "| Pending jobs | %s |\n" "$run_pending_jobs"
      printf "| Failed jobs | %s |\n" "$run_failed"
      printf "| Approved | %s |\n" "$run_approved"
      printf "| Tests | %s |\n" "$run_tests"
    fi
    if [ -n "$COMMIT" ]; then
      printf "| Commit | \`%s\` |\n" "$COMMIT"
    fi
    if [ -n "$BRANCH" ]; then
      printf "| Branch | \`%s\` |\n" "$BRANCH"
    fi
    if [ "${#FAILURES[@]}" -gt 0 ]; then
      printf "\n**Upload failures**\n\n"
      local failure shown=0
      for failure in "${FAILURES[@]}"; do
        if [ "$shown" -ge 10 ]; then
          break
        fi
        printf '%s\n' "- $failure"
        shown=$((shown + 1))
      done
      if [ "${#FAILURES[@]}" -gt "$shown" ]; then
        printf '%s\n' "- ... and $((${#FAILURES[@]} - shown)) more"
      fi
      printf "\nThe run was not finished; its status was not evaluated.\n"
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
  run_muted=$(jq -r '.status.mutedPending // 0' <<<"$response") ||
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
  if [ -n "$BRANCH" ]; then
    args+=(--data-urlencode "branch=$BRANCH")
  fi
  if ! response=$(curl "${args[@]}"); then
    printf '%s\n' "$response" >&2
    fail "Run status request failed."
  fi
  printf '%s\n' "$response"
}

write_run_report() {
  local url
  [ -n "$REPORT_PATH" ] || return 0
  url="$API_URL/api/v1/projects/$PROJECT_URI/runs/$RUN_URI/report/junit"
  if [ -n "$BRANCH_URI" ]; then
    url="$url?branch=$BRANCH_URI"
  fi
  mkdir -p "$(dirname "$REPORT_PATH")"
  if curl --silent --show-error --fail-with-body --get "$url" \
    --header "x-api-key: $INPUT_API_KEY" \
    --output "$REPORT_PATH"; then
    echo "::notice::JUnit report written to $REPORT_PATH"
  else
    echo "::warning::Could not download the JUnit report to $REPORT_PATH"
  fi
}

# Run mode: close the run (unless finish-run is false) and gate the step on its
# derived state instead of on the single comparison that was just uploaded.
run_gate() {
  local finish_url finish_response
  local remaining poll_sleep
  local -a finish_args

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
  write_run_report

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
          fail "Run '$RUN_KEY' has ${run_pending} comparison(s) awaiting review (${run_muted} muted) and ${run_pending_jobs} job(s) still running. Review: $RUN_LINK"
        fi
        fail "Run '$RUN_KEY' has ${run_pending} comparison(s) awaiting review (${run_muted} muted). Review: $RUN_LINK"
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

# One place that assembles the multipart upload request, shared by the single
# upload and every manifest capture.
build_upload_args() {
  local project=$1 test=$2 file=$3 kind=$4 viewport=$5 browser=$6 environment=$7
  UPLOAD_ARGS=(
    --silent --show-error --fail-with-body
    --request POST
    "$API_URL/api/v1/projects/$(uri "$project")/tests/$(uri "$test")/upload?testKind=$kind"
    --header "x-api-key: $INPUT_API_KEY"
    --form "file=@$file"
    --form "viewport=$viewport"
    --form "browser=$browser"
    --form "environment=$environment"
  )
  if [ -n "$BRANCH" ]; then
    UPLOAD_ARGS+=(--form "branch=$BRANCH")
  fi
  if [ -n "$RUN_KEY" ]; then
    UPLOAD_ARGS+=(
      --form "runKey=$RUN_KEY"
      --form "commitSha=$COMMIT"
      --form "commitMessage=$COMMIT_MESSAGE"
      --form "ciUrl=$CI_URL"
    )
  fi
}

is_retryable() {
  local rc=$1 code=$2
  case "$code" in
    429 | 5??) return 0 ;;
  esac
  if [ "$rc" -ne 0 ] && [ "$code" = "000" ]; then
    return 0
  fi
  return 1
}

retry_delay() {
  local dir=$1 attempt=$2 value=""
  if [ -f "$dir/headers" ]; then
    value=$(awk 'tolower($1) == "retry-after:" { print $2 }' "$dir/headers" 2>/dev/null | tr -d '\r' | tail -n 1) || value=""
  fi
  case "$value" in
    '' | *[!0-9]*) ;;
    *)
      printf '%s\n' "$value"
      return 0
      ;;
  esac
  case "$attempt" in
    1) printf '1\n' ;;
    *) printf '2\n' ;;
  esac
}

write_capture_error() {
  local dir=$1 attempts=$2 rc=$3 code=$4 message=""
  if [ -s "$dir/body" ]; then
    message=$(jq -r 'if (.message | type) == "array" then (.message | join("; ")) elif (.message | type) == "string" then .message else empty end' <"$dir/body" 2>/dev/null) || message=""
  fi
  if [ -z "$message" ] && [ -s "$dir/body" ]; then
    message=$(tr '\n' ' ' <"$dir/body" | cut -c1-240) || message=""
  fi
  if [ -z "$message" ] && [ -s "$dir/stderr" ]; then
    message=$(tr '\n' ' ' <"$dir/stderr" | cut -c1-240) || message=""
  fi
  if [ -z "$message" ]; then
    message="upload failed"
  fi
  if [ "$code" = "000" ]; then
    printf 'network error after %s attempt(s) (curl exit %s): %s\n' "$attempts" "$rc" "$message" >"$dir/error"
  else
    printf 'HTTP %s after %s attempt(s): %s\n' "$code" "$attempts" "$message" >"$dir/error"
  fi
}

# Uploads one manifest capture. Runs in a background subshell; the outcome is
# written to the capture directory so the parent can report it after wait.
upload_capture() {
  local index=$1 dir="$TMP_DIR/capture-$1"
  local attempt=1 max_attempts=3 rc=0 code="" delay=0 remaining=0
  local -a args

  mkdir -p "$dir"
  build_upload_args "${CAP_PROJECT[index]}" "${CAP_TEST[index]}" "${CAP_FILE[index]}" \
    "${CAP_KIND[index]}" "${CAP_VIEWPORT[index]}" "${CAP_BROWSER[index]}" "${CAP_ENVIRONMENT[index]}"
  args=("${UPLOAD_ARGS[@]}")

  while :; do
    rm -f "$dir/headers"
    : >"$dir/body"
    : >"$dir/stderr"
    code=""
    rc=0
    code=$(curl "${args[@]}" \
      --output "$dir/body" \
      --dump-header "$dir/headers" \
      --write-out '%{http_code}' 2>"$dir/stderr") || rc=$?
    case "$code" in
      '' | *[!0-9]*) code="000" ;;
    esac
    printf '%s\n' "$attempt" >"$dir/attempts"

    if [ "$rc" -eq 0 ] && [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
      : >"$dir/error"
      printf 'ok\n' >"$dir/outcome"
      return 0
    fi
    if [ "$attempt" -ge "$max_attempts" ] || ! is_retryable "$rc" "$code"; then
      write_capture_error "$dir" "$attempt" "$rc" "$code"
      printf 'failed\n' >"$dir/outcome"
      return 0
    fi

    remaining=$((DEADLINE - SECONDS))
    if [ "$remaining" -le 0 ]; then
      printf 'wait budget exhausted after %s attempt(s) (HTTP %s)\n' "$attempt" "$code" >"$dir/error"
      printf 'failed\n' >"$dir/outcome"
      return 0
    fi
    delay=$(retry_delay "$dir" "$attempt")
    if [ "$delay" -ge "$remaining" ]; then
      printf 'wait budget exhausted after %s attempt(s) (HTTP %s)\n' "$attempt" "$code" >"$dir/error"
      printf 'failed\n' >"$dir/outcome"
      return 0
    fi
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

load_manifest() {
  local value workspace p t f k v b e i n
  [ -f "$MANIFEST" ] || fail "Manifest '$MANIFEST' does not exist."
  jq -e . "$MANIFEST" >/dev/null 2>&1 ||
    fail "Manifest '$MANIFEST' is not valid JSON."
  jq -e 'type == "object"' "$MANIFEST" >/dev/null 2>&1 ||
    fail "Manifest '$MANIFEST' must be a JSON object."
  jq -e '(.captures | type == "array") and ((.captures | length) > 0)' "$MANIFEST" >/dev/null 2>&1 ||
    fail "Manifest '$MANIFEST' must contain a non-empty 'captures' array."

  value=$(jq -r '(.runKey // "") | tostring' "$MANIFEST")
  if [ -n "$value" ]; then
    RUN_KEY="$value"
  fi
  value=$(jq -r '(.branch // "") | tostring' "$MANIFEST")
  if [ -n "$value" ]; then
    BRANCH="$value"
  fi
  value=$(jq -r '(.commitSha // "") | tostring' "$MANIFEST")
  if [ -n "$value" ]; then
    COMMIT="$value"
  fi
  value=$(jq -r '(.commitMessage // "") | tostring' "$MANIFEST")
  if [ -n "$value" ]; then
    COMMIT_MESSAGE="$value"
  fi
  value=$(jq -r '(.ciUrl // "") | tostring' "$MANIFEST")
  if [ -n "$value" ]; then
    CI_URL="$value"
  fi

  [ -n "$RUN_KEY" ] ||
    fail "Input 'manifest' requires a run key: set 'run-key' or a top-level 'runKey' in the manifest."

  CAPTURE_COUNT=$(jq -r '.captures | length' "$MANIFEST")
  CAP_PROJECT=()
  CAP_TEST=()
  CAP_FILE=()
  CAP_KIND=()
  CAP_VIEWPORT=()
  CAP_BROWSER=()
  CAP_ENVIRONMENT=()

  while IFS= read -r -d '' p &&
    IFS= read -r -d '' t &&
    IFS= read -r -d '' f &&
    IFS= read -r -d '' k &&
    IFS= read -r -d '' v &&
    IFS= read -r -d '' b &&
    IFS= read -r -d '' e; do
    CAP_PROJECT+=("$p")
    CAP_TEST+=("$t")
    CAP_FILE+=("$f")
    CAP_KIND+=("$k")
    CAP_VIEWPORT+=("$v")
    CAP_BROWSER+=("$b")
    CAP_ENVIRONMENT+=("$e")
  done < <(jq -j '
    .captures[]
    | ( [ (.project // ""), (.test // ""), (.file // ""), (.kind // ""),
          (.viewport // ""), (.browser // ""), (.environment // "") ]
        | .[] | ., "\u0000" )
  ' "$MANIFEST")

  if [ "${#CAP_TEST[@]}" -ne "$CAPTURE_COUNT" ]; then
    fail "Manifest '$MANIFEST' could not be read: expected $CAPTURE_COUNT capture(s), read ${#CAP_TEST[@]}."
  fi

  workspace="${GITHUB_WORKSPACE:-$(pwd)}"
  i=0
  while [ "$i" -lt "$CAPTURE_COUNT" ]; do
    n=$((i + 1))
    value="${CAP_PROJECT[i]:-}"
    if [ -z "$value" ]; then
      value="$INPUT_PROJECT"
    fi
    [ -n "$value" ] || fail "Capture $n is missing 'project' and the 'project' input is not set."
    CAP_PROJECT[i]="$value"
    [ -n "${CAP_TEST[i]:-}" ] || fail "Capture $n is missing 'test'."
    [ -n "${CAP_FILE[i]:-}" ] || fail "Capture $n is missing 'file'."
    value="${CAP_KIND[i]:-}"
    if [ -z "$value" ]; then
      value="image"
    fi
    case "$value" in
      image | pdf) ;;
      *) fail "Capture $n has invalid 'kind' '$value' (expected image or pdf)." ;;
    esac
    CAP_KIND[i]="$value"
    [ -n "${CAP_VIEWPORT[i]:-}" ] || fail "Capture $n is missing 'viewport'."
    [ -n "${CAP_BROWSER[i]:-}" ] || fail "Capture $n is missing 'browser'."
    [ -n "${CAP_ENVIRONMENT[i]:-}" ] || fail "Capture $n is missing 'environment'."
    case "${CAP_FILE[i]}" in
      /*) ;;
      *) CAP_FILE[i]="$workspace/${CAP_FILE[i]}" ;;
    esac
    [ -f "${CAP_FILE[i]}" ] ||
      fail "Capture $n file '${CAP_FILE[i]}' does not exist."
    i=$((i + 1))
  done

  if [ -n "$INPUT_PROJECT" ]; then
    PROJECT="$INPUT_PROJECT"
  else
    PROJECT="${CAP_PROJECT[0]}"
  fi
  i=0
  while [ "$i" -lt "$CAPTURE_COUNT" ]; do
    if [ "${CAP_PROJECT[i]}" != "$PROJECT" ]; then
      fail "Capture $((i + 1)) targets project '${CAP_PROJECT[i]}' but the run belongs to project '$PROJECT'. A run is per project; keep one project per manifest."
    fi
    i=$((i + 1))
  done
}

compute_run_urls() {
  RUN_URI=""
  RUN_LINK=""
  if [ -n "$RUN_KEY" ]; then
    RUN_URI=$(uri "$RUN_KEY")
    RUN_LINK="$API_URL/projects/$PROJECT_URI/runs/$RUN_URI"
    if [ -n "$BRANCH_URI" ]; then
      RUN_LINK="$RUN_LINK?branch=$BRANCH_URI"
    fi
  fi
}

run_manifest_mode() {
  local i=0 dir outcome reason failure detail shown=0

  DEADLINE=$((SECONDS + WAIT_SECONDS))
  TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/vrt-action.XXXXXX") ||
    fail "Could not create a temporary directory."

  while [ "$i" -lt "$CAPTURE_COUNT" ]; do
    while [ "${#BATCH_PIDS[@]}" -ge "$CONCURRENCY" ]; do
      wait "${BATCH_PIDS[0]}" || true
      BATCH_PIDS=("${BATCH_PIDS[@]:1}")
    done
    if [ "$SECONDS" -ge "$DEADLINE" ]; then
      while [ "$i" -lt "$CAPTURE_COUNT" ]; do
        dir="$TMP_DIR/capture-$i"
        mkdir -p "$dir"
        printf 'wait budget exhausted before upload\n' >"$dir/error"
        printf 'failed\n' >"$dir/outcome"
        i=$((i + 1))
      done
      break
    fi
    upload_capture "$i" &
    BATCH_PIDS+=("$!")
    i=$((i + 1))
  done

  i=0
  while [ "$i" -lt "${#BATCH_PIDS[@]}" ]; do
    wait "${BATCH_PIDS[i]}" || true
    i=$((i + 1))
  done

  UPLOAD_OK=0
  UPLOAD_FAILED=0
  FAILURES=()
  i=0
  while [ "$i" -lt "$CAPTURE_COUNT" ]; do
    dir="$TMP_DIR/capture-$i"
    outcome=""
    if [ -f "$dir/outcome" ]; then
      outcome=$(cat "$dir/outcome")
    fi
    if [ "$outcome" = "ok" ]; then
      UPLOAD_OK=$((UPLOAD_OK + 1))
    else
      UPLOAD_FAILED=$((UPLOAD_FAILED + 1))
      reason=""
      if [ -f "$dir/error" ]; then
        reason=$(tr '\n' ' ' <"$dir/error" | cut -c1-300 | sed 's/[[:space:]]*$//') || reason=""
      fi
      if [ -z "$reason" ]; then
        reason="upload failed"
      fi
      FAILURES+=("capture $((i + 1)) (${CAP_TEST[i]}): $reason")
    fi
    i=$((i + 1))
  done

  set_output upload-count "$UPLOAD_OK"
  set_output upload-failed-count "$UPLOAD_FAILED"

  if [ "$UPLOAD_FAILED" -gt 0 ]; then
    set_output status "batch_failed"
    write_summary
    detail=""
    shown=0
    for failure in "${FAILURES[@]}"; do
      if [ "$shown" -ge 3 ]; then
        break
      fi
      if [ -z "$detail" ]; then
        detail="$failure"
      else
        detail="$detail; $failure"
      fi
      shown=$((shown + 1))
    done
    if [ "$UPLOAD_FAILED" -gt "$shown" ]; then
      detail="$detail; and $((UPLOAD_FAILED - shown)) more"
    fi
    fail "$UPLOAD_FAILED of $CAPTURE_COUNT capture(s) failed to upload: $detail. The run was not finished. Run: $RUN_LINK"
  fi

  set_output status "batch_completed"
  echo "::notice::Uploaded $UPLOAD_OK of $CAPTURE_COUNT capture(s) into run '$RUN_KEY'."
  run_gate
}

if [ "$MANIFEST_MODE" = true ]; then
  load_manifest
else
  PROJECT="$INPUT_PROJECT"
  TEST_URI=$(uri "$INPUT_TEST")
fi

if [ -n "$BRANCH" ]; then
  BRANCH_URI=$(uri "$BRANCH")
fi
PROJECT_URI=$(uri "$PROJECT")
compute_run_urls
if [ -n "$RUN_KEY" ]; then
  set_output run-key "$RUN_KEY"
fi

if [ "$MANIFEST_MODE" = true ]; then
  run_manifest_mode
  exit 0
fi

build_upload_args "$INPUT_PROJECT" "$INPUT_TEST" "$INPUT_FILE" "$KIND" "$INPUT_VIEWPORT" "$INPUT_BROWSER" "$INPUT_ENVIRONMENT"

if ! upload_response=$(curl "${UPLOAD_ARGS[@]}"); then
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
      if [ -n "$BRANCH" ]; then
        job_args+=(--data-urlencode "branch=$BRANCH")
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

#!/usr/bin/env bash
# The local gate: the same checks the CI workflows run, executable in one
# command. It exists because the GitHub workflows may be switched off, and a
# branch that nothing verifies is only as good as the last manual check.
#
#   ./scripts/verify.sh             # full local gate, no Docker (~3 min)
#   ./scripts/verify.sh --fast      # backend only, skips frontend + SDK drift (~1 min)
#   ./scripts/verify.sh --with-e2e  # also the backend e2e suite (starts Docker, ~2 min more)
#
# Wired into .husky/pre-push, so a normal `git push` runs it. Skip deliberately
# with `git push --no-verify`.
#
# Environment: pnpm 10+ on PATH, Node >= 24.15 (see engines in package.json).
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

FAST=0
WITH_E2E=0
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1 ;;
    --with-e2e) WITH_E2E=1 ;;
    -h | --help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf '\033[0;31mUnknown option: %s\033[0m\n' "$arg" >&2
      exit 2
      ;;
  esac
done

STEP=""
STEP_START=0
TOTAL_START=$SECONDS

step() {
  STEP="$1"
  STEP_START=$SECONDS
  printf '\n\033[1;36m==> %s\033[0m\n' "$STEP"
}

ok() {
  printf '\033[0;32m✓ %s (%ss)\033[0m\n' "$STEP" "$((SECONDS - STEP_START))"
}

run() {
  if ! "$@"; then
    printf '\n\033[0;31m✗ %s failed\033[0m\n' "$STEP" >&2
    printf '\033[0;33m  re-run it directly: %s\033[0m\n' "$*" >&2
    exit 1
  fi
  ok
}

# A drift check compares the working-tree state of the generated artifacts
# before and after regeneration. Comparing content against HEAD instead would
# fail for a developer who already staged the regenerated files.
generated_state() {
  {
    git diff HEAD -- backend/swagger.json client-sdk
    git ls-files --others --exclude-standard -- backend/swagger.json client-sdk
  } 2>/dev/null || true
}

verify_sdk_drift() {
  local before after
  before="$(generated_state)"
  if ! ./scripts/sdk-generate.sh >/tmp/verify-sdk-generate.log 2>&1; then
    printf '\n\033[0;31mSDK generation failed, see /tmp/verify-sdk-generate.log\033[0m\n' >&2
    return 1
  fi
  after="$(generated_state)"
  if [ "$before" != "$after" ]; then
    printf '\n\033[0;31mThe generated SDK is out of date.\033[0m\n' >&2
    printf 'Commit the regenerated backend/swagger.json and client-sdk/ (they were just updated).\n' >&2
    return 1
  fi
}

step "Lint (backend + frontend)"
run pnpm run lint:check:all

step "Typecheck (backend, backend:test, frontend)"
run pnpm run typecheck:all

step "Format check"
run pnpm run format:check

step "Backend unit tests"
run pnpm run unitTest

if [ "$FAST" -eq 0 ]; then
  step "Frontend unit tests"
  run pnpm --filter ./frontend test -- --run

  step "SDK drift (OpenAPI -> client-sdk)"
  run verify_sdk_drift
fi

if [ "$WITH_E2E" -eq 1 ]; then
  step "Backend e2e tests"
  run pnpm run e2eTest
fi

printf '\n\033[0;32mAll checks passed in %ss.\033[0m\n' "$((SECONDS - TOTAL_START))"
if [ "$FAST" -eq 1 ]; then
  printf '\033[0;33m(--fast skipped the frontend suite and the SDK drift check; the pre-push hook runs the full gate.)\033[0m\n'
fi

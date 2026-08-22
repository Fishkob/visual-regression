#!/usr/bin/env bash
# Regenerates the client SDK when files that shape the OpenAPI contract changed.
# Runs as part of the pre-commit hook (see .husky/pre-commit). Skips when no
# SDK-relevant file is staged, so backend-only commits that don't touch the
# API surface don't pay the generation cost.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Paths whose changes can alter the generated SDK. The swagger.json is built
# from the whole backend module tree, so any backend src change is relevant;
# schema.prisma feeds enum values into DTOs and openapi-ts.config.ts shapes the
# generator output.
RELEVANT_PATTERNS=(
  'backend/src/'
  'backend/prisma/schema.prisma'
  'openapi-ts.config.ts'
)

changed_files="$(git diff --cached --name-only --diff-filter=ACMR)"

needs_generation=false
for pattern in "${RELEVANT_PATTERNS[@]}"; do
  if echo "$changed_files" | grep -qE "^${pattern}"; then
    needs_generation=true
    break
  fi
done

if [ "$needs_generation" = false ]; then
  exit 0
fi

echo "SDK-relevant files changed — regenerating client SDK..."

if ! pnpm run sdk:generate; then
  echo "error: sdk:generate failed. Commit aborted — resolve the failure or " \
    "commit without SDK-relevant changes." >&2
  exit 1
fi

# Stage only the generated surface — never hand-written files (AGENTS.md,
# package.json, tsconfig, src/__tests__).
git add backend/swagger.json
git add client-sdk/index.ts client-sdk/sdk.gen.ts client-sdk/types.gen.ts \
  client-sdk/client.gen.ts client-sdk/client client-sdk/core client-sdk/models

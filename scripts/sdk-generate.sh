#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-vrt}"

export POSTGRES_HOST POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB

pnpm --filter ./backend prisma:generate

cd "$PROJECT_ROOT/backend"
TS_NODE_PROJECT=tsconfig.swagger.json node -r ts-node/register -r tsconfig-paths/register src/scripts/swagger-export.ts

cd "$PROJECT_ROOT"

# Clean generated files without removing hand-written config files
rm -rf client-sdk/models client-sdk/client
rm -f client-sdk/index.ts client-sdk/sdk.gen.ts client-sdk/types.gen.ts

node --input-type=module -e "
import { createClient } from '@hey-api/openapi-ts';
import('./openapi-ts.config.ts').then(c => createClient(c.default));
"

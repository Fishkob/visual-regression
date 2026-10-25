# AGENTS.md — Client SDK

## Nature

Fully auto-generated TypeScript SDK. **Never manually edit `.gen.ts` files.**

## Generation Pipeline

```
Prisma schema → NestJS Swagger decorators → swagger.json → @hey-api/openapi-ts → client-sdk/
```

Trigger: `pnpm run sdk:generate` (runs `scripts/sdk-generate.sh`)

The pre-commit hook auto-regenerates this package when files under `backend/src/`, `backend/prisma/schema.prisma`, or `openapi-ts.config.ts` are staged (`scripts/sdk-generate-if-needed.sh`), so the committed SDK tracks the API surface without manual steps.

## Directory Structure

```
client-sdk/
  index.ts              # Barrel: re-exports all types + SDK functions + enums (generated)
  sdk.gen.ts            # Typed SDK functions (one per endpoint)
  types.gen.ts          # JavaScript enums
  client/               # Generated HTTP client (fetch-based, zero deps)
  core/                 # Runtime utilities (serializers, auth, SSE)
  models/               # One file per DTO
  src/                 # Manual helpers: upload-many.ts, playwright-reporter.ts
  src/__tests__/        # Manual tests (smoke, upload-many, playwright-reporter)
  dist/                 # tsc output for external consumers
```

## Key Facts

- **Zero runtime dependencies** — uses `globalThis.fetch`
- For local dev, frontend resolves raw `.ts` source via path alias `@sdk` (no build needed)
- Build via `pnpm run sdk:build` → `tsc` → `dist/`
- Tests via `pnpm test` (vitest)

## Conventions

- Generated files have `.gen.ts` suffix — never edit these
- Only manual files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, `src/upload-many.ts`, `src/playwright-reporter.ts`, and the specs under `src/__tests__/`
- Manual helpers are exposed as subpath exports: `client-sdk/upload-many`, `client-sdk/playwright`
- Frontend wraps SDK responses with `getData()` helper (unwraps `{ data, error }` shape)
- Regenerate whenever Prisma schema or controller DTOs change

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
  src/                  # Manual helpers: upload-many.ts, playwright-reporter.ts
  src/__tests__/        # Manual tests (smoke, upload-many, playwright-reporter)
  scripts/              # Build step: fix-esm-specifiers.mjs
  tsconfig.build.json   # Publish build: excludes tests, disables maps
  dist/                 # tsc output for external consumers (gitignored)
```

## Key Facts

- **Zero runtime dependencies** — uses `globalThis.fetch`
- Package identity: `@fishkob/vrt`, ESM only, Node >= 20
- For local dev, frontend and the browser suites resolve raw `.ts` source via the path alias `@sdk` (no build needed). The alias points at `index.ts`, **not** at the package root: `exports` resolve to `dist/`, which is not built for dev.
- Build via `pnpm run sdk:build` → `tsc -p tsconfig.build.json` + `scripts/fix-esm-specifiers.mjs` → `dist/`
- Package the release artifact via `pnpm run sdk:pack` (`scripts/check-client-sdk-package.sh`)
- Tests via `pnpm test` (vitest); `scripts/verify.sh` runs the packaging check

## Distribution

The package is **published to npm** as `@fishkob/vrt` by `.github/workflows/release-client-sdk.yml`. It has its own release line: release-please owns this directory as the `client-sdk` package (version in `package.json`, `client-sdk/CHANGELOG.md`, tag `vrt-client-vX.Y.Z`), and a platform release does not republish it. The workflow publishes the tarball `scripts/check-client-sdk-package.sh` produced — not a rebuild, because `npm version`/`npm publish` in this workspace make npm rebuild the lockfile over pnpm's symlinks and arborist's dedupe crashes — and takes the version from the tagged `package.json`, never from the tag. The release page carries the notes only: npm is the artifact store, and an offline install packs the published package ([ADR-073](../docs/adr/ADR-073-release-assets-and-immutable-releases.md)). `publishConfig.access` is `public`; `prepack` copies the root `LICENSE` into the package for a manual `npm pack` (`postpack` removes it, and `.gitignore` keeps it out of the tree). Provenance is opted out because npm only attests public source repositories. Decision and rationale: [ADR-069](../docs/adr/ADR-069-independent-client-version.md); [ADR-068](../docs/adr/ADR-068-client-sdk-on-npm.md) and [ADR-056](../docs/adr/ADR-056-client-sdk-distribution.md) are superseded in part.

## Build Rules

- `tsc` does not rewrite import specifiers, and the generator emits them extensionless (`./sdk.gen`, `./client`). Node's ESM resolver infers neither extensions nor a directory `index.js`, so `scripts/fix-esm-specifiers.mjs` rewrites every relative specifier in `dist/` as the last build step. It fails the build on a specifier it cannot resolve — never "fix" a failure by loosening it.
- `tsconfig.build.json` sets `types: ["node"]` explicitly. The `exclude` list turns implicit `@types` loading off, so without it the build loses `node:` and `Buffer` types.
- Public types must not name Node globals (`Buffer`, `NodeJS.*`): a consumer type-checking with `lib: dom` fails on them. Use `Uint8Array` and structural interfaces, as `PlaywrightAttachment` does.
- Anything added to `exports` must be exercised by `scripts/check-client-sdk-package.sh` (import in Node ESM + consumer type check).

## Conventions

- Generated files have `.gen.ts` suffix — never edit these
- Only manual files: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `README.md`, `src/upload-many.ts`, `src/playwright-reporter.ts`, `scripts/fix-esm-specifiers.mjs`, and the specs under `src/__tests__/`
- Manual helpers are exposed as subpath exports: `@fishkob/vrt/upload-many`, `@fishkob/vrt/playwright`, `@fishkob/vrt/client`
- Frontend wraps SDK responses with `getData()` helper (unwraps `{ data, error }` shape)
- Regenerate whenever Prisma schema or controller DTOs change

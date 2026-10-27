# ADR 005: OpenAPI-generated Client SDK

## Status

Accepted

Amended 2026-10-27: documented how the spec is produced without a database, what enforces SDK synchrony, and which of the three version numbers means what.

## Date

2026-04-12

## Context

The client SDK must stay in sync with the backend. Manually written SDKs are error-prone and become outdated quickly.

## Decision

We generate the client SDK automatically from the backend's OpenAPI specification.

## Rationale

### Advantages

- **Single Source of Truth**: The OpenAPI spec is the source of truth — the SDK is generated from it
- **Sync**: API changes automatically lead to SDK changes
- **Type Safety**: Fully typed request/response models
- **Time Savings**: No manual SDK maintenance required
- **Documentation**: The OpenAPI spec can be used for API docs

### Disadvantages

- **Generator Quality**: Not all OpenAPI generators produce optimal clients
- **Customizations**: Harder to accommodate special features
- **Build Step**: Generation must be integrated into CI/CD

### Alternatives Considered

- **Manual SDK**: High maintenance overhead, sync issues
- **GraphQL**: Different architecture, not suitable for this project
- **gRPC**: Not needed for this project, adds unnecessary complexity

## Consequences

- Backend exposes OpenAPI spec at `/docs-json` (Swagger UI at `/docs`). The global prefix `api/v1` does not apply to Swagger by default.
- `backend/swagger.json` is a committed artifact and the generator's input: `openapi-ts.config.ts` reads it, so generation never needs a running API.
- The spec itself is produced by `backend/src/scripts/swagger-export.ts`, which boots `SwaggerAppModule` through `Test.createTestingModule()` and overrides the providers that would touch a database or the network (repositories, `PrismaConnection`, `PrismaUnitOfWork`, the job queue, `STORAGE_PROVIDER`, the auth services) — so the document is generated without Postgres, RustFS, or the pdf-sidecar.
- Synchrony is enforced twice: the pre-commit hook runs `scripts/sdk-generate-if-needed.sh` (regenerates `backend/swagger.json` + `client-sdk/` and re-stages them when `backend/src/`, `backend/prisma/schema.prisma`, or `openapi-ts.config.ts` are staged), and the `sdk-sync-check` workflow regenerates and fails the build on a diff.
- SDK package is regenerated on changes
- Client imports typed methods instead of manual HTTP calls
- Three version numbers must be kept apart: the spec version (`1.0`, set in the `DocumentBuilder` in `main.ts` and in `swagger-export.ts`, hence baked into the committed `swagger.json`), the URL prefix `api/v1` (`setGlobalPrefix`, also the spec's single server URL), and the SDK package version — `client-sdk` is an unversioned workspace package (`client-sdk/package.json` declares no `version`), consumed as source

# ADR 005: OpenAPI-generated Client SDK

## Status

Accepted

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
- SDK package is regenerated on changes
- Client imports typed methods instead of manual HTTP calls
- API version is manifested in the SDK

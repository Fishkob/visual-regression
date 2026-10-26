# Architecture Decision Records

This directory documents the key architectural decisions for the Visual Regression Platform.

## Index

| ADR | Title                                                                           | Status            |
| --- | ------------------------------------------------------------------------------- | ----------------- |
| 001 | [Technology Stack](./001-technology-stack.md)                                   | Accepted          |
| 002 | [Database Layer](./002-database-layer.md)                                       | Accepted          |
| 004 | [Infrastructure Patterns](./004-infrastructure-patterns.md)                     | Accepted          |
| 005 | [OpenAPI-generated Client SDK](./005-openapi-sdk.md)                            | Accepted          |
| 009 | [Frontend Architecture](./009-frontend-architecture.md)                         | Accepted          |
| 013 | [Backend Structure](./013-backend-structure.md)                                 | Accepted          |
| 016 | [Pixelmatch Comparison Engine](./016-pixelmatch-comparison-engine.md)           | Accepted          |
| 017 | [Backend Module Consolidation](./017-backend-module-consolidation.md)           | Superseded by 013 |
| 020 | [Testing Strategy](./020-testing-strategy.md)                                   | Accepted          |
| 022 | [Observability Stack](./022-observability-stack.md)                             | Accepted          |
| 023 | [No Reject Endpoint](./023-no-reject-endpoint.md)                               | Accepted          |
| 024 | [Database Migrations](./024-database-migrations.md)                             | Accepted          |
| 025 | [Authentication](./025-authentication.md)                                       | Accepted          |
| 026 | [Rate-Limit Unification](./026-rate-limit-unification.md)                       | Accepted          |
| 027 | [Branch-Scoped Baselines](./ADR-027-branch-scoped-baselines.md)                 | Accepted          |
| 028 | [Baseline Revisions](./ADR-028-baseline-revisions.md)                           | Accepted          |
| 029 | [Webhook Delivery](./ADR-029-webhook-delivery.md)                               | Accepted          |
| 030 | [Run Grouping](./ADR-030-run-grouping.md)                                       | Accepted          |
| 031 | [Users, Roles & Permissions](./ADR-031-users-roles-permissions.md)              | Accepted          |
| 032 | [Image Formats & Size Policy](./ADR-032-image-formats.md)                       | Accepted          |
| 033 | [Comparison Outcome History](./ADR-033-comparison-outcome-history.md)           | Accepted          |
| 034 | [Auth Hardening](./ADR-034-auth-hardening.md)                                   | Accepted          |
| 035 | [API Key Scopes](./ADR-035-api-key-scopes.md)                                   | Accepted          |
| 036 | [Test Lifecycle](./ADR-036-test-lifecycle.md)                                   | Accepted          |
| 037 | [Internationalization](./ADR-037-i18n.md)                                       | Accepted          |
| 038 | [Share Links](./ADR-038-share-links.md)                                         | Accepted          |
| 039 | [Review Assignment, SLA & 4-Eyes](./ADR-039-review-assignment-four-eyes.md)     | Accepted          |
| 040 | [Review Comments & Reasons](./ADR-040-review-comments-reasons.md)               | Accepted          |
| 041 | [Review Governance & Human 4-Eyes](./ADR-041-review-governance-human-4-eyes.md) | Accepted          |
| 042 | [Review Artifact Lifecycle](./ADR-042-review-artifact-lifecycle.md)             | Accepted          |
| 043 | [Storage Quota Enforcement](./ADR-043-storage-quota-enforcement.md)             | Accepted          |
| 044 | [A Failed Job Owns Its Candidate](./ADR-044-failed-job-candidate-ownership.md)  | Accepted          |
| 045 | [API-Key Scopes on the Route](./ADR-045-api-key-scopes-on-the-route.md)         | Accepted          |

## Numbering

ADR numbers reflect the order of original creation. Gaps exist because superseded ADRs are removed after consolidation:

| Missing # | Original subject                   | Fate                                |
| --------- | ---------------------------------- | ----------------------------------- |
| 003       | (unknown)                          | Superseded — content in ADR-013     |
| 006       | Comparison processing architecture | Superseded — content in ADR-004     |
| 007       | VisualTest module split            | Superseded — content in ADR-013/017 |
| 008       | Repository ports                   | Superseded — content in ADR-013/017 |
| 010       | Frontend decision                  | Superseded — content in ADR-009     |
| 011       | Frontend decision                  | Superseded — content in ADR-009     |
| 012       | Public/internal boundary           | Superseded — content in ADR-013/017 |
| 014       | In-Process Event Bus               | Superseded — content in ADR-004     |
| 015       | Transactional Unit of Work         | Superseded — content in ADR-002     |
| 018       | NestJS Framework                   | Consolidated into ADR-001           |
| 019       | Frontend Stack                     | Consolidated into ADR-001           |
| 021       | Prisma Connection Split            | Superseded — content in ADR-002     |

## Principles

- ADRs document decisions that are **hard to reverse**, **surprising without context**, or the **result of a real trade-off**
- Superseded ADRs are replaced by a placeholder file explaining where the content moved
- The `docs/adr/` directory contains only active or superseded ADRs — deleted files are tracked in git history

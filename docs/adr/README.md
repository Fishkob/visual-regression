# Architecture Decision Records

This directory documents the key architectural decisions for the Visual Regression Platform.

## Index

| ADR | Title                                                                                  | Status                                               |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 001 | [Technology Stack](./001-technology-stack.md)                                          | Accepted                                             |
| 002 | [Database Layer](./002-database-layer.md)                                              | Accepted                                             |
| 004 | [Infrastructure Patterns](./004-infrastructure-patterns.md)                            | Accepted                                             |
| 005 | [OpenAPI-generated Client SDK](./005-openapi-sdk.md)                                   | Accepted                                             |
| 009 | [Frontend Architecture](./009-frontend-architecture.md)                                | Accepted                                             |
| 013 | [Backend Structure](./013-backend-structure.md)                                        | Accepted                                             |
| 016 | [Pixelmatch Comparison Engine](./016-pixelmatch-comparison-engine.md)                  | Accepted                                             |
| 017 | [Backend Module Consolidation](./017-backend-module-consolidation.md)                  | Superseded by 013                                    |
| 020 | [Testing Strategy](./020-testing-strategy.md)                                          | Accepted                                             |
| 022 | [Observability Stack](./022-observability-stack.md)                                    | Accepted                                             |
| 023 | [No Reject Endpoint](./023-no-reject-endpoint.md)                                      | Accepted                                             |
| 024 | [Database Migrations](./024-database-migrations.md)                                    | Accepted                                             |
| 025 | [Authentication](./025-authentication.md)                                              | Accepted (delete rule superseded by 047)             |
| 026 | [Rate-Limit Unification](./026-rate-limit-unification.md)                              | Accepted                                             |
| 027 | [Branch-Scoped Baselines](./ADR-027-branch-scoped-baselines.md)                        | Accepted                                             |
| 028 | [Baseline Revisions](./ADR-028-baseline-revisions.md)                                  | Accepted                                             |
| 029 | [Webhook Delivery](./ADR-029-webhook-delivery.md)                                      | Accepted                                             |
| 030 | [Run Grouping](./ADR-030-run-grouping.md)                                              | Accepted                                             |
| 031 | [Users, Roles & Permissions](./ADR-031-users-roles-permissions.md)                     | Accepted                                             |
| 032 | [Image Formats & Size Policy](./ADR-032-image-formats.md)                              | Accepted                                             |
| 033 | [Comparison Outcome History](./ADR-033-comparison-outcome-history.md)                  | Accepted (project attribution superseded by 049)     |
| 034 | [Auth Hardening](./ADR-034-auth-hardening.md)                                          | Accepted                                             |
| 035 | [API Key Scopes](./ADR-035-api-key-scopes.md)                                          | Accepted (enforcement superseded by 045)             |
| 036 | [Test Lifecycle](./ADR-036-test-lifecycle.md)                                          | Accepted                                             |
| 037 | [Internationalization](./ADR-037-i18n.md)                                              | Accepted                                             |
| 038 | [Share Links](./ADR-038-share-links.md)                                                | Accepted                                             |
| 039 | [Review Assignment, Due Dates & 4-Eyes](./ADR-039-review-assignment-four-eyes.md)      | Accepted (partially superseded by 041)               |
| 040 | [Review Comments & Reasons](./ADR-040-review-comments-reasons.md)                      | Accepted                                             |
| 041 | [Review Governance & Human 4-Eyes](./ADR-041-review-governance-human-4-eyes.md)        | Accepted                                             |
| 042 | [Review Artifact Lifecycle & Webhook Lease](./ADR-042-review-artifact-lifecycle.md)    | Accepted (artifacts superseded by 050, lease by 051) |
| 043 | [Storage Quota Enforcement](./ADR-043-storage-quota-enforcement.md)                    | Accepted                                             |
| 044 | [A Failed Job Owns Its Candidate](./ADR-044-failed-job-candidate-ownership.md)         | Accepted                                             |
| 045 | [API-Key Scopes on the Route](./ADR-045-api-key-scopes-on-the-route.md)                | Accepted (partially supersedes 035)                  |
| 046 | [PDF Comparison Runs in a Java Sidecar](./ADR-046-pdf-comparison-sidecar.md)           | Accepted                                             |
| 047 | [Delete Removes an API Key, Used or Not](./ADR-047-delete-removes-an-api-key.md)       | Accepted (partially supersedes 025)                  |
| 048 | [Changed Regions Come From the Worker](./ADR-048-changed-regions.md)                   | Accepted                                             |
| 049 | [Outcome Rows Carry Their Project Name](./ADR-049-outcome-project-attribution.md)      | Accepted (partially supersedes 033)                  |
| 050 | [Approval Votes Are Audit and Outlive the Test](./ADR-050-approval-votes-are-audit.md) | Accepted (partially supersedes 042)                  |
| 051 | [A Lost Webhook Lease Consumes an Attempt](./ADR-051-lease-expiry-consumes-a-retry.md) | Accepted (partially supersedes 042)                  |
| 052 | [PDF Pages Have a Pixel Budget](./ADR-052-pdf-page-pixel-budget.md)                    | Accepted (complements 046)                           |
| 053 | [Sessions Have an Absolute Lifetime](./ADR-053-session-absolute-lifetime.md)           | Accepted (complements 034)                           |

## Numbering

ADR numbers reflect the order of original creation. Gaps were created before the freeze, when consolidated ADRs were deleted (the table below records them); numbering is now append-only. File names keep the spelling they were created with (`001-…` for the consolidated early ADRs, `ADR-0NN-…` afterwards); the number, not the prefix, is the identity. `R8`/`R9`/`R19`-style references in the ADRs are the roadmap rounds in [`docs/roadmap.md`](../roadmap.md).

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
- An accepted ADR is frozen: a changed decision becomes a new ADR that supersedes it, and the old text stays as written (the rules live in [CONTRIBUTING.md](../../CONTRIBUTING.md#architecture-decision-records))
- A superseded ADR keeps a file that points at its successor (for example [017](./017-backend-module-consolidation.md)); nothing under `docs/adr/` is deleted
- The removal table above records what happened before the freeze; it does not grow. ADRs written earlier still carry dated amendment notes and merged subjects — treat that as history, not as a template

# ADR 017: Backend Module Architecture (Consolidated)

## Status

Superseded — 2026-07-25

Superseded by: [ADR-013 (Backend Structure)](./013-backend-structure.md)

## History

ADR-017 was created on 2026-05-23 to consolidate three interdependent decisions:

- **ADR-007**: VisualTest module split into intake/review/core
- **ADR-008**: Repository ports with injection tokens
- **ADR-012**: Public/internal module boundary

On 2026-06-13, ADR-013 was updated to absorb ADR-017's content and extend it with:

- Removal of repository ports (class-token injection instead)
- Rename of `shared/` → `core/`
- Worker/API process separation details
- Explicit dependency graph with no `forwardRef()`

All content from this ADR now lives in ADR-013. This placeholder exists to resolve the supersession chain referenced in other ADRs.

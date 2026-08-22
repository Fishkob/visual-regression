# ADR 009: Frontend Architecture — State, Routing, and Layered Structure

## Status

Accepted — 2026-05-23 (all original decisions); Amended 2026-06-12 (services/ layer collapsed into composables/)

Supersedes: ADR-009 (Composable State), ADR-010 (Variant Query Params), ADR-011 (Frontend Layered Architecture)

## Context

Three frontend architecture decisions were made incrementally in May 2026:

1. **State management strategy** — Server state vs. client state, Pinia vs. composables
2. **Variant encoding in URLs** — Query parameters vs. path segments for variant triples
3. **Layered architecture** — Separation of concerns across the frontend codebase

This ADR consolidates all three.

---

## 1. Composable-first Client State, No Pinia

### Decision

We use TanStack Vue Query for all server state and module-level `ref()`/`reactive()` singletons for cross-component client state. We deliberately do not use Pinia or Vuex.

### Rationale

**Considered Options:**

- **Pinia** — Adds a dependency whose benefits (devtools, plugin ecosystem) we don't need at this scale. Module-level refs are simpler, testable without store setup, and already sufficient.
- **TanStack Query alone** — Sufficient for server state but lacks a pattern for shared client state (the seenSet in the review flow), hence the module-level singletons.
- **Computed/Props drilling** — Works for small trees but breaks down for cross-page state like the review flow.

### Consequences

Adding a new client-store concern means using the module-level singleton pattern, not reaching for Pinia. If the app grows to need time-travel debugging or cross-tab sync, this decision should be revisited.

---

## 2. Variant as Query Parameters, Not Path Segments

### Context

A VisualTest's identity consists of its name plus a variant triple of (viewport, browser, environment). These variant dimensions must be encoded in the URL.

### Decision

We encode the variant triple as query parameters (`?viewport=1280&browser=chrome&environment=desktop`), not as path segments. A path like `/projects/X/tests/Y?viewport=1280` stays flat and flexible for future multi-variant views or optional filters. Path-based encoding (`/projects/X/tests/Y/variants/1280-chrome-desktop`) would require more explanation without providing real value.

### Rationale

Query parameters keep the URL structure simple, allow omitting individual dimensions, and naturally extend to multi-variant selection in the future. Path-based encoding would require dedicated routing logic and URL parsing for no tangible benefit.

### Consequences

Routes remain flat. Adding optional variant filters doesn't require route changes. The frontend parses variant from `useRoute().query` instead of route params.

---

## 3. Three-Layer Frontend Architecture

### Decision (original, 2026-05-23)

The frontend originally separated concerns into four distinct layers: **domains/** (pure models, mappers, query keys), **services/** (TanStack Query hooks), **composables/** (business logic orchestration), and **views/ + components/** (UI).

### Amended (2026-06-12)

The **services/** layer was removed. In practice every service hook had exactly one consumer (a composable), and the hook's interface was nearly as wide as its implementation — a shallow module. Query and mutation setup is now inlined into the composable that owns the logic. The architecture is now three layers:

- **domains/** — models, mappers, query keys, status config. Zero Vue imports.
- **composables/** — query hooks (inlined), business logic orchestration, review session state.
- **views/ + components/** — UI only. May import from composables but never from `@sdk`.

Data flow remains unidirectional: SDK → domain mapper → composable (inline query) → view.

Cache invalidation rules are centralized in `lib/invalidation.ts` so mutations declare _what_ changed, not _which_ query keys to invalidate.

### Rationale

**Considered Options:**

- **Feature-sliced design** — More granular but adds ceremony (entities/features/widgets/pages) that doesn't pay off at this scale.
- **Flat structure** (all logic in components) — Faster initially but leads to untestable fat components and duplicated query logic.
- **Standard Vue stores** (Pinia actions as logic layer) — Would colocate business logic with state management, but TanStack Query already handles server state; splitting logic across stores and composables creates ambiguity about where something lives.

### Consequences

New features add at most two files per domain concern (domain model + composable). Views must never import from `@sdk`. Mutations use centralized invalidation rules from `lib/invalidation.ts` rather than hand-listing query keys.

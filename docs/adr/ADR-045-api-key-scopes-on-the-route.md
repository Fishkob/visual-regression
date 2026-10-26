# ADR 045: API-Key Scopes Are Declared on the Route

## Status

Accepted — 2026-10-26

## Context

`AuthenticationGuard` derived an API key's required scope from the request path:
`*/upload` needed `upload`, anything containing `/approval` or `/baseline-restore`
needed `approve`, reads needed `read`, and **every other write fell through to
`admin`**. The table lived in a private method, so two consequences were invisible:

- Renaming or renesting a route silently changed who could call it. Moving an
  admin endpoint under `.../approvals/...` would have downgraded it to `approve`.
- A new write inherited `admin` whether or not that was meant, and nothing could
  notice a route that never made the decision.

The table had also drifted from ADR-035, which says approval paths require
`approve`: `POST .../pdf-approval` contains `-approval`, not `/approval`, so a
PDF approval was **not** callable with an `approve`-scoped key.

## Decision

Every non-public route declares its API-key capability with `@Scope(...)`
(`common/http/api-key-scope.decorator.ts`); the value is a list, satisfied by any
one of the declared scopes. `@Public` routes need none — the guard never reaches
them. A route that declares nothing is **not callable by an API key at all**
(`403`), so the fail-closed answer is visible in a test instead of a silent
`admin` grant. Admin-scoped keys keep bypassing the requirement, and the project
allowlist is unchanged.

The 89 annotated routes reproduce the old table exactly, verified route by route
and key-scope combination against the previous implementation, with two deliberate
differences:

- `POST .../pdf-approval` now requires `approve`, matching ADR-035 and the image
  approval it sits beside (it required `admin` only because of the hyphen).
- `POST .../runs/:runKey/approve-all` keeps `admin`. A run-wide approve is still
  the one bulk operation whose authority is an open product question, and this
  refactor does not widen a permission while it moves one.

## Alternatives considered

- **Keep the path table and add exceptions.** Rejected: the table is the defect —
  it makes the decision invisible at the route and forces every future endpoint
  to be re-read against a private method.
- **A route-level default per controller.** Rejected: controllers are mixed
  (`runs` reads are `read`, its two writes are `admin`), so a class default would
  have to be overridden anyway.

## Consequences

- A route that forgets `@Scope` fails closed and its e2e/unit coverage fails with
  `This endpoint is not available to API keys`, instead of quietly accepting the
  widest key.
- Adding a route now requires an explicit decision, at the route, next to
  `@Roles`.
- The guard no longer guesses: `requiredApiKeyScope(request)` and its path
  substrings are gone.
- Swagger surfaces the metadata only as the existing security scheme; the
  per-route scope is not part of the generated client.

# Dependency Refresh — Design

Date: 2026-10-07

## Problem

The repository's dependencies have drifted behind the latest releases, and five
transitive npm packages carry known vulnerabilities that the security scan
reports. The dependency gate (see the dev/prod classification spec) will keep
failing on the production findings — `mysql2` and `deepmerge-ts` — until they are
picked up at patched versions.

The goal is a repo-wide refresh: bring every direct dependency to its latest
release across the pnpm workspaces and the pdf-sidecar Maven project, pin the
vulnerable transitive npm packages to patched versions, and keep the codebase
building, linting, type-checking, and passing tests.

## Decision

**Update all direct dependencies to their latest releases in both ecosystems,
except TypeScript (stay on `6.0.3`) and Prisma (stay on `7.10.0`). Force the five
vulnerable transitive npm packages to their patched versions via `overrides`.
Verify with the full project checks after each stage, falling back to the
previous version if a breaking bump cannot be resolved within the stage.**

The user explicitly accepted the risky bumps (pixelmatch `8.0.0`, JUnit `6`,
logback `1.6.5`, logstash-logback-encoder `9`) after being told they are majors;
logstash 9 was later reverted to `8.1` (see the Maven section). TypeScript `7` is
deliberately excluded. A coordinated Prisma `8` upgrade turned out to be
impossible: only the `prisma` CLI publishes an `8.0.0-rc.*`, while the
`@prisma/client` family has no 8.x release — a CLI-8/client-7 split is
unsupported, so the whole Prisma family stays on `7.10.0`.

## Vulnerable transitive packages (overrides)

The overrides live in `pnpm-workspace.yaml` (pnpm 10's settings home); the
`pnpm` field in `package.json` is no longer read and emits a warning.

| Package      | Current | Override to | Advisory                   |
| ------------ | ------- | ----------- | -------------------------- |
| shell-quote  | 1.9.0   | 1.11.0      | GHSA-pqg4-j6r4-53mv        |
| js-yaml      | 4.2.0   | 4.3.2       | GHSA-2883-xcg3-v3hh et al. |
| mysql2       | 3.15.3  | 3.23.1      | GHSA-3f6p-5ww8-9rcr et al. |
| deepmerge-ts | 7.1.5   | 8.0.0       | GHSA-ggr8-5vv4-36mx        |
| lodash       | 4.17.21 | 4.18.1      | GHSA-r5fr-rjxr-66jc        |

`lodash` surfaced only in the final scan (a production HIGH reachable via
`@prisma/client → prisma → @prisma/studio-core → @visx/shape`); it has a
published fix, so it is patched by override rather than allowlisted.

The `js-yaml` override must be **range-scoped** (`"js-yaml@<4.3.2": "4.3.2"`), not a
global override: the lockfile also resolves `js-yaml@5.4.2` in the production
graph, and a global override would downgrade it. `shell-quote`, `mysql2`,
`deepmerge-ts`, and `lodash` each resolve to a single affected version, so plain
range-scoped overrides are safe.

`deepmerge-ts` is a major bump forced under `@prisma/config` (Prisma CLI,
build/CLI usage). If the Prisma CLI does not tolerate it, fall back to
allowlisting it in `osv-scanner.toml` with a justification, as already done for
`braces`.

## Direct npm bumps (`pnpm update --latest`, TypeScript excepted)

`backend`, `frontend`, and the root workspace. Patch/minor:

`@darraghor/eslint-plugin-nestjs-typed` 7.5.8, `@tanstack/vue-table` 9.2.8,
`@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` + `typescript-eslint`
8.71.1, `dotenv` 18.0.7, `vite` 8.3.4, `@aws-sdk/client-s3` 3.1148.0,
`@opentelemetry/sdk-trace-base` + `@opentelemetry/sdk-trace-node` 2.12.0,
`@opentelemetry/exporter-trace-otlp-proto` + `@opentelemetry/instrumentation-http`

- `@opentelemetry/sdk-node` 0.223.0, `@opentelemetry/instrumentation-express` 0.71.0,
  `reka-ui` 2.11.0, `vue-router` 5.4.0.

Majors (accepted):

- `pixelmatch` 7.2.0 → 8.0.0 — the comparison engine (ADR-016); the v8 API remains
  a drop-in default export, and `pixelmatch-comparison.service.ts` already
  dynamic-imports it, so no code change was needed.

Excluded: `typescript` (stays `6.0.3`), `prisma` + `@prisma/adapter-pg`,
`@prisma/client`, `@prisma/client-runtime-utils`, `@prisma/instrumentation` (stay
`7.10.0` — no 8.x client release exists), and `prom-client` (its latest is
flagged deprecated — do not bump).

## Maven bumps (`pdf-sidecar/pom.xml`)

| Artifact                                                   | Current | Target  |
| ---------------------------------------------------------- | ------- | ------- |
| io.opentelemetry:opentelemetry-api / -sdk / -exporter-otlp | 1.51.0  | 1.66.0  |
| ch.qos.logback:logback-classic                             | 1.5.18  | 1.6.5   |
| net.logstash.logback:logstash-logback-encoder              | 8.1     | 8.1\*   |
| org.junit.jupiter:junit-jupiter                            | 5.11.4  | 6.1.3   |
| org.apache.pdfbox:pdfbox                                   | 3.0.3   | 3.0.8   |
| io.javalin:javalin                                         | 7.2.2   | 7.2.3   |
| de.redsix:pdfcompare                                       | 1.2.8   | 1.2.11  |
| com.fasterxml.jackson.core:jackson-core / -databind        | 2.18.11 | 2.22.3  |
| com.fasterxml.jackson.core:jackson-annotations             | 2.18.11 | 2.22\*  |
| org.eclipse.jetty:jetty-server / -http / -security         | 12.1.12 | 12.1.14 |

\* Two artifacts could not reach the planned target:

- `logstash-logback-encoder` stays `8.1`: 9.0 switches to Jackson 3
  (`tools.jackson.core`), which removes the Jackson 2 `databind` that Javalin's
  default JSON mapper needs — every JSON endpoint returned 500. Pinned to the
  latest of the previous major line.
- `jackson-annotations` is `2.22`, not `2.22.3`: the annotations artifact has no
  `2.22.3` on Maven Central (the patch suffix was dropped from 2.20 onward).
  `jackson-core`/`-databind` remain on `2.22.3`.

## Verification

Order matters: `lint` → `typecheck:all` → `format` → `unitTest`, plus the
frontend suite and the SDK regeneration when `backend/` DTOs or the Prisma schema
change.

- `pnpm install` succeeds; SDK generation and build succeed (the full
  `pnpm run bootstrap` additionally needs a running Postgres for `migrate deploy`).
- `pnpm run lint`, `pnpm run typecheck:all`, `pnpm run format:check`,
  `pnpm run unitTest`, and `cd frontend && pnpm test` all pass.
- `pnpm run sdk:generate && pnpm run sdk:build` produces no unexpected drift.
- `docker run --rm -v "$PWD/pdf-sidecar":/app -w /app maven:3-eclipse-temurin-25-alpine mvn -q clean package` builds; tests pass with JUnit 6.
- `python3 scripts/security/osv-gate.py osv-results.json` reports no production
  CRITICAL/HIGH findings after the scan (the five transitive vulns are patched;
  the remaining dev-only findings are warnings under the classification spec).

## Risks / fallbacks

- **Prisma**: stays `7.10.0`; there is no consistent 8.x release to move to.
- **pixelmatch 8**: major engine bump; fallback: pin back to `7.2.0`.
- **JUnit 6 / logback 1.6**: majors; fallback: pin to the latest release of the
  previous major line.
- **logstash-logback-encoder 9**: reverted to `8.1` — 9.0 drops the Jackson 2
  `databind` Javalin's default JSON mapper needs.
- **deepmerge-ts 8**: fallback: `osv-scanner.toml` allowlist with justification.

## Out of scope

- TypeScript `7` (explicitly excluded) and Prisma `8` (no client release).
- The dev/prod classification gate itself — separate spec.
- Reworking the dependency automation (Dependabot) configuration.

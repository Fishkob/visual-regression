# Dependency Refresh — Design

Date: 2026-10-07

## Problem

The repository's dependencies have drifted behind the latest releases, and four
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
except TypeScript (stay on `6.0.3`). Force the four vulnerable transitive npm
packages to their patched versions via `pnpm.overrides`. Verify with the full
project checks after each stage, falling back to the previous version if a
breaking bump cannot be resolved within the stage.**

The user explicitly accepted the risky bumps (Prisma `8.0.0-rc.21`, pixelmatch
`8.0.0`, JUnit `6`, logback `1.6.5`, logstash-logback-encoder `9`) after being
told they are majors / a prerelease. TypeScript `7` is deliberately excluded.

## Vulnerable transitive packages (pnpm.overrides)

| Package      | Current | Override to | Advisory               |
| ------------ | ------- | ----------- | ---------------------- |
| shell-quote  | 1.9.0   | 1.11.0      | GHSA-pqg4-j6r4-53mv    |
| js-yaml      | 4.2.0   | 4.3.2       | GHSA-2883-xcg3-v3hh et al. |
| mysql2       | 3.15.3  | 3.23.1      | GHSA-3f6p-5ww8-9rcr et al. |
| deepmerge-ts | 7.1.5   | 8.0.0       | GHSA-ggr8-5vv4-36mx    |

The `js-yaml` override must be **range-scoped** (`"js-yaml@<4.3.2": "4.3.2"`), not a
global override: the lockfile also resolves `js-yaml@5.4.2` in the production
graph, and a global override would downgrade it. `shell-quote`, `mysql2`, and
`deepmerge-ts` each resolve to a single version, so plain overrides are safe.

`deepmerge-ts` is a major bump forced under `@prisma/config` (Prisma CLI,
build/CLI usage). If Prisma 8 does not tolerate it, fall back to allowlisting it
in `osv-scanner.toml` with a justification, as already done for `braces`.

## Direct npm bumps (`pnpm update --latest`, TypeScript excepted)

`backend`, `frontend`, and the root workspace. Patch/minor:

`@darraghor/eslint-plugin-nestjs-typed` 7.5.8, `@tanstack/vue-table` 9.2.7,
`@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` + `typescript-eslint`
8.71.1, `dotenv` 18.0.6, `vite` 8.3.3, `@aws-sdk/client-s3` 3.1147.0,
`@opentelemetry/sdk-trace-base` + `@opentelemetry/sdk-trace-node` 2.12.0,
`@opentelemetry/exporter-trace-otlp-proto` + `@opentelemetry/instrumentation-express`
+ `@opentelemetry/instrumentation-http` + `@opentelemetry/sdk-node` 0.223.0,
`reka-ui` 2.11.0, `vue-router` 5.4.0.

Majors / prerelease (accepted):

- `pixelmatch` 7.2.0 → 8.0.0 — the comparison engine (ADR-016); verify image
  diff behaviour and the backend unit tests.
- `prisma` + `@prisma/adapter-pg`, `@prisma/client`, `@prisma/client-runtime-utils`,
  `@prisma/instrumentation` `^7.10.0` → `8.0.0-rc.21` — regenerate the Prisma
  client and run migrations/tests. If the RC cannot be made to build, pin back to
  `7.10.0` and record the exception.

Excluded: `typescript` (stays `6.0.3`), and `prom-client` (its latest is
flagged deprecated — do not bump).

## Maven bumps (`pdf-sidecar/pom.xml`)

| Artifact                        | Current | Target  |
| ------------------------------- | ------- | ------- |
| io.opentelemetry:opentelemetry-api / -sdk / -exporter-otlp | 1.51.0 | 1.66.0 |
| ch.qos.logback:logback-classic  | 1.5.18  | 1.6.5   |
| net.logstash.logback:logstash-logback-encoder | 8.1 | 9.0  |
| org.junit.jupiter:junit-jupiter | 5.11.4  | 6.1.3   |
| org.apache.pdfbox:pdfbox        | 3.0.3   | 3.0.8   |
| io.javalin:javalin              | 7.2.2   | 7.2.3   |
| de.redsix:pdfcompare            | 1.2.8   | 1.2.11  |
| com.fasterxml.jackson.core:jackson-core / -databind / -annotations | 2.18.11 | 2.22.3 |
| org.eclipse.jetty:jetty-server / -http / -security | 12.1.12 | 12.1.14 |

`jackson-annotations`' `latest` is `3.0-rc5` (a prerelease); align it to
`2.22.3` with the rest of Jackson instead. The dependency-management overrides
for Jackson and Jetty are bumped in lockstep.

## Verification

Order matters: `lint` → `typecheck:all` → `format` → `unitTest`, plus the
frontend suite and the SDK regeneration when `backend/` DTOs or the Prisma schema
change.

- `pnpm install` succeeds; `pnpm run bootstrap` (generate SDK + build) succeeds.
- `pnpm run lint`, `pnpm run typecheck:all`, `pnpm run format:check`,
  `pnpm run unitTest`, and `cd frontend && pnpm test` all pass.
- `pnpm run sdk:generate && pnpm run sdk:build` produces no unexpected drift.
- `cd pdf-sidecar && mvn -q package` builds; its tests pass with JUnit 6.
- `python3 scripts/security/osv-gate.py osv-results.json` reports no production
  CRITICAL/HIGH findings after the scan (the four transitive vulns are patched;
  the remaining dev-only findings are warnings under the classification spec).

## Risks / fallbacks

- **Prisma 8 RC**: prerelease; may need code changes. Fallback: pin back to
  `7.10.0` and note the exception.
- **pixelmatch 8**: major engine bump; fallback: pin back to `7.2.0`.
- **JUnit 6 / logstash-logback-encoder 9 / logback 1.6**: majors; fallback:
  pin to the latest release of the previous major line.
- **deepmerge-ts 8**: fallback: `osv-scanner.toml` allowlist with justification.

## Out of scope

- TypeScript `7` (explicitly excluded).
- The dev/prod classification gate itself — separate spec.
- Reworking the dependency automation (Dependabot) configuration.

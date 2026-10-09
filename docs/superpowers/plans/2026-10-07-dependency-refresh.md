# Dependency Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every direct dependency in the pnpm workspaces and the pdf-sidecar Maven project to its latest release (except TypeScript), and force the four vulnerable transitive npm packages to patched versions, while keeping the repo building, linting, type-checking, and green.

**Architecture:** Root `pnpm.overrides` force the patched transitive versions; `pnpm -r update --latest` bumps the direct dependencies (TypeScript is restored to `^6.0.3` afterwards); `pdf-sidecar/pom.xml` versions are edited directly. Each stage is verified and committed separately, with a documented fallback if a breaking bump cannot be resolved.

**Tech Stack:** pnpm 10, Prisma 8 RC, Vite/Vue, Maven 3, Python 3 (security gate).

**Spec:** `docs/superpowers/specs/2026-10-07-dependency-refresh-design.md`

**Prerequisite:** The dev/prod gate plan (`2026-10-07-dev-prod-dependency-gate.md`) is implemented, so the scan can be re-run with classification.

---

### Task 1: Force patched versions of the vulnerable transitive packages

**Files:**

- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Add range-scoped overrides**

In `pnpm-workspace.yaml`, add a top-level `overrides` key:

```yaml
overrides:
  "shell-quote@<1.11.0": "1.11.0"
  "js-yaml@<4.3.2": "4.3.2"
  "mysql2@<3.23.1": "3.23.1"
  "deepmerge-ts@<8.0.0": "8.0.0"
  "lodash@<4.18.0": "4.18.1"
```

`lodash` surfaced only in the final scan (Task 5) as a production HIGH via
`@prisma/client → prisma → @prisma/studio-core → @visx/shape`; it has a fix, so
it is patched here rather than allowlisted.

pnpm 10 no longer reads the `pnpm` field in `package.json` (it warns), so the
overrides belong in `pnpm-workspace.yaml`. The `js-yaml` selector is range-scoped
so the production `js-yaml@5.4.2` is not downgraded.

- [ ] **Step 2: Install and verify the resolved versions**

Run:

```bash
pnpm install
pnpm why -r shell-quote js-yaml mysql2 deepmerge-ts lodash
```

Expected: `shell-quote@1.11.0`, `js-yaml@4.3.2` for the 4.x line (a `js-yaml@5.4.2` may remain), `mysql2@3.23.1`, `deepmerge-ts@8.0.0`, `lodash@4.18.1`.

- [ ] **Step 3: Verify the SDK/project still builds**

Run: `pnpm --filter ./backend prisma:generate && pnpm run sdk:generate && pnpm run sdk:build`
Expected: succeeds. (`pnpm run bootstrap` would additionally run `migrate deploy`, which needs a running Postgres.)

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "fix(deps): force patched versions of vulnerable transitive packages"
```

### Task 2: Bump direct dependencies to latest (TypeScript excepted)

**Files:**

- Modify: `package.json`, `frontend/package.json`, `backend/package.json`, `client-sdk/package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Record the current TypeScript specifiers**

Run: `grep -rn '"typescript"' package.json frontend/package.json client-sdk/package.json backend/package.json`
Expected: `^6.0.3` in the root, `frontend`, and `client-sdk` (backend uses the `@typescript/typescript6` alias).

- [ ] **Step 2: Update everything to latest**

Run: `pnpm -r --include-workspace-root update --latest`

- [ ] **Step 3: Restore TypeScript to `^6.0.3`, and Prisma to `7.10.0`**

Edit the `typescript` entry back to `"^6.0.3"` in `package.json`, `frontend/package.json`, and `client-sdk/package.json` if the update changed them. Also set `prisma` back to `^7.10.0` in `backend/package.json`: only the CLI has an `8.0.0-rc.*`, the `@prisma/client` family has no 8.x release, so a CLI-8/client-7 split is unsupported. Then `pnpm install`.

- [ ] **Step 4: Verify the pins and the majors**

Run:

```bash
grep -rn '"typescript"' package.json frontend/package.json client-sdk/package.json
pnpm list -r --depth 0 | grep -E "typescript|pixelmatch|prisma"
```

Expected: TypeScript still `6.0.3`; `pixelmatch` `8.0.0`; the whole Prisma family `7.10.0`.

- [ ] **Step 5: Commit**

```bash
git add package.json frontend/package.json backend/package.json client-sdk/package.json pnpm-lock.yaml
git commit -m "chore(deps): bump direct dependencies to latest (keep TypeScript 6, Prisma 7)"
```

### Task 3: Verify the workspace and fix breakages

**Files:**

- Modify: whichever source files the bumps break.

- [ ] **Step 1: Regenerate the SDK and Prisma client**

Run: `pnpm --filter ./backend prisma:generate && pnpm run sdk:generate && pnpm run sdk:build`
Expected: succeeds. If `prisma generate` rejects `deepmerge-ts@8.0.0`, pin it back in the Task 1 override and apply the Task 5 Step 2 allowlist, then continue.

- [ ] **Step 2: Run the full check suite**

Run, in order:

```bash
pnpm run lint
pnpm run typecheck:all
pnpm run format
pnpm run unitTest
cd frontend && pnpm test
```

Expected: all pass. Fix any breakages introduced by the major bumps (pixelmatch 8 API changes in the comparison engine, framework bumps).

- [ ] **Step 3: Check for SDK drift**

Run: `pnpm run sdk:generate && pnpm run sdk:build && git status --short`
Expected: no unexpected changes under `client-sdk/` or `backend/swagger.json` (regenerate and re-stage if the schema changed).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(deps): adapt code to updated dependencies"
```

### Task 4: Bump the Maven dependencies

**Files:**

- Modify: `pdf-sidecar/pom.xml`

- [ ] **Step 1: Apply the version bumps**

In `pdf-sidecar/pom.xml`:

- `opentelemetry-api`, `opentelemetry-sdk`, `opentelemetry-exporter-otlp`: `1.51.0` → `1.66.0`
- `logback-classic`: `1.5.18` → `1.6.5`
- `logstash-logback-encoder`: **stays `8.1`** — 9.0 switches to Jackson 3 and drops the Jackson 2 `databind` that Javalin's default JSON mapper needs (500s on JSON endpoints). Fall back to the latest of the previous major line.
- `junit-jupiter`: `5.11.4` → `6.1.3`
- `pdfbox`: `3.0.3` → `3.0.8`
- `${javalin.version}`: `7.2.2` → `7.2.3`
- `${pdfcompare.version}`: `1.2.8` → `1.2.11`
- Jackson `jackson-core`/`jackson-databind`: `2.18.11` → `2.22.3`; `jackson-annotations`: `2.18.11` → **`2.22`** (no `2.22.3` exists — the patch suffix was dropped from 2.20)
- Jetty (`jetty-server`, `jetty-http`, `jetty-security`): `12.1.12` → `12.1.14`

- [ ] **Step 2: Build and test**

The pom targets `maven.compiler.release=25`; the local JDK is 21, so build in the pinned Maven image:

Run:

```bash
docker run --rm -v "$PWD/pdf-sidecar":/app -w /app maven:3-eclipse-temurin-25-alpine mvn -q clean package
```

Expected: BUILD SUCCESS; tests pass with JUnit 6.

- [ ] **Step 3: Commit**

```bash
git add pdf-sidecar/pom.xml
git commit -m "chore(deps): bump Maven dependencies to latest"
```

### Task 5: Final security scan

**Files:**

- Possibly modify: `osv-scanner.toml` (fallback only)

- [ ] **Step 1: Re-scan and gate**

Run:

```bash
osv-scanner scan source --recursive --config osv-scanner.toml --format=json --output-file=osv-results.json . || true
python3 scripts/security/osv-gate.py osv-results.json; echo "exit=$?"
```

Expected: exit 0. The four transitive vulnerabilities are patched; any remaining dev-only findings are warnings.

- [ ] **Step 2 (fallback): Allowlist a package that cannot be patched**

If `deepmerge-ts@8.0.0` breaks Prisma 8 and cannot be resolved, pin it back and add an entry to `osv-scanner.toml` with a justification (mirroring the existing `braces` entry), then re-run Step 1.

- [ ] **Step 3: Commit any fallback**

```bash
git add osv-scanner.toml pnpm-lock.yaml package.json
git commit -m "chore(security): allowlist unreachable Prisma build-time finding"
```

# Dependency & Image Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Dependabot-driven updates, pin unpinned images, bump RustFS, and single-source the pnpm/prisma versions.

**Architecture:** One declarative `.github/dependabot.yml` covers GitHub Actions, npm/pnpm workspaces, Dockerfiles, and Docker Compose. Rolling/unpinned image tags are replaced with stable versions so Dependabot can track them. pnpm/prisma versions are derived from `package.json` instead of hardcoded in Dockerfiles, with a CI guard against regressions.

**Tech Stack:** Dependabot, GitHub Actions, Docker/BuildKit, pnpm, Prisma.

---

**Note on commits:** per `AGENTS.md`, commits are made only because the user authorised them for this work. Each task ends with a commit step.

**Note on "tests":** this is config/infra work. Verification is `actionlint`/YAML parsing plus local Docker build and `docker compose up` smoke checks (Task 7), not a unit-test suite.

---

### Task 1: Add `.github/dependabot.yml`

**Files:**

- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create the config**

Create `.github/dependabot.yml` with exactly:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      github-actions:
        patterns: ["*"]
        update-types: ["minor", "patch"]

  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      npm-minor-patch:
        patterns: ["*"]
        update-types: ["minor", "patch"]

  - package-ecosystem: docker
    directory: /backend
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      docker-backend:
        patterns: ["*"]
        update-types: ["minor", "patch"]

  - package-ecosystem: docker
    directory: /frontend
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      docker-frontend:
        patterns: ["*"]
        update-types: ["minor", "patch"]

  - package-ecosystem: docker
    directory: /pdf-sidecar
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      docker-pdf-sidecar:
        patterns: ["*"]
        update-types: ["minor", "patch"]

  - package-ecosystem: docker-compose
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      docker-compose:
        patterns: ["*"]
        update-types: ["minor", "patch"]
```

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/dependabot.yml')); print('dependabot.yml OK')"`
Expected: `dependabot.yml OK`

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci(deps): add Dependabot config for actions, npm, docker, compose"
```

---

### Task 2: Pin the unpinned images

**Files:**

- Modify: `docker-compose.observability.yml` (5 image lines)
- Modify: `docker-compose.infra.yml` (the `alpine` helper image)
- Modify: `frontend/Dockerfile` (the `nginx` base image)

- [ ] **Step 1: Pin the observability images**

In `docker-compose.observability.yml`, set the service images to:

- `alloy`: `image: grafana/alloy:v1.20.1`
- `tempo`: `image: grafana/tempo:3.1.0`
- `loki`: `image: grafana/loki:3.7.8`
- `prometheus`: `image: prom/prometheus:v3.15.0`
- `grafana`: `image: grafana/grafana:13.2.3`

(i.e. replace each `:latest` with the version shown.)

- [ ] **Step 2: Pin the alpine helper image**

In `docker-compose.infra.yml`, change:

```yaml
volume-permission-helper:
  image: alpine
```

to:

```yaml
volume-permission-helper:
  image: alpine:3.24.2
```

- [ ] **Step 3: Pin nginx in the frontend Dockerfile**

In `frontend/Dockerfile`, change the final stage's first line:

```dockerfile
FROM nginx:alpine
```

to:

```dockerfile
FROM nginx:1.31.6-alpine
```

- [ ] **Step 4: Verify compose files parse**

Run:

```bash
docker compose -f docker-compose.infra.yml config >/dev/null && docker compose -f docker-compose.observability.yml config >/dev/null && echo "compose OK"
```

Expected: `compose OK` (if Docker is unavailable, `python3 -c "import yaml; yaml.safe_load(open('docker-compose.observability.yml')); yaml.safe_load(open('docker-compose.infra.yml'))"` and note that Docker was unavailable).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.observability.yml docker-compose.infra.yml frontend/Dockerfile
git commit -m "build: pin unpinned base and infra images"
```

---

### Task 3: Bump RustFS to 1.0.1

**Files:**

- Modify: `docker-compose.infra.yml`
- Modify: `deploy/charts/vrt/values.yaml`

- [ ] **Step 1: Bump in compose**

In `docker-compose.infra.yml`, change `image: rustfs/rustfs:1.0.0-rc.3` to:

```yaml
image: rustfs/rustfs:1.0.1
```

- [ ] **Step 2: Bump in the Helm values**

In `deploy/charts/vrt/values.yaml`, under `rustfs:`, change:

```yaml
image: rustfs/rustfs:1.0.0-rc.3
```

to:

```yaml
image: rustfs/rustfs:1.0.1
```

- [ ] **Step 3: Confirm no stale reference remains**

Run: `grep -rn "1.0.0-rc.3" . --include="*.yml" --include="*.yaml" | grep -v node_modules || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.infra.yml deploy/charts/vrt/values.yaml
git commit -m "build: bump rustfs to 1.0.1"
```

---

### Task 4: Single-source the pnpm version

**Files:**

- Modify: `package.json`
- Modify: `.github/actions/setup/action.yml`
- Modify: `backend/Dockerfile`
- Modify: `backend/Dockerfile.worker`
- Modify: `frontend/Dockerfile`

- [ ] **Step 1: Declare the version once**

In root `package.json`, add `packageManager` immediately after `"private": true,`:

```json
  "private": true,
  "packageManager": "pnpm@10.34.5",
```

- [ ] **Step 2: Let CI read it**

In `.github/actions/setup/action.yml`, replace:

```yaml
- uses: pnpm/action-setup@v6
  with:
    version: 10.34.5
```

with:

```yaml
- uses: pnpm/action-setup@v6
```

- [ ] **Step 3: Derive pnpm in `backend/Dockerfile`**

In `backend/Dockerfile`, in BOTH stages, replace:

```dockerfile
WORKDIR /app

RUN npm install -g pnpm@10.34.5

COPY package.json pnpm-lock.yaml .npmrc ./
```

with:

```dockerfile
WORKDIR /app

COPY package.json ./
RUN PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@').pop()")" && npm install -g "pnpm@${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml .npmrc ./
```

- [ ] **Step 4: Derive pnpm in `backend/Dockerfile.worker`**

Apply the same replacement as Step 3 in both stages of `backend/Dockerfile.worker`.

- [ ] **Step 5: Derive pnpm in `frontend/Dockerfile`**

In `frontend/Dockerfile`, replace:

```dockerfile
WORKDIR /app

RUN npm install -g pnpm@10.34.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
```

with:

```dockerfile
WORKDIR /app

COPY package.json ./
RUN PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@').pop()")" && npm install -g "pnpm@${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
```

- [ ] **Step 6: Confirm no hardcoded pnpm version remains**

Run: `grep -rn "pnpm@10" .github backend/Dockerfile backend/Dockerfile.worker frontend/Dockerfile || echo "clean"`
Expected: `clean`

- [ ] **Step 7: Commit**

```bash
git add package.json .github/actions/setup/action.yml backend/Dockerfile backend/Dockerfile.worker frontend/Dockerfile
git commit -m "build: single-source the pnpm version from package.json"
```

---

### Task 5: Single-source the prisma version in the migrate image

**Files:**

- Modify: `backend/Dockerfile.migrate`

- [ ] **Step 1: Derive prisma from `backend/package.json`**

Replace the whole `backend/Dockerfile.migrate` contents with:

```dockerfile
FROM node:24-alpine

WORKDIR /app

COPY --chown=node:node backend/package.json ./package.json
COPY --chown=node:node backend/prisma ./prisma
COPY --chown=node:node backend/prisma.config.ts ./

RUN PRISMA_VERSION="$(node -p "require('./package.json').devDependencies.prisma")" \
    && rm -f package.json \
    && npm install "prisma@${PRISMA_VERSION}" dotenv

RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx

RUN chown -R node:node /app

USER node

ENTRYPOINT ["/app/node_modules/.bin/prisma", "migrate", "deploy"]
```

- [ ] **Step 2: Confirm no hardcoded prisma version remains**

Run: `grep -rn "prisma@7" backend/Dockerfile.migrate || echo "clean"`
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile.migrate
git commit -m "build: derive prisma version from backend package.json"
```

---

### Task 6: Add the CI guard for hardcoded tool versions

**Files:**

- Create: `.github/workflows/dockerfile-version-guard.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/dockerfile-version-guard.yml` with exactly:

```yaml
name: Dockerfile Version Guard

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  guard:
    name: No hardcoded pnpm/prisma versions
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Check Dockerfiles
        run: |
          for f in backend/Dockerfile backend/Dockerfile.worker backend/Dockerfile.migrate frontend/Dockerfile; do
            [ -f "$f" ] || { echo "::error::expected Dockerfile missing: $f"; exit 1; }
          done
          if grep -RnE '(pnpm|prisma)@[0-9]' \
            backend/Dockerfile backend/Dockerfile.worker backend/Dockerfile.migrate frontend/Dockerfile; then
            echo "::error::Hardcoded pnpm/prisma version in a Dockerfile; derive it from package.json instead."
            exit 1
          fi
          echo "OK: no hardcoded pnpm/prisma versions"
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/dockerfile-version-guard.yml`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/dockerfile-version-guard.yml
git commit -m "ci: guard Dockerfiles against hardcoded pnpm/prisma versions"
```

---

### Task 7: Verify builds and compose stacks

**Files:** none (verification only)

Requires Docker. If Docker is unavailable, record that and rely on CI.

- [ ] **Step 1: Build the four changed images**

Run:

```bash
docker build -f backend/Dockerfile -t vrt-backend .
docker build -f backend/Dockerfile.worker -t vrt-worker .
docker build -f frontend/Dockerfile -t vrt-frontend .
docker build -f backend/Dockerfile.migrate -t vrt-migrate .
```

Expected: all four builds succeed (confirms the derived pnpm/prisma versions install).

- [ ] **Step 2: Smoke the infra stack (includes RustFS 1.0.1)**

Run:

```bash
docker compose -f docker-compose.infra.yml up -d
docker compose -f docker-compose.infra.yml ps
docker compose -f docker-compose.infra.yml down -v
```

Expected: `postgres` and `rustfs` reach healthy.

- [ ] **Step 3: Smoke the observability stack (pinned images)**

Run:

```bash
docker compose -f docker-compose.observability.yml up -d
docker compose -f docker-compose.observability.yml ps
docker compose -f docker-compose.observability.yml down -v
```

Expected: `alloy`, `tempo`, `loki`, `prometheus`, `grafana` start without crashing. If Tempo `3.1.0` rejects `tempo-config.yml`, fall back to the latest stable `2.x` tag, note it in the commit, and re-run.

- [ ] **Step 4: Report**

No commit. Report build results and any version fallbacks.

---

## Self-Review

**Spec coverage:**

| Spec section                  | Task   |
| ----------------------------- | ------ |
| Part 1 — Dependabot config    | Task 1 |
| Part 2 — pin images           | Task 2 |
| Part 3 — RustFS bump          | Task 3 |
| Part 4 — pnpm single-source   | Task 4 |
| Part 4 — prisma single-source | Task 5 |
| Part 4 — CI backstop          | Task 6 |
| Verification                  | Task 7 |

**Placeholder scan:** no `TBD`/`TODO`; every file change shows full content or exact before/after.

**Type consistency:** the derivation expressions (`require('./package.json').packageManager` and `.devDependencies.prisma`) match the keys added/read in Tasks 4–5; the guard regex `(pnpm|prisma)@[0-9]` matches only hardcoded versions and not the derived `pnpm@${PNPM_VERSION}` / `prisma@${PRISMA_VERSION}` forms.

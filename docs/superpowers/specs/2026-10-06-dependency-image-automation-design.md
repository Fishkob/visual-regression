# Dependency & Image Automation — Design

Date: 2026-10-06

## Problem

The first-party images (`visual-regression-*`, `pdf-sidecar`) are now published
by the release pipeline, but **everything the images are built from is still
updated by hand**:

- Dockerfile base images (`node:24-alpine`, `nginx:alpine`,
  `eclipse-temurin:25-jre-alpine`, `maven:3-eclipse-temurin-25-alpine`) and
  `docker-compose` images (`postgres:16-alpine`, `rustfs/rustfs:1.0.0-rc.3`,
  `alpine`, and the observability stack) drift out of date silently.
- GitHub Actions versions across workflows are updated manually.
- Dependencies in the pnpm workspaces are updated manually.
- Some images are unpinned rolling tags (`nginx:alpine`, `alpine`,
  `grafana/*:latest`, `prom/prometheus:latest`), so there is no version to track
  and reproducibility is lost.
- Tool versions are hardcoded in more than one place and have already drifted:
  `pnpm@10.34.5` in three Dockerfiles and `.github/actions/setup`, and
  `prisma@7.9.1` in `backend/Dockerfile.migrate` while `backend/package.json`
  declares `prisma: ^7.10.0`.

## Decision

**Adopt Dependabot for automated updates, pin every unpinned image, bump the
stale RustFS release candidate, and remove the tool-version duplication by
deriving pnpm/prisma versions from `package.json`.**

Four parts, delivered together:

1. A `.github/dependabot.yml` covering GitHub Actions, npm/pnpm, Dockerfiles,
   and Docker Compose.
2. Pin the currently-unpinned images so Dependabot can track them.
3. Bump `rustfs/rustfs:1.0.0-rc.3` to the current stable `1.0.1`.
4. Single-source the pnpm and prisma versions, with a light CI guard against
   reintroducing hardcoded versions.

Dependabot is chosen over Renovate because it is native, free for private and
public repositories, and needs no hosting. Renovate can be reconsidered after
the repository is made public (it can also manage Helm `values.yaml` image
tags, which Dependabot's Helm support does not cover for our custom
`images.<name>.name`/`images.<name>.tag` layout).

## Part 1 — `.github/dependabot.yml`

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

Rationale, verified against GitHub docs and `dependabot-core`:

- `docker` matches **every** file in the directory whose name contains
  `dockerfile`/`containerfile`, so `/backend` covers `Dockerfile`,
  `Dockerfile.worker`, and `Dockerfile.migrate`.
- `docker-compose` matches `docker-compose*.yml` / `compose*.yml` directly in
  the configured directory, so `/` covers `.yml`, `.infra.yml`, and
  `.observability.yml`.
- `npm` reads `pnpm-workspace.yaml` and every workspace `package.json`, so a
  single `/` entry covers `backend/`, `frontend/`, and `client-sdk/`.
- `github-actions` uses `directory: /`.
- Grouping `minor`+`patch` keeps PR noise low while major bumps (e.g.
  `node:24-alpine` → `node:25-alpine`) still arrive as separate PRs for review.
- `open-pull-requests-limit: 5` (the default) bounds concurrent PRs; security
  updates are exempt from this limit by design.

Helm is deliberately **not** configured: the chart's app image tags are owned by
the release pipeline, and our `images.<name>.name`/`tag` layout is not the
`image.repository`/`image.tag` convention Dependabot's Helm fetcher expects.

## Part 2 — Pin the unpinned images

Pinning replaces an untrackable rolling tag with a concrete version, which is
both what Dependabot needs and a reproducibility win. Each pinned version is the
current stable release at implementation time, chosen from the registry and
validated by a local `docker compose up` smoke test.

| File                               | Current                  | Pinned to                 |
| ---------------------------------- | ------------------------ | ------------------------- |
| `docker-compose.observability.yml` | `grafana/alloy:latest`   | `grafana/alloy:v1.20.1`   |
| `docker-compose.observability.yml` | `grafana/tempo:latest`   | `grafana/tempo:3.1.0`     |
| `docker-compose.observability.yml` | `grafana/loki:latest`    | `grafana/loki:3.7.8`      |
| `docker-compose.observability.yml` | `prom/prometheus:latest` | `prom/prometheus:v3.15.0` |
| `docker-compose.observability.yml` | `grafana/grafana:latest` | `grafana/grafana:13.2.3`  |
| `docker-compose.infra.yml`         | `alpine`                 | `alpine:3.24.2`           |
| `frontend/Dockerfile`              | `nginx:alpine`           | `nginx:1.31.6-alpine`     |

Versions are the current stable releases on Docker Hub as of 2026-10-06. If a
major jump breaks a config file (notably Tempo `2.x`→`3.x`), fall back to the
latest stable release of the previous major line and note it.

Risk: the observability config files (`tempo-config.yml`, `loki-config.yml`,
`alloy.alloy`, `prometheus.yml`) are version-sensitive, so the chosen versions
must be smoke-tested locally; pinning to a stable release is otherwise safer
than `:latest`.

## Part 3 — Bump RustFS

`rustfs/rustfs:1.0.0-rc.3` → `rustfs/rustfs:1.0.1` in both:

- `docker-compose.infra.yml`
- `deploy/charts/vrt/values.yaml` (`rustfs.image`)

`1.0.1` is the current stable tag on Docker Hub (published 2026-10-03). Smoke-test
`rustfs` health locally after the bump.

## Part 4 — Single-source pnpm and prisma versions

**pnpm**

- Add `"packageManager": "pnpm@10.34.5"` to the root `package.json`.
- `.github/actions/setup`: drop the explicit `version:` from `pnpm/action-setup`
  so it reads `packageManager` automatically.
- `backend/Dockerfile`, `backend/Dockerfile.worker`, `frontend/Dockerfile`: copy
  `package.json` before installing pnpm and derive the version, e.g.
  `RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@').pop()")"`.

**prisma**

- `backend/Dockerfile.migrate`: copy `backend/package.json` and derive the
  prisma version, e.g.
  `RUN npm install "prisma@$(node -p "require('./package.json').devDependencies.prisma")" dotenv`,
  so the migrate image tracks `^7.10.0` instead of the stale `7.9.1`.

**CI guard (backstop)**

A small CI check fails if a hardcoded `pnpm@<version>` or `prisma@<version>`
reappears in the Dockerfiles, keeping the single source authoritative.

## Verification

- `actionlint` on the changed workflows; YAML parse for `dependabot.yml` and the
  compose files.
- Local Docker builds of the four changed images (backend, worker, frontend,
  migrate) to confirm the derived pnpm/prisma versions install and the builds
  succeed.
- `docker compose -f docker-compose.infra.yml up -d` — postgres, rustfs healthy.
- `docker compose -f docker-compose.observability.yml up -d` — alloy, tempo,
  loki, prometheus, grafana start with the pinned images.

## Out of scope

- Auto-merge of Dependabot PRs, grouped major updates, or schedule tuning.
- Migrating to Renovate (revisit when the repository is made public).
- Managing the chart's app image tags (owned by the release pipeline).
- `docker-compose.yml` app services (built locally, no image tags to track).

# Deployment on Kubernetes

Deploys the full stack (backend, worker, frontend, pdf-sidecar, PostgreSQL, RustFS) into a Kubernetes cluster via the Helm chart in `deploy/charts/vrt/`, including an ingress, optional HPA/PDB, NetworkPolicy, and a `db-migrate` job that applies the schema before the backend starts.

> **Support status: best effort.** The supported deployment path is Docker Compose (`./install.sh`) — it is the one CI exercises end to end and the one that gets fixed first. The chart here is checked by `helm lint` and `helm template` ([chart-validate.yml](../.github/workflows/chart-validate.yml)) and by nothing else: no deployed smoke test, no cluster in CI, no coverage by `./scripts/verify.sh`. Treat this page as a well-tested starting point, not as a guarantee.
>
> **Not using Kubernetes?** For a single host, use the Compose installer: `./install.sh` — install, upgrade and day-to-day commands are in the [README quick start](../README.md#quick-start).

## Environment Variables

Both deployment paths read the same variables. [`.env.example`](../.env.example)
documents every one of them inline and is the reference to copy for Compose; the
table below is the subset a first deployment usually has to change.

| Variable                                              | Controls                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL container and the backend connection                                  |
| `RUSTFS_ROOT_USER` / `RUSTFS_ROOT_PASSWORD`           | RustFS root credentials (server and app)                                         |
| `RUSTFS_BUCKET`                                       | Storage bucket name                                                              |
| `RUSTFS_PUBLIC_URL`                                   | Browser-reachable storage base — the host of every presigned screenshot/PDF URL  |
| `CORS_ORIGIN`                                         | Browser origins allowed to call the API (see below)                              |
| `TRUST_PROXY`                                         | Trust `X-Forwarded-For` from the reverse proxy (see above)                       |
| `TOTP_ENCRYPTION_KEY`                                 | Required; AES-256-GCM key for the TOTP seeds at rest                             |
| `BASELINE_HISTORY_LIMIT`                              | Replaced baselines kept per test variant for restore (default 10, max 100)       |
| `APP_PUBLIC_URL`                                      | Dashboard base used to build links in webhook payloads                           |
| `AUTH_COOKIE_SECURE`                                  | `Secure` flag on the session cookie — set it in every deployment served over TLS |

Compose interpolates these for the containers **and** passes them to the app, so a
mismatch (for example the Postgres container and the backend's `DATABASE_URL`)
breaks startup silently. For the local resolution order across `.env`,
`backend/.env` and `backend/.env.local`, see
[local-development.md](local-development.md#environment-files).

### CORS

`CORS_ORIGIN` is a comma-separated list of origins
(`CORS_ORIGIN=http://localhost,http://localhost:80`); the backend splits it and
sends `Access-Control-Allow-Credentials`, so the frontend origin must be listed
exactly. The default is `http://localhost:5173` (the Vite dev server). A single `*`
allows any origin, but without credentials — do not use it for a logged-in UI. Set
the value explicitly in production.

## Prerequisites

- A Kubernetes cluster (e.g. k3s, kind, managed cloud) with a `kubectl` context
- **Helm 3** (for the direct Helm path) and/or **ArgoCD** (for the GitOps path)
- An ingress controller (default NetworkPolicy allows `traefik`)
- **DNS** for the ingress hosts: `vrt.local` (frontend) and `rustfs.vrt.local` (RustFS) must resolve to the cluster — wildcard `*.vrt.local` or `/etc/hosts` entries on test machines. Without DNS, the frontend loads but screenshot images do not.
- The pre-built images on GHCR (`ghcr.io/fishkob/*`) are public — no registry credentials are required.
- PostgreSQL 16+ (a chart-internal Postgres is included; an existing external instance can be used instead — see below)

## Two Deployment Paths

### Option A: Helm directly (no ArgoCD)

```bash
# Override default secrets before deploying (values.yaml ships CHANGE_ME placeholders)
helm upgrade --install vrt deploy/charts/vrt --namespace vrt --create-namespace \
  --set secrets.postgres_password=<strong-password> \
  --set secrets.rustfs_secret_key=<strong-key>
```

Or use the wrapper, which installs the chart and waits for the pods:

```bash
./deploy/scripts/deploy.sh
```

The chart pulls the pre-built images from `ghcr.io/fishkob/*` — public, so no
registry credentials are needed.

### Option B: ArgoCD (GitOps)

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

# Deploy the Visual Regression Application
kubectl apply -f deploy/argocd/app.yaml
```

The ArgoCD `Application` tracks `main` and syncs `deploy/charts/vrt` automatically. ArgoCD applies the chart's `values.yaml` (image tags are updated there by the release pipeline). Get the admin password and port-forward the UI:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open https://localhost:8080 — user: admin
```

> For ArgoCD, set secrets via the chart `values.yaml` (or `values.local.yaml`) rather than `--set` — ArgoCD syncs the chart values from the repo.

## Reverse Proxy (TRUST_PROXY)

The anonymous login and log-ingestion endpoints are keyed by client IP. Both
bundled topologies proxy the API — Docker Compose through the nginx frontend,
Helm through the ingress — so `TRUST_PROXY` defaults to **true** in
`docker-compose.yml`, the Helm chart and `.env.example`. Without it every request
reaches Nest from the proxy's IP, which collapses the per-IP login limit into one
deployment-wide bucket: ten failed logins per minute would lock out every user
(and `Session.ip` would record the proxy for everyone).

Keep the default when a proxy is in front. Set it to `false` only when the API is
exposed directly, with no proxy in front — trusting `X-Forwarded-For` from a
direct client lets that client spoof its IP and bypass the per-IP limits.
Authenticated product routes are not IP-limited, so the switch does not affect
them.

The Compose file additionally binds the backend port to `127.0.0.1` so the
API is reachable for local scripts/CI but not from the network; the frontend is
the only externally published service. An externally reachable backend port
would be an origin where a direct client can supply its own `X-Forwarded-For`.

## Rate Limits

Rate limits are counters per fixed one-minute window in Postgres, so they hold
across all backend instances. Five rules exist, each configured by a
`*_RATE_LIMIT_PER_MINUTE` env var and disabled by setting it to `0`: uploads per
API key (`UPLOAD_RATE_LIMIT_PER_MINUTE`, default 240), PDF page renders per
credential (`RENDER_RATE_LIMIT_PER_MINUTE`, default 240 — the render cache is
written outside the storage quota), login attempts per IP
(`LOGIN_RATE_LIMIT_PER_MINUTE`, default 10), log-ingestion requests per IP
(`LOG_RATE_LIMIT_PER_MINUTE`, default 400), and the operator surfaces
`/admin/api-keys` + `/admin/dlq` per IP (`ADMIN_RATE_LIMIT_PER_MINUTE`, default
120). Exceeding a limit returns `429` with a `Retry-After` header.

The render rule is unbilled on purpose (render-cache objects bypass the project
quota), so it stays deliberately tighter than the upload rule. The defaults are
also what an installation gets that never sets the vars — the Helm chart sets
none of them — so a deployment that depends on a specific value must pin it
explicitly in its env/`values.yaml`.

## Operator Keys and Session Lifetime

`ADMIN_API_KEY` and `METRICS_API_KEY` are static bearer credentials for the
privileged surfaces (`/admin/*`, `/metrics`, detailed `/health`). In production a
configured value must be at least 32 characters; empty disables the surface
(fail-closed). `install.sh` generates 24-byte keys. The comparison is
constant-time, and the admin surfaces are rate-limited (see above).

Sessions slide while they are used, but never past
`AUTH_SESSION_ABSOLUTE_MAX_DAYS` (default 90) measured from first login, so a
stolen cookie that is used regularly still dies. `AUTH_SESSION_TTL_DAYS`
(default 30) is the idle timeout.

Swagger UI and the OpenAPI document at `/docs` are enabled outside production and
disabled in production by default; set `SWAGGER_ENABLED=true` to publish them
there.

## Health Endpoints

| Endpoint                        | Auth            | Use                                              |
| ------------------------------- | --------------- | ------------------------------------------------ |
| `/health/live`                  | anonymous       | liveness probe (also the image `HEALTHCHECK`)    |
| `/health/ready`                 | anonymous       | readiness probe; statuses only, no error strings |
| `/health`                       | `x-metrics-key` | full diagnostics incl. probe latencies/messages  |
| `/health/db`, `/health/storage` | `x-metrics-key` | single-dependency diagnostics                    |

The probe endpoints must stay anonymous (a kubelet carries no key), so they
report only which dependency is unhealthy. The detailed view names the raw probe
error, which can include an internal host, so it requires the same key as
`/metrics`. When `METRICS_API_KEY` is empty the detailed endpoints answer `401`.

Readiness intentionally checks only what the API needs to serve requests
(database, storage, queue counts). It does **not** depend on the worker or the
pdf-sidecar: with `WORKER_HEALTH_URL`/`PDF_SIDECAR_HEALTH_URL` set they appear in
the detailed view, but a dead worker must not drain the API from the Service.

## Postgres Connections

Each process opens its own pool: `DATABASE_POOL_MAX` (default 10, max 100) per
API and per worker replica. Keep `replicas x pool` below the database's
`max_connections` (Postgres default: 100, minus superuser reserves):

```
(backend replicas + worker replicas) x DATABASE_POOL_MAX < max_connections
```

With the chart's autoscaling default (`maxReplicas: 5` each) and the default pool
of 10 that is exactly 100 connections, so either cap the HPA, lower
`DATABASE_POOL_MAX`, or raise `max_connections` on an external database.

## Retention runs in the worker

All scheduled retention (runs, jobs, sessions, share links, webhook payloads,
orphaned storage objects) lives in the worker process, not the API. A deployment
without a worker keeps serving requests but never prunes anything; the Helm
chart and `docker-compose.yml` both ship a worker. Two workers are safe — every
task takes a Postgres advisory lock before it runs.

Two tables are deliberately **not** pruned: `AuditEvent` (the compliance
trail, including the IP/user-agent written when a share link is opened) and
`ComparisonOutcomeEvent` (the trend/flake history, attributed by project name).
Both are append-only and grow with usage; size the database accordingly, or
archive/purge them on your own schedule if a retention policy requires it.
Everything else has a configurable window (`RUN_HISTORY_RETENTION_DAYS`, `JOB_RETENTION_DAYS`,
`WEBHOOK_DELIVERY_RETENTION_DAYS`, `BRANCH_RETENTION_DAYS`, session expiry, 7 days for
expired share links).

`BRANCH_RETENTION_DAYS` is **off by default (0)** and the most destructive of the
windows: it deletes a non-default branch — with its tests, comparisons, runs and
their evidence — once it has seen no upload for that many days. Branches with an
unreviewed comparison and archived branches are never collected. Read
[branches.md](branches.md#cleaning-up-branches-nobody-uses-any-more) before
turning it on; the project settings dialog's dry run shows the set it would
delete now.

## Database Time Zone

The schema stores timestamps as `timestamp(3)` without a zone and writes UTC from
the application, while several maintenance queries compare with `NOW()`. Run
Postgres with `timezone = UTC` (the default in the shipped images and compose
stack) — a non-UTC server session makes "older than N minutes/hours" predicates
drift by the offset. Do not set `TZ` on the database to a local zone.

## Encryption at Rest

`TOTP_ENCRYPTION_KEY` encrypts every user's TOTP seed with AES-256-GCM (the
32-byte key is derived from it with SHA-256; a stored seed is
`v1:<iv>:<tag>:<ciphertext>`). It is required: `docker compose` refuses to start
without it and the API fails env validation. Generate one with
`openssl rand -hex 32` (install.sh generates it for a new installation).

Keep it stable. A different key cannot decrypt existing seeds, and such a login
fails closed instead of ignoring the second factor. Seeds written before
encryption existed are read as plaintext and re-encrypted on the next successful
TOTP login, so an upgrade does not lock anyone out. Rotating the key means
re-enrolling TOTP for every user.

## Object Storage Bucket

`RUSTFS_BUCKET` must be **exclusive to this installation**. The daily sweep lists
the whole bucket and deletes objects that no row references; it now only
considers keys matching the names this application writes
(`<sha256>-<uuid>.<png|pdf>` and `<sha256>-<uuid>.diff.<png|pdf>`), so foreign
objects are skipped and logged rather than deleted. Still, pointing two
installations at one bucket means each one sees the other's objects as
unreferenced and the log fills with warnings — use one bucket per installation.

## Backups

The product ships no backup automation. Whatever secures the data sits below the
application, and it has to cover **both** stores at the same point in time:

- **PostgreSQL** — projects, tests, comparisons, runs, audit trail: a host or
  volume snapshot, or the provider's automated backup of the instance.
- **Object storage** (`RUSTFS_BUCKET`) — screenshots, PDFs, diff images: the
  bucket volume snapshot, taken with the database.

Restoring one without the other does not work: a database restored against an
older bucket leaves every row pointing at a missing object, and a newer bucket
against an older database leaves objects the daily unreferenced sweep then
deletes. A `pg_dump` plus an object copy of the bucket is enough for a
self-managed host; schedule both and restore once into a scratch stack to prove
the pair still matches.

## k3s Quickstart

For a single-node cluster on a fresh VM:

```bash
./deploy/scripts/setup-k3s.sh
```

This installs k3s, creates the `vrt` namespace and secrets (interactive), and prints the `/etc/hosts` lines you need. Then continue with **Option A** or **Option B** above.

## Secrets

Credentials live in the `vrt-secrets` Kubernetes secret, populated from the Helm chart's `secrets.*` values:

| Secret key                 | Value                                      |
| -------------------------- | ------------------------------------------ |
| `postgres_user`            | `vrt`                                      |
| `postgres_password`        | your password (CHANGE_ME in values.yaml)   |
| `postgres_db`              | `vrt`                                      |
| `rustfs_access_key`        | `rustfsadmin`                              |
| `rustfs_secret_key`        | your key (CHANGE_ME in values.yaml)        |
| `bootstrap_admin_username` | optional — first admin username            |
| `bootstrap_admin_password` | optional — first admin password            |
| `admin_api_key`            | optional — enables the DLQ admin endpoints |
| `metrics_api_key`          | optional — enables the metrics endpoint    |

**Never commit real credentials** — `values.yaml` ships `CHANGE_ME` placeholders, and the root `.gitignore` already excludes `values.local.yaml` for local overrides.

### First login

A fresh install has no user accounts. Set both bootstrap values (in `values.local.yaml` or via `--set` before installing) to create the first admin:

```bash
helm upgrade --install vrt deploy/charts/vrt --namespace vrt --create-namespace \
  --set secrets.bootstrap_admin_username=admin \
  --set secrets.bootstrap_admin_password='<strong-password>'
```

The bootstrap runs only when **both** `secrets.bootstrap_admin_username` and `secrets.bootstrap_admin_password` are non-empty, and creates that user as `ADMIN`. Log in, open **Users** to create the team (roles ADMIN/MEMBER/VIEWER), then remove both values and roll the backend so the credentials no longer live in the release. An upgraded installation promotes its oldest existing user to `ADMIN` once.

Set `AUTH_COOKIE_SECURE=true` in every production deployment served over TLS (the production env example already does); the session cookie is then HTTPS-only. Session cookies are `HttpOnly` + `SameSite=Lax`, and the auth guard rejects cross-site writes whose `Origin` does not match `Host`. The backend warns at startup when it runs with `NODE_ENV=production` and this flag is unset: the cookie is then only `Secure` on requests that arrive over TLS, which is easy to get wrong behind a proxy.

`admin_api_key` and `metrics_api_key` are optional: set them to enable the DLQ admin and metrics endpoints, leave them empty to keep those endpoints disabled.

---

## Connect to an Existing PostgreSQL Instance

Instead of letting the stack spin up its own Postgres container, you can point the services at any existing PostgreSQL 16+ instance.

### 1. Create an empty database

```sql
CREATE DATABASE vrt;
```

The schema is created automatically by the `db-migrate` job via `prisma migrate deploy` before the backend starts — no manual migration step needed.

### Upgrading across a breaking migration

Most migrations are additive, and a plain `helm upgrade` is fine. A migration that
drops or rewrites a column the previous version still uses is a different matter:
the `db-migrate` job runs as a `pre-upgrade` hook, i.e. **while the old pods are
still serving**, so the old version starts failing as soon as it migrates.

Branch support (ADR-027) is such a release: it drops `UnifiedTest.projectId`, and
that break is accepted on purpose. Stop the old writers first, then upgrade:

```bash
kubectl -n vrt scale deploy/backend deploy/worker --replicas=0
helm upgrade --install vrt deploy/charts/vrt --namespace vrt -f values.yaml
```

The chart restores the configured replica counts, so the new version comes up
after the migration. If the HPA is enabled, disable it for the upgrade (or set
its `minReplicas` to 0) so it does not scale the old pods back up. Expect a short
5xx window while the deployments swap.

The same pattern applies to any future migration that is not backward compatible;
the alternative (expand/contract over two releases) is described in ADR-027 and
was rejected for this one.

### 2. Set environment variables

| Variable            | Example                                                  |
| ------------------- | -------------------------------------------------------- |
| `POSTGRES_HOST`     | `db.example.com`                                         |
| `POSTGRES_PORT`     | `5432`                                                   |
| `POSTGRES_USER`     | `myuser`                                                 |
| `POSTGRES_PASSWORD` | `mypassword`                                             |
| `POSTGRES_DB`       | `vrt`                                                    |
| `DATABASE_URL`      | `postgresql://myuser:mypassword@db.example.com:5432/vrt` |

Both `POSTGRES_*` (used by the Prisma CLI config) and `DATABASE_URL` (used by the runtime `PrismaConnection`) must be set and agree.

### 3. Adapt docker-compose.yml (Docker only)

When using an external database, the built-in `postgres` and `db-migrate` services are no longer needed. Remove or disable them:

```yaml
services:
  # Remove:
  # postgres:
  #   ...
  # db-migrate:
  #   ...

  backend:
    depends_on:
      # db-migrate:              # remove
      #   condition: service_completed_successfully
      # postgres:                 # remove
      #   condition: service_healthy
      rustfs:
        condition: service_healthy

  worker:
    depends_on:
      # db-migrate:
      #   condition: service_completed_successfully
      # postgres:
      #   condition: service_healthy
      rustfs:
        condition: service_healthy
```

Then override the `x-app-env` anchor values at runtime via environment variables or a `.env` file.

### 4. Important notes

- The migration job **creates its own tables** (`UnifiedTest`, `UnifiedVariant`, `UnifiedScreenshot`, `UnifiedComparison`, `ComparisonJob`) in the target database. It does not touch other databases or schemas.
- Table name collisions are possible if the target database already has tables with those names. Use a dedicated database (via `CREATE DATABASE vrt`) to avoid conflicts.
- The object storage (RustFS / S3-compatible) is configured separately via `RUSTFS_*` env vars.

---

## Upgrading the Bundled PostgreSQL (16 → 18)

The chart and Docker Compose both ship `postgres:18-alpine`. PostgreSQL 18 stores
data in a per-major-version directory (`/var/lib/postgresql/18/docker`), so the
chart mounts the PVC at `/var/lib/postgresql` — **not** the old
`/var/lib/postgresql/data`. A PostgreSQL 18 server cannot open a 16 data
directory, and the change of mount path means the old volume is not reusable
as-is.

**Fresh installs need nothing.** For an existing PostgreSQL 16 install, choose one:

- **Keep the old database** — point the stack at it as an external instance (see
  [Connect to an Existing PostgreSQL Instance](#connect-to-an-existing-postgresql-instance))
  and set `postgres.enabled=false`. This avoids any data migration.
- **Dump and restore** (simplest, storage-agnostic):

  ```bash
  # against the existing 16 instance
  pg_dump -Fc -h <old-host> -U vrt vrt > vrt.dump
  # scale the app down, deploy the new 18-backed chart, then restore
  # --no-owner --no-privileges avoids errors when the target role differs
  pg_restore -h <new-host> -U vrt -d vrt --no-owner --no-privileges vrt.dump
  ```

- **`pg_upgrade --link`** — the supported in-place path, but it requires both the
  16 and 18 binaries and the volume layout from the 18+ image
  (`/var/lib/postgresql/<major>/docker`). See the [postgres image notes](https://github.com/docker-library/postgres/issues/37).

For local Docker Compose, `./scripts/dev.sh delete` removes the `pgdata` volume
so the stack re-initialises on 18.

---

## CI/CD Flow

On every push to `main` or `develop`, GitHub Actions runs tests (unit + e2e) automatically.

Releases are cut from [Conventional Commits](https://www.conventionalcommits.org/) by release-please: it maintains a release PR, and merging that PR creates a `vX.Y.Z` tag and a GitHub Release. The same workflow run then builds and pushes every image tagged `X.Y.Z` to GHCR, updates the `tag:` values in `deploy/charts/vrt/values.yaml` and the chart's `appVersion` (ArgoCD picks them up automatically).

The client SDK is a **second release line**: release-please manages `client-sdk` as its own package in [`release-please-config.json`](../release-please-config.json), with its own version, changelog and tag (`vrt-client-vX.Y.Z`). A platform release does not publish it — only a release for the `client-sdk` path does, and that run publishes `@fishkob/vrt` to npm and attaches the same package to the client release as an offline tarball ([ADR-069](adr/ADR-069-independent-client-version.md)).

The release run re-runs the backend and frontend lint, typecheck, and unit tests before building, so an image is never published from untested code.

Images are pushed to (resolved from the repository owner, e.g. `ghcr.io/<owner>/...`):

- `ghcr.io/<owner>/visual-regression-backend`
- `ghcr.io/<owner>/visual-regression-frontend`
- `ghcr.io/<owner>/visual-regression-worker`
- `ghcr.io/<owner>/pdf-sidecar`
- `ghcr.io/<owner>/visual-regression-migrate`

The Helm chart's `registry` value (default `ghcr.io`) and `imageOwner` value (default `fishkob`) build the image path. Forks that publish their own images override `imageOwner` via `--set imageOwner=<fork-owner>`; to pull from a different registry, override `registry` too (or set both in the chart values in ArgoCD).

> **Release prerequisites (repository settings):** enable _Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"_ so release-please can open its release PR — the chart bump needs it too, it opens `chore/chart-images-<version>` with the same token. Workflow runs on that PR start in an approval-required state, so a maintainer must approve them before the PR's CI runs (the release run re-tests before publishing regardless). The `bump-chart` job does **not** push to `main`: the `main` ruleset requires a pull request plus the two CI gates and grants no bypass, so the bump opens its pull request and queues a squash auto-merge. The ruleset also requires a branch to be up to date with `main`, and GitHub will not update it for you: if another pull request lands while the bump is queued, the auto-merge stays parked until someone updates the branch (`allow_update_branch` must be on, or use a merge queue in the ruleset).
>
> Publishing the client SDK to npm needs an `NPM_TOKEN` secret: a granular access token with read and write access to the `@fishkob` scope (classic tokens no longer exist, and a write-enabled granular token expires within 90 days — switch the package to trusted publishing once it exists). Without the secret the client release step warns and skips the publish, and the tarball is still attached to the client release.

### Re-running a failed release build

Re-run the failed jobs of the release run (**Actions → Release → the failed run → Re-run failed jobs**). That keeps `ref` at the release tag, so the images and the chart bump describe the commit the tag points at.

If the run is gone, dispatch **Actions → Release Images → Run workflow** with the tag as `ref` (e.g. `v4.0.0`). The workflow rejects a branch, and rejects a tag whose `package.json` version does not match the tag name, so a released version can no longer be republished from newer `main`.

## Serving Screenshots (RustFS must be browser-reachable)

The frontend loads screenshots directly from RustFS (`<img :src="imageUrl">`) — the backend does **not** proxy images. So the browser must be able to reach RustFS:

- `RUSTFS_PUBLIC_URL` must be a **browser-reachable base URL without the bucket** — the backend appends `/bucket/<object>` itself. `http://rustfs:9000/vrt` would produce the broken double-bucket URL `http://rustfs:9000/vrt/vrt/<object>`.
- In the Helm chart, set `rustfsHost` (default `rustfs.vrt.local`). The ingress routes that host to the RustFS service, and both the backend and worker get `RUSTFS_PUBLIC_URL=http://<rustfsHost>` from it.
- **DNS required**: `rustfs.vrt.local` must resolve for users (wildcard `*.vrt.local` or an `/etc/hosts` entry on test machines). Without it, images won't load even though the deployment is healthy.
- The chart's NetworkPolicy must allow the ingress controller to reach RustFS — `allow-ingress-to-rustfs` is included by default.

## Manual Image Tag Update

The release pipeline sets the image tags automatically. To override a released version (e.g. for a hotfix or rollback), edit the Helm values file:

```bash
nano deploy/charts/vrt/values.yaml
```

Set the `tag:` under each entry in `images:` to a released version such as `1.2.3`, then commit — ArgoCD reconciles it. This override lasts only until the next release, which rewrites every `tag:`; for a durable pin, set the tags from ArgoCD or revert the release commit. A released tag stays pullable: the weekly cleanup deletes only **untagged** versions — the leftovers of a rebuilt release, which nothing but a digest can reach — and never a tagged one. It keeps the newest 5 of those; a manual _Actions → Cleanup old images → Run workflow_ overrides the number.

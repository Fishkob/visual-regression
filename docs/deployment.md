# Deployment on Kubernetes

Deploys the full stack (backend, worker, frontend, pdf-sidecar, PostgreSQL, RustFS) into a Kubernetes cluster via the Helm chart in `deploy/charts/vrt/`, including an ingress, optional HPA/PDB, NetworkPolicy, and a `db-migrate` job that applies the schema before the backend starts.

> **Not using Kubernetes?** For a single-host production-like setup, use Docker Compose instead: `./scripts/dev.sh docker` (see the root README).

## Prerequisites

- A Kubernetes cluster (e.g. k3s, kind, managed cloud) with a `kubectl` context
- **Helm 3** (for the direct Helm path) and/or **ArgoCD** (for the GitOps path)
- An ingress controller (default NetworkPolicy allows `traefik`)
- **DNS** for the ingress hosts: `vrt.local` (frontend) and `rustfs.vrt.local` (RustFS) must resolve to the cluster — wildcard `*.vrt.local` or `/etc/hosts` entries on test machines. Without DNS, the frontend loads but screenshot images do not.
- Pull access to the images on GHCR (`ghcr.io/fishkob/*`). For private repositories, set `secrets.ghcr_pull_secret` (a base64 Docker config) or export `GHCR_TOKEN` for `deploy.sh`.
- PostgreSQL 16+ (a chart-internal Postgres is included; an existing external instance can be used instead — see below)

## Two Deployment Paths

### Option A: Helm directly (no ArgoCD)

```bash
# Set image-pull credentials (skip if the GHCR images are public)
export GHCR_TOKEN=<PAT with read:packages>

# Override default secrets before deploying (values.yaml ships CHANGE_ME placeholders)
helm upgrade --install vrt deploy/charts/vrt --namespace vrt --create-namespace \
  --set secrets.postgres_password=<strong-password> \
  --set secrets.rustfs_secret_key=<strong-key>
```

Or use the wrapper that applies the secrets automatically:

```bash
export GHCR_TOKEN=<PAT with read:packages>
./deploy/scripts/deploy.sh
```

### Option B: ArgoCD (GitOps)

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

# Deploy the Visual Regression Application
kubectl apply -f deploy/argocd/app.yaml
```

The ArgoCD `Application` tracks `main` and syncs `deploy/charts/vrt` automatically. ArgoCD applies the chart's `values.yaml` (image tags are updated there by the Manual Deploy workflow). Get the admin password and port-forward the UI:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open https://localhost:8080 — user: admin
```

> For ArgoCD, set secrets via the chart `values.yaml` (or `values.local.yaml`) rather than `--set` — ArgoCD syncs the chart values from the repo.

## k3s Quickstart

For a single-node cluster on a fresh VM:

```bash
./deploy/scripts/setup-k3s.sh
```

This installs k3s, creates the `vrt` namespace and secrets (interactive), and prints the `/etc/hosts` lines you need. Then continue with **Option A** or **Option B** above.

## Secrets

Credentials live in the `vrt-secrets` Kubernetes secret, populated from the Helm chart's `secrets.*` values:

| Secret key          | Value                                    |
| ------------------- | ---------------------------------------- |
| `postgres_user`     | `vrt`                                    |
| `postgres_password` | your password (CHANGE_ME in values.yaml) |
| `postgres_db`       | `vrt`                                    |
| `rustfs_access_key` | `minioadmin`                             |
| `rustfs_secret_key` | your key (CHANGE_ME in values.yaml)      |
| `ghcr_pull_secret`  | Docker config JSON for image pulls       |

**Never commit real credentials** — `values.yaml` ships `CHANGE_ME` placeholders, and the root `.gitignore` already excludes `values.local.yaml` for local overrides.

---

## Connect to an Existing PostgreSQL Instance

Instead of letting the stack spin up its own Postgres container, you can point the services at any existing PostgreSQL 16+ instance.

### 1. Create an empty database

```sql
CREATE DATABASE vrt;
```

The schema is created automatically by the `db-migrate` job via `prisma migrate deploy` before the backend starts — no manual migration step needed.

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
- The object storage (RustFS / S3-compatible) is configured separately via `MINIO_*` env vars.

---

## CI/CD Flow

On every push to `main` or `develop`, GitHub Actions runs tests (unit + e2e) automatically.

Docker images are built and pushed to GHCR **manually** via the `Manual Deploy` workflow in GitHub Actions. After a successful build, the workflow updates `deploy/charts/vrt/values.yaml` with the new image SHA, which ArgoCD picks up automatically.

Images are pushed to (resolved from the repository owner):

- `ghcr.io/<owner>/visual-regression-backend`
- `ghcr.io/<owner>/visual-regression-frontend`
- `ghcr.io/<owner>/visual-regression-worker`
- `ghcr.io/<owner>/pdf-sidecar`

The worker and pdf-sidecar images are built whenever the target is `backend` or `both` — they are required for any comparison to run.

## Serving Screenshots (RustFS must be browser-reachable)

The frontend loads screenshots directly from RustFS (`<img :src="imageUrl">`) — the backend does **not** proxy images. So the browser must be able to reach RustFS:

- `MINIO_PUBLIC_URL` must be a **browser-reachable base URL without the bucket** — the backend appends `/bucket/<object>` itself. `http://rustfs:9000/vrt` would produce the broken double-bucket URL `http://rustfs:9000/vrt/vrt/<object>`.
- In the Helm chart, set `rustfsHost` (default `rustfs.vrt.local`). The ingress routes that host to the RustFS service, and both the backend and worker get `MINIO_PUBLIC_URL=http://<rustfsHost>` from it.
- **DNS required**: `rustfs.vrt.local` must resolve for users (wildcard `*.vrt.local` or an `/etc/hosts` entry on test machines). Without it, images won't load even though the deployment is healthy.
- The chart's NetworkPolicy must allow the ingress controller to reach RustFS — `allow-ingress-to-rustfs` is included by default.

## Manual Image Tag Update

If you need to manually update the image tag, edit the Helm values file:

```bash
# Edit the Helm values file
nano deploy/charts/vrt/values.yaml

# Update the image tag (e.g., to a specific SHA or 'latest')
```

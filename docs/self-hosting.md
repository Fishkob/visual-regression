# Running it on a host

The supported way to run the platform for a team. The installer (`./install.sh`)
builds the stack from this checkout and keeps its state in Docker volumes; this
page covers what changes when the install stops being a localhost demo. The
Kubernetes path has its own page: [deployment.md](deployment.md).

## What the installer starts

| Service     | Role                        | Host port                    | Reachable from  |
| ----------- | --------------------------- | ---------------------------- | --------------- |
| frontend    | UI + nginx proxy for `/api` | `${FRONTEND_PORT}` (80)      | any client      |
| backend     | REST API                    | `127.0.0.1:${BACKEND_PORT}`  | the host only   |
| worker      | comparisons, retention      | —                            | compose network |
| pdf-sidecar | renders PDF pages           | `127.0.0.1:3001`             | the host only   |
| postgres    | database                    | `127.0.0.1:5432`             | the host only   |
| rustfs      | object storage (S3 API)     | `127.0.0.1:9000`, UI `:9001` | the host only   |

Every port except the frontend's is bound to loopback on purpose: the backend
trusts one proxy hop, and the sidecar has no authentication of its own. The
public port is `FRONTEND_PORT`; the infrastructure ports are fixed in
[docker-compose.infra.yml](../docker-compose.infra.yml), so a Postgres or an
S3-compatible store already running on the host collides with them (see
[troubleshooting](#troubleshooting)).

Screenshots are the exception to "the frontend is enough": the browser loads
them **directly** from RustFS through a presigned URL, so the storage has to be
reachable from the user's browser even though its port is loopback-bound. That
is what the next section is about.

## Data

Two volumes hold everything:

- `pgdata` — the Postgres data directory: projects, tests, runs, comparisons,
  audit trail.
- `rustfsdata` — screenshots, PDFs and diff images.

Both are prefixed with the checkout directory's name, so a clone in
`visual-regression/` gets `visual-regression_pgdata`. `docker volume ls` shows
the real names (they end in `_pgdata` and `_rustfsdata`); `rustfslogs` holds the
store's log and is disposable.

## Going beyond localhost

The defaults in `.env.example` describe `http://localhost`. For a host name and
TLS, four values change and one stays as it is:

| Setting              | Localhost default       | On a host                                        |
| -------------------- | ----------------------- | ------------------------------------------------ |
| `FRONTEND_PORT`      | `80`                    | `8080` when a reverse proxy owns 80/443          |
| `APP_PUBLIC_URL`     | `http://localhost`      | `https://vrt.example.com` (webhook/report links) |
| `RUSTFS_PUBLIC_URL`  | `http://localhost:9000` | `https://vrt-storage.example.com` (see below)    |
| `AUTH_COOKIE_SECURE` | `false`                 | `true` — makes the session cookie HTTPS-only     |
| `TRUST_PROXY`        | `true`                  | keep `true`; a proxy is still in front           |

`CORS_ORIGIN` stays at its default when the bundled nginx serves the UI: the
browser calls `/api` on the same origin, so there is no cross-origin request.
Change it only when the API is called directly from another browser origin (a
separate API host, or the Vite dev server on `:5173`).

The storage needs its own host because the API returns **presigned** URLs whose
SigV4 signature covers the `Host` header, and the review page renders them as
`<img src>`. The public URL must therefore be the exact origin the browser uses:
a path prefix does not work, because a proxy that strips it would change the
signed path. That has two consequences:

- an HTTPS UI needs an HTTPS storage origin, or the browser blocks the images as
  mixed content;
- the storage host must resolve for the user, not only for the containers.

The full rule (no bucket name in the value, `/bucket/<object>` is appended) is in
[serving screenshots](deployment.md#serving-screenshots-rustfs-must-be-browser-reachable).

### Example: Caddy on the same host

Set `FRONTEND_PORT=8080` in `.env`, then:

```caddy
vrt.example.com {
	reverse_proxy 127.0.0.1:8080
}

vrt-storage.example.com {
	reverse_proxy 127.0.0.1:9000
}
```

Caddy obtains the certificates, preserves the incoming `Host` header — which is
exactly what RustFS verifies — and sets `X-Forwarded-For`/`-Proto`, which is what
`TRUST_PROXY` reads. With nginx the equivalent needs
`proxy_set_header Host $host;` — without it every presigned URL fails with
`SignatureDoesNotMatch`.

Then `./install.sh up` (Compose re-reads `.env`; `docker compose up -d` is
enough when only variables changed) and check from a **client** machine, not the
host:

1. `https://vrt.example.com` loads the UI;
2. the login sets a cookie with the `Secure` flag (devtools → Application →
   Cookies);
3. a screenshot opens from `https://vrt-storage.example.com/...` — right-click
   an image and open it in a new tab.

If the UI works but the images stay empty, the storage origin is what to debug;
`/health/ready` will not report it, because only the browser talks to RustFS.

Before the host is reachable from an untrusted network, work through the
[security checklist](deployment.md#security-checklist): secrets, the bootstrap
admin, `/docs`, and the object-store policy.

## Backups

The rule — database and bucket at the same point in time, or a restore points at
objects that are not there (and the next sweep deletes them) — is in
[deployment.md](deployment.md#backups). For Compose, the simple correct version
is a short stop:

```bash
./install.sh down
docker volume ls | grep -E 'pgdata|rustfsdata'   # confirm the real names

docker run --rm -v visual-regression_pgdata:/data -v "$PWD":/backup alpine \
  tar czf /backup/pgdata.tgz -C /data .
docker run --rm -v visual-regression_rustfsdata:/data -v "$PWD":/backup alpine \
  tar czf /backup/rustfsdata.tgz -C /data .

./install.sh up
```

Substitute the names `docker volume ls` printed. Keep both files: one without
the other is not a backup. A restore is the same in reverse (`tar xzf` into the
empty volumes) before `./install.sh up`; prove it once into a scratch checkout.

The product ships no backup automation, so scheduling this is yours.

## Upgrading and rolling back

```bash
./install.sh down                  # take the backup above first
git pull
./install.sh up                    # rebuild; db-migrate runs before the new backend
```

`db-migrate` is a one-shot Compose service that the backend and the worker wait
for (`service_completed_successfully`), so the schema is applied before either
starts. Most migrations are additive. A migration that drops or rewrites a
column the old version still reads needs the writers stopped first — the pattern
is in
[upgrading across a breaking migration](deployment.md#upgrading-across-a-breaking-migration);
in Compose that means `./install.sh down` before the upgrade, and a restore if it
went wrong, because there is no down migration.

Rolling back the code is `git checkout <previous-tag> && ./install.sh up`. That
does not roll back the schema: if the newer version migrated in a way the old one
cannot read, restore the backup instead.

`./install.sh --fresh` is not an upgrade: it runs `docker compose down -v`,
deletes both volumes, and installs clean. There is no confirmation.

## Troubleshooting

| Symptom                                        | Cause                                                  | Fix                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `Bind for 0.0.0.0:80 failed`                   | something else owns port 80                            | set `FRONTEND_PORT=8080` in `.env`, `./install.sh up`                                                                     |
| `Bind for 127.0.0.1:5432 failed`               | a local Postgres is running                            | stop it, or change the mapping in [docker-compose.infra.yml](../docker-compose.infra.yml) (no variable for the host port) |
| `Bind for 127.0.0.1:9000 failed`               | a local S3/MinIO/RustFS is running                     | stop it, or change the mapping in [docker-compose.infra.yml](../docker-compose.infra.yml)                                 |
| installer waits forever, backend never healthy | database or migration failed                           | `./install.sh logs backend db-migrate`                                                                                    |
| `P1000` after `.env` was regenerated           | the Postgres volume still holds the old password       | restore the old password, or `./install.sh --fresh` (data loss)                                                           |
| UI loads, screenshots stay empty               | storage URL unreachable, wrong scheme, or no DNS       | open the image URL directly; check `RUSTFS_PUBLIC_URL` and that the host resolves from the client                         |
| `SignatureDoesNotMatch` on an image            | a proxy rewrote the `Host` header or the path          | preserve both; see [going beyond localhost](#going-beyond-localhost)                                                      |
| browser console shows a CORS error             | API called from another origin                         | add that origin to `CORS_ORIGIN`                                                                                          |
| CI gets `401` / `403`                          | key missing, wrong scope, project not in the allowlist | [API key scopes](permissions.md), [authenticate](ci-integration.md#1-authenticate)                                        |
| a run stays `open` and the gate fails          | the finish call never ran                              | [runs and gates](ci-integration.md#3-runs-and-gates)                                                                      |

## Removing it

```bash
./install.sh down                    # stop, keep the data
docker compose down -v               # stop and delete the database and storage volumes
docker compose down -v --rmi local   # also remove the images built from this checkout
```

## Where to read next

- [README quick start](../README.md#quick-start) — install, first login, first upload
- [ci-integration.md](ci-integration.md) — keys, uploads, runs, gates
- [deployment.md](deployment.md) — Kubernetes, security checklist, rate limits, retention
- [local-development.md](local-development.md) — contributing to the platform

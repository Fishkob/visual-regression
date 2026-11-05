# Visual Regression Testing Platform

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/tests/quality/__screenshots__/visual-test-details-regions-dark.png">
  <img src="frontend/tests/quality/__screenshots__/visual-test-details-regions-light.png" alt="Review page for one test: the diff with its changed area highlighted, the mode bar (Diff marked, Side by Side, Diff Only, Overlay, Wipe, Blink), the Changed areas panel and the Skip/Approve footer" width="100%">
</picture>

Catch unintended visual changes before they reach production. Upload captures from
your CI pipeline, compare them against **branch-scoped baselines**, and approve a
change on a review page built for finding the one block that moved.

Self-hosted with `docker compose` — no cloud account, no per-snapshot billing.

## What it does

- **Review inbox** — every pending change across projects and branches in one
  queue, grouped, filterable, walkable with `A` / `S` / `Esc`.
- **Diff viewer** — marked, side-by-side, only-diff, overlay, wipe and blink, with
  zoom at the cursor and the changed areas listed next to the picture by size.
- **Branch-scoped baselines** — a feature branch inherits its target's baseline and
  only pins its own after the first approval.
- **CI gate** — uploads grouped into a Run, with `open`, `pending`, `failed` and
  `passed` as its state, plus JUnit / HTML / CSV reports.
- **Tolerances as code** — `.vrt.json` next to the tests, a per-variant threshold and
  a project default; a diff within tolerance is auto-accepted, and approval stays
  the only writer of a baseline.
- **Trust** — baseline history with restore, an audit trail, a 4-eyes approval
  policy, review comments and decision reasons.
- **Reach** — signed webhooks (Slack-ready) and read-only share links that show the
  actual pixels.
- **Image and PDF** share one pipeline; the UI is English and German, light and dark.

<table>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="frontend/tests/quality/__screenshots__/inbox-dark.png">
        <img src="frontend/tests/quality/__screenshots__/inbox-light.png" alt="Review inbox with pending changes grouped by project">
      </picture>
      <br><sub><b>Inbox</b> — the queue, grouped by project and branch</sub>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="frontend/tests/quality/__screenshots__/runs-dark.png">
        <img src="frontend/tests/quality/__screenshots__/runs-light.png" alt="Runs page listing CI runs with commit and status">
      </picture>
      <br><sub><b>Runs</b> — what a pipeline uploaded, and what the gate will wait for</sub>
    </td>
  </tr>
</table>

## Quick start

[Docker](https://docs.docker.com/get-docker/) with Compose v2 is the only
prerequisite (macOS, Linux, or Windows via WSL); the first build takes a few
minutes:

```bash
git clone https://github.com/Fishkob/visual-regression.git
cd visual-regression
./install.sh          # generates secrets, builds the stack, waits for health
./install.sh --seed   # optional: demo projects to click through (needs pnpm)
```

Open <http://localhost> and log in with the credentials the installer printed
(`admin` by default). The password is stored as `BOOTSTRAP_ADMIN_PASSWORD` in the
generated `.env` and should be removed after the first login. If port 80 is taken,
set `FRONTEND_PORT` in `.env` and rerun `./install.sh up`.

Day to day: `./install.sh up`, `down` and `logs` start, stop and tail the stack; an
upgrade is `git pull && ./install.sh up` — the migration job runs before the new
backend. `./install.sh --fresh` wipes the database and storage volumes and starts
clean.

Ports and the service layout: [docs/local-development.md](docs/local-development.md#ports).
Production setup (TLS, reverse proxy, backups, Kubernetes):
[docs/deployment.md](docs/deployment.md).

## Wire it into CI

Create an API key under **API keys** in the dashboard and store it as a repository
secret ([scopes and rotation](docs/ci-integration.md#1-authenticate)). The
repository ships a composite action, so a pipeline needs no SDK. The example pins
the `v1.4.0` tag; use the release you deploy:

```yaml
- uses: Fishkob/visual-regression@v1.4.0
  with:
    api-url: https://vrt.example.com
    api-key: ${{ secrets.VRT_API_KEY }}
    project: checkout
    test: login
    file: artifacts/login.png
    viewport: 1920x1080
    browser: Chromium
    environment: staging
```

The project and the test are created by the first upload, so `project` and `test`
are names you choose. The step fails when the capture needs review or the
comparison fails. Set `run-key` to gate on a whole run instead of one file, or use
the Playwright reporter that uploads every screenshot attachment for you. Both,
plus the raw upload/wait API and the report formats:
[docs/ci-integration.md](docs/ci-integration.md).

## How it works

1. **Upload** — CI sends a capture (or a manifest of many) to
   `/api/v1/projects/:project/tests/:test/upload`.
2. **Compare** — the API queues a job; the worker diffs the capture against the
   variant's baseline (pixelmatch, or the PDF sidecar) and stores the diff.
3. **Review** — a change becomes a pending comparison in the inbox; approve,
   comment or skip.
4. **Approve** — the capture becomes the baseline, the outgoing one is kept as
   revision for restore, and the change reaches the audit trail and the webhooks.

More detail and diagrams: [docs/architecture/overview.md](docs/architecture/overview.md).

## Documentation

| I want to…                                         | Read                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| put it into a pipeline                             | [docs/ci-integration.md](docs/ci-integration.md)       |
| run it locally / contribute                        | [docs/local-development.md](docs/local-development.md) |
| deploy it (Kubernetes, TLS, backups, secrets)      | [docs/deployment.md](docs/deployment.md)               |
| know what the test suites cover                    | [docs/testing.md](docs/testing.md)                     |
| send review events somewhere                       | [docs/webhooks.md](docs/webhooks.md)                   |
| understand roles, keys and API scopes              | [docs/permissions.md](docs/permissions.md)             |
| understand a term (`Variant`, `Run`, `Threshold`…) | [CONTEXT.md](CONTEXT.md)                               |
| see why something is the way it is                 | [docs/adr/](docs/adr/) — 53 decision records           |
| know what is next                                  | [docs/roadmap.md](docs/roadmap.md)                     |

## Status

Released as `v1.4.0`; the changelog is generated from conventional commits and
every release is a semver tag. The local gate
(`./scripts/verify.sh`) runs lint, typecheck, the backend and frontend unit suites
with a per-layer coverage gate, the i18n parity check and the SDK drift check;
`--with-e2e` and `--with-browser` add the HTTP and Playwright suites, and
`--with-quality` the visual and accessibility runs in the quality image.

The screenshots above are that suite's own baselines: the gallery renders every
page in light and dark and scans it with axe, so the pictures here cannot silently
drift from the app — and `gallery-coverage.test.ts` fails the unit suite for a
route that has no case. Suite layout and coverage rules:
[docs/testing.md](docs/testing.md).

## Security Considerations

This platform is built to run in a **private/trusted network**:

- Browsers authenticate with a session cookie, CI with an API key. Key management
  (create, rotate, revoke) is session-only, so a leaked CI key cannot mint a new one.
- `POST /admin/api-keys` and `/admin/dlq` sit outside the product auth surface and
  are protected by `ADMIN_API_KEY`, so the first key can be provisioned before any
  credential exists. They, `/metrics` and `/health` are token-guarded and rate-limited.
- Screenshots and PDFs are served as short-lived presigned URLs; the bucket needs no
  anonymous access.
- Webhook endpoints are admin-only and pass an SSRF guard (loopback, link-local and
  cloud-metadata are refused; RFC1918 is allowed on purpose for self-hosting).
- Rate limits cover uploads, login, log ingestion and the operator surfaces; see
  [docs/deployment.md](docs/deployment.md) for `TRUST_PROXY`, CORS, session lifetime
  and the rest of the production checklist.

Vulnerability reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

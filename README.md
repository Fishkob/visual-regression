# Visual Regression Testing Platform

[![CI (Backend)](https://github.com/Fishkob/visual-regression/actions/workflows/ci-backend.yml/badge.svg?branch=main)](https://github.com/Fishkob/visual-regression/actions/workflows/ci-backend.yml)
[![CI (Frontend)](https://github.com/Fishkob/visual-regression/actions/workflows/ci-frontend.yml/badge.svg?branch=main)](https://github.com/Fishkob/visual-regression/actions/workflows/ci-frontend.yml)
[![Latest release](https://img.shields.io/github/v/release/Fishkob/visual-regression)](https://github.com/Fishkob/visual-regression/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Catch unintended visual changes before they reach production. Upload captures from
your CI pipeline, compare them against **branch-scoped baselines**, and approve a
change on a review page built for finding the one block that moved.

Built for a **private network** — you run it inside your own infrastructure, one
operator and one trust domain, on `docker compose` or Kubernetes. Every signed-in
user can read every project by design: per-team isolation is deliberately not a
boundary, so the host, the network path and TLS are yours to own
([SECURITY.md](SECURITY.md)). No cloud account, no per-snapshot billing.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/tests/quality/__screenshots__/visual-test-details-regions-dark.png">
  <img src="frontend/tests/quality/__screenshots__/visual-test-details-regions-light.png" alt="Review page for one test: the diff with its changed area highlighted and numbered, the mode bar (Diff marked, Side by Side, Diff Only, Overlay, Wipe, Blink) and the Skip/Approve footer" width="100%">
</picture>

## What it does

- **Review inbox** — every pending change across projects and branches in one
  queue, grouped and filterable.
- **Diff viewer** — marked, side-by-side, only-diff, overlay, wipe and blink, with
  zoom at the cursor, the changed areas numbered on the picture and `n`/`p` to
  step through them. Decide from the keyboard: `A` approves, `S` skips, `Esc`
  goes back.
- **Branch-scoped baselines** — a feature branch inherits its target's baseline and
  only pins its own after the first approval.
- **CI gate** — uploads grouped into a Run, with `open`, `pending`, `failed` and
  `passed` as its state, plus JUnit / HTML / CSV reports.
- **Tolerances as code** — `.vrt.json` next to the tests, a per-variant threshold and
  a project default; a diff within tolerance is auto-accepted, and approval stays
  the only writer of a baseline.
- **Trust** — baseline history with restore, an audit trail, review comments
  and decision reasons.
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
        <img src="frontend/tests/quality/__screenshots__/runs-light.png" alt="Runs page listing CI runs by run key with branch, commit and finish time">
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

## Wire it into your project

The platform keeps the baselines; your tests keep producing the pixels. Nothing
goes into the application — a capture is a screenshot your test already takes,
and it is sent only when the test hands it to the client.

**1. Give CI a key.** Create one under **API keys** in the dashboard and store it
as a pipeline secret. `upload` sends captures; gating a run also reads its status
(`read`) and finishes it (`admin`) —
[scopes and rotation](docs/ci-integration.md#1-authenticate).

**2. Create the client next to your tests.** The client ships a Playwright helper
that uploads what the test captures — no reporter, no attachments, one call in
the test. It is on npm as `@fishkob/vrt` and has its own version line — it speaks
`/api/v1`, so it is not tied to a platform release
([client SDK](client-sdk/README.md#playwright-captures)):

```bash
npm i @fishkob/vrt
```

```ts
// tests/vrt.ts
import { createVrt } from "@fishkob/vrt/playwright";

export const vrt = createVrt({
  apiUrl: "https://vrt.example.com/api/v1",
  apiKey: process.env.VRT_API_KEY!,
  project: "checkout",
  branch: process.env.CI_BRANCH || "main",
  viewport: "1920x1080",
  browser: "chromium",
  environment: "staging",
  runKey: process.env.CI_RUN_ID, // groups this pipeline's uploads
});
```

**3. Capture in the test.** One call inside the test you already have:

```ts
// checkout.spec.ts
import { test } from "@playwright/test";
import { vrt } from "./vrt";

test("cart summary", async ({ page }, testInfo) => {
  await page.goto("/cart");
  await vrt.capture(testInfo, page);
});
```

The capture is named after the test's title path, reduced to the characters a
name may use (`checkout.spec.ts / cart summary` becomes
`checkout-spec-ts-cart-summary`, at most 100 characters); its first upload
creates the project, the branch and the baseline, later captures are compared
against it. The project name is yours. `viewport`, `browser` and `environment`
are the Variant — matched verbatim, case included, so a changed value is a new
baseline that passes without comparing. A buffer or a PDF works the same way:
`vrt.capture(testInfo, await page.pdf(), { kind: "pdf" })`. Any other stack posts
the same fields to `/api/v1/projects/:project/tests/:test/upload?testKind=image`
([curl](docs/ci-integration.md#2-upload-and-wait)).

**4. Gate the run and decide what reaches the instance.** The upload only queues
the comparison, so no test can assert on it: with a `runKey` set, close the run
after the test command and fail the job unless its state is `passed` — a
reviewer's approval in the inbox is what lets the next run through
([runs and gates](docs/ci-integration.md#3-runs-and-gates)). Without a `runKey`,
gate on the job wait the upload returns instead.

The `capture` call is the only thing that sends: leave it out for a test, call
it from an `afterEach` that skips expected results to upload failures only, or
make the client conditional on the key to keep a whole pipeline off
([turning uploads off](docs/ci-integration.md#turning-uploads-off)). Narrowing on
the instance side happens at the key: its scopes and its `projectNames` allowlist
decide what may be uploaded ([permissions](docs/permissions.md)). An upload never
fails the test run either: a wrong key or an unreachable instance ends up in the
result and `onUpload`, not in the exit code.

## How it works

1. **Upload** — CI sends a capture (or many, into one run) to
   `/api/v1/projects/:project/tests/:test/upload`.
2. **Compare** — the API queues a job; the worker diffs the capture against the
   variant's baseline (pixelmatch, or the PDF sidecar) and stores the diff.
3. **Review** — a change becomes a pending comparison in the inbox; approve,
   comment or skip.
4. **Approve** — the capture becomes the baseline, the outgoing one is kept as
   revision for restore, and the change reaches the audit trail and the webhooks.

More detail and diagrams: [docs/architecture/overview.md](docs/architecture/overview.md).

## Documentation

| I want to…                                         | Read                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| put it into a pipeline                             | [docs/ci-integration.md](docs/ci-integration.md)                  |
| switch uploads off in a pipeline                   | [turning uploads off](docs/ci-integration.md#turning-uploads-off) |
| clean up a branch after its merge                  | [docs/branches.md](docs/branches.md)                              |
| run it locally / contribute                        | [docs/local-development.md](docs/local-development.md)            |
| deploy it (Kubernetes, TLS, backups, secrets)      | [docs/deployment.md](docs/deployment.md)                          |
| know what the test suites cover                    | [docs/testing.md](docs/testing.md)                                |
| send review events somewhere                       | [docs/webhooks.md](docs/webhooks.md)                              |
| understand roles, keys and API scopes              | [docs/permissions.md](docs/permissions.md)                        |
| understand a term (`Variant`, `Run`, `Threshold`…) | [CONTEXT.md](CONTEXT.md)                                          |
| see why something is the way it is                 | [docs/adr/](docs/adr/) — 68 decision records                      |
| know what is next                                  | [docs/roadmap.md](docs/roadmap.md)                                |

## Status

Every release is a semver tag and the **Latest release** badge above shows the
newest; the changelog is generated from conventional commits. The local gate
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

The **single, trusted operator network** stated at the top is a product decision,
not an oversight; [SECURITY.md](SECURITY.md) records the full threat model, what is
explicitly out of scope, and the disclosure process.

- Browsers authenticate with a session cookie, CI with an API key. Key management
  (create, rotate, revoke) is session-only, so a leaked CI key cannot mint a new one.
- `POST /admin/api-keys` and `/admin/dlq` sit outside the product auth surface and
  are protected by `ADMIN_API_KEY`, so the first key can be provisioned before any
  credential exists. They, `/metrics` and `/health` are token-guarded and rate-limited.
- Screenshots and PDFs are served as short-lived presigned URLs; the bucket needs no
  anonymous access.
- Webhook endpoints are admin-only and pass an SSRF guard (loopback, link-local and
  cloud-metadata are refused; RFC1918 is allowed on purpose for self-hosting).
- Rate limits cover uploads, login, log ingestion and the operator surfaces.
- Release images and the npm package are built from a tag verified against
  `main` and published with provenance, an SBOM and a signed attestation.

Before exposing a deployment to an untrusted network, work through the
[security checklist](docs/deployment.md#security-checklist); it covers TLS and
the session cookie, secrets, the admin bootstrap and `/docs`. Release
verification is documented under
[verifying a release](docs/deployment.md#verifying-a-release).

Vulnerability reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

# Security Policy

## Reporting a Vulnerability

Report security issues through GitHub's **Private Vulnerability Reporting**
(Security tab → "Report a vulnerability") rather than opening a public issue:

<https://github.com/Fishkob/visual-regression/security/advisories/new>

If that form is unavailable, open an issue that asks for a private channel and
contains **no details**, and a maintainer will follow up.

In your report, include:

- Which version / commit you are running (`/api/v1/health` reports both)
- A description of the vulnerability and its impact
- Steps to reproduce, or a minimal proof of concept
- Any relevant configuration (deployment mode, reverse proxy, TLS, network)

### What to expect

| Stage                                                          | Target           |
| -------------------------------------------------------------- | ---------------- |
| Acknowledgement                                                | 2 business days  |
| Assessment and severity, or a request for more information     | 10 business days |
| Fix or mitigation for a confirmed issue in a supported version | 90 days          |

We work to a **coordinated disclosure** window of 90 days: a confirmed issue is
fixed and released, and the advisory is published with credit, before the
details go public. If a fix takes longer, we say so and agree a new date with the
reporter rather than asking for an open-ended silence. Reporters are free to
publish once the window has elapsed or a fix has shipped, whichever comes first.

## Supported Versions

The latest `main` branch and the most recent tagged release receive security
fixes. Older releases are not patched — upgrade to the latest one. The client SDK
(`@fishkob/vrt`) and the container images follow their own release lines and are
supported the same way: latest release only.

## Threat Model

The platform is a **self-hosted, single trust domain** product. Its threat model
is defined by these assumptions; a deployment that breaks one of them is outside
what the code protects against.

**What is assumed**

- The operator controls the host, the database, the object store and the
  network path, and keeps the deployment patched.
- Every signed-in user is **trusted to read every project**. Roles (`ADMIN`,
  `MEMBER`, `VIEWER`) are global (see [docs/permissions.md](docs/permissions.md));
  per-project isolation between mutually distrusting teams is **not** a security
  boundary. The only per-project restriction is an API key's allowlist.
- The network between browser, backend, database and object store is trusted, or
  is made trustworthy with TLS. Screenshots, baselines and PDFs are usually
  proprietary, so a deployment reachable from an untrusted network needs TLS.

**What is protected**

- Credentials at rest: session tokens, API keys and share tokens are stored as
  hashes; passwords use scrypt. A database dump does not hand out sessions or
  API keys.
- Browser sessions: `HttpOnly` + `SameSite=Lax` cookies, an `Origin`/
  `Sec-Fetch-Site` check on every unsafe request, a sliding idle timeout with an
  absolute cap, and a `Secure` flag that is on by default in production.
- Stored files: the bucket needs no anonymous access; the API returns
  short-lived presigned URLs, and a download is only served for a URL already
  attached to the test being read.
- Operator surfaces: `/metrics`, `/health`, `/admin/api-keys` and `/admin/dlq`
  are token-guarded and rate-limited; `/docs` is off in production.
- Untrusted input: uploads are limited by size, signature and pixel budget, PDF
  page geometry is validated before rasterization, and the sidecar that parses
  PDFs has no authentication of its own and is therefore loopback-bound in the
  bundled stack.

**Out of scope**

- An operator or administrator acting against their own deployment (they can
  read the database, the bucket and the signing keys).
- Denial of service beyond the documented rate limits and size caps.
- Vulnerabilities in third-party components — report those upstream; we track
  them through Dependabot, OSV and Trivy.
- Anything that requires the attacker to already control the host, the container
  runtime or the deployment's secrets.

## Internet-Facing Deployments

The bundled Compose stack is a plain-HTTP localhost installer. Before exposing a
deployment to an untrusted network, work through the checklist in
[docs/deployment.md](docs/deployment.md#security-checklist): TLS **and**
`AUTH_COOKIE_SECURE=true`, generated secrets for every credential, a non-default
admin password, no `/docs`, backups of the database and the bucket, and log
access treated as data access (request logs can contain presigned URLs).

## Supply Chain of This Repository

The repository is public, and the artifacts are built here — so the chain from
commit to artifact is part of the policy:

- Every third-party action is pinned to a commit SHA; `zizmor` and `actionlint`
  run on every change to `.github/`.
- Release images and the npm package are built from a tag that must be an
  ancestor of `main`, and carry SLSA provenance, an SPDX SBOM and a Sigstore
  attestation. See [docs/deployment.md](docs/deployment.md#verifying-a-release).
- Container base images and downloaded release assets are pinned by digest or
  verified against a published checksum.
- Dependencies are installed from a frozen lockfile with a release-age cooldown,
  and scanned with OSV, Semgrep, CodeQL and Trivy.

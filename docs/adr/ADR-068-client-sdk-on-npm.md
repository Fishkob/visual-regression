# ADR 068: The Client SDK Is Published to npm

## Status

Accepted — 2026-11-07. Supersedes decision 1 (install by release-tarball URL)
and the "no registry" rationale of
[ADR-056](./ADR-056-client-sdk-distribution.md); its decisions 3 and 4 — a
loadable ESM bundle as part of the definition of done, and the API staying
usable without any client — remain in force.

Decision 2 (the version is the release tag) is superseded by
[ADR-069](./ADR-069-independent-client-version.md): the client has its own
version line and is no longer republished with every platform release. The
publishing mechanics below stay as written, except that the version now comes
from the tagged `client-sdk/package.json`. Enforced by the `Publish the package
to npm` step in
[release-client-sdk.yml](../../.github/workflows/release-client-sdk.yml), by
`publishConfig.access` in [`client-sdk/package.json`](../../client-sdk/package.json)
and by `scripts/check-client-sdk-package.sh`, which packs the package and
imports every subpath.

## Context

ADR-056 shipped the client as a tarball attached to each GitHub release and
declined npm. Two of its premises changed or turned out not to hold:

1. **The release asset needs the repository.** The repository is private, so
   `/releases/download/...` answers only a browser session; a consumer installs
   with `gh release download` plus a token. That is friction in every CI
   pipeline, and it is avoidable: the client itself holds no secret. It is the
   generated types, the fetch client and two helpers — the API contract, which
   the docs already publish.
2. **The surrounding artifacts are already public.** The container images on
   GHCR need no credentials ([deployment.md](../deployment.md)). A closed client
   next to open images protects nothing and costs every new installation a
   token.

The mechanics check out. On 2026-11-07, `npm publish --dry-run` in `client-sdk`
reported 77.2 kB packed and 358.4 kB unpacked with zero runtime dependencies;
the packed tarball installed into an empty ESM project, all four subpaths
(`@fishkob/vrt`, `/client`, `/upload-many`, `/playwright`) imported in Node, and
a consumer type-checked under both `nodenext` and `bundler`. `@fishkob/vrt` is
unclaimed on the registry. The parts npm needs — `files`, `exports`, `engines`,
`license`, a loadable ESM build — already exist; only access metadata, the
licence file and a publish step are missing.

Every comparable product distributes through a public registry: Percy
(`@percy/cli`, `@percy/playwright`), Chromatic (`chromatic`,
`@chromatic-com/playwright`), Argos (`@argos-ci/playwright`), Applitools
(`@applitools/eyes-playwright`), Lost Pixel, Happo and BackstopJS. Visual
Regression Tracker — self-hosted like this platform — publishes
`@visual-regression-tracker/sdk-js` to npm as well. Self-hosting and a public
client are not in conflict; they never were.

## Decision

1. **`@fishkob/vrt` is published to the public npm registry** by the release
   workflow, and the version in the tarball is the release tag — the same rule
   ADR-056 applied to the release asset.
2. **Consumers pin the exact version** their server runs. The docs show
   `npm i @fishkob/vrt@3.4.0`, never a range; the repository's `.npmrc` keeps
   `save-exact=true` for its own installs. npm allows ranges; the docs do not
   ask for them.
3. **The release tarball stays as an offline mirror.** A deployment without
   registry access installs the same bytes from the release asset. It stops
   being the documented default install.
4. **No provenance is claimed.** npm restricts provenance to public source
   repositories, and this repository is private. The workflow authenticates
   with an `NPM_TOKEN` secret. Trusted publishing (OIDC) replaces the token once
   the package exists and its trusted publisher is configured on npmjs.com; a
   publish from this repository must then set `NPM_CONFIG_PROVENANCE=false`, or
   npm fails for lack of a public source.
5. **The packaging gate stays, and now proves the licence ships.** The tarball
   must contain `LICENSE`, and the manifest must declare public access.

## Rationale

- **One line to install.** `npm i @fishkob/vrt@3.4.0` needs no repository
  access, no `gh`, no token — and the lockfile keeps the exact bytes.
- **The tooling a library is expected to have.** Renovate and Dependabot can
  read the version, `npm audit` and SBOM tooling see the dependency, and
  `npm view @fishkob/vrt dependencies` shows the empty list that makes this
  client worth choosing.
- **Usage follows the images.** Anyone who pulls the public images can install
  the public client. The two artifacts now have the same audience.
- **Nothing is exposed that was not already documented.** The package contains
  `dist/` — generated types, the fetch client and the two helpers. No backend
  source ships, and the API surface is the one the docs describe.

## Alternatives Considered

- **GitHub Packages.** Keeps the package private, but every consumer then needs
  an `.npmrc` scope plus a token — the same credential friction the release
  asset has today, for no additional protection over a public client.
- **Keep the release asset as the only channel.** Rejected: it requires
  repository access, which the images do not, so the install path is harder
  than the product it installs.
- **Publish both channels as documented equal peers.** Rejected as the default:
  two install paths to keep in sync in three documents. The tarball remains an
  offline mirror, documented below the npm install.
- **Publish once the repository becomes public, with provenance.** Deferred,
  not rejected: the package, the build and the workflow stay unchanged; only
  the authentication and the provenance flag change.

## Consequences

- **The first publish needs the secret.** The workflow skips the publish step
  with a warning while `NPM_TOKEN` is unset, so releases keep working before the
  token exists.
- **A published version is permanent.** The tag must be pushed before the
  publish runs, and the committed `version` field in `client-sdk/package.json`
  stays a floor rather than the source of truth — the workflow stamps the tag.
- **The npm page links to a private repository.** `repository` in the manifest
  points at this repository, so the link is dead for the public. The README
  links there today; a URL is not an access grant.
- **Three install snippets change**, in `README.md`, `docs/ci-integration.md`
  and `client-sdk/README.md`; the tarball remains documented as the offline
  path.
- **No provenance badge until the repository is public.** A consumer sees a
  package published by the project account, not a signed build. This is the one
  thing GitHub Packages or npm cannot give a private source repository.

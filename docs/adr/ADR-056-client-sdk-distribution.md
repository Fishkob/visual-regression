# ADR 056: The Client SDK Ships as a Release Asset, Not From a Registry

## Status

Accepted — 2026-11-01. Amends
[ADR-005](./005-openapi-sdk.md), which described `client-sdk` as an unversioned
workspace package "consumed as source"; that sentence no longer holds.

Superseded by: [ADR-068](./ADR-068-client-sdk-on-npm.md) — decision 1 (install
from the release asset) and the "no registry" rationale. Decisions 3 and 4
remain in force.

Amended 2026-11-01, after the first release: the repository is **private**, so
the install command in the Decision below does not work as written. A private
repository's `/releases/download/...` URL answers only a browser session — an
anonymous request and a request carrying a token both return `404`. The asset is
fetched with `gh release download v1.4.0 -R <owner>/visual-regression -p
'fishkob-vrt-*.tgz'` and then installed from disk, or through the API asset
endpoint (`GET /repos/:owner/:repo/releases/assets/:id` with
`Accept: application/octet-stream` and a token). The rest of the decision — a
tarball per release, the tag as its version, an optional client — is unchanged;
`npm i <url>` becomes the documented form again the day the repository is
public.

## Context

ADR-005 generates a fully typed TypeScript SDK from the backend's OpenAPI
document, and the repo consumes it as source through the `@sdk` alias. For
anyone outside the repository that value was unreachable:

- The HTTP API needs no client (curl, the manifest upload, the composite action),
  so the API was never the bottleneck.
- Onboarding a Playwright, Cypress or plain-Node project still meant hand-writing
  a `FormData` loop, getting the variant strings right and re-deriving `runKey`
  and branch conventions. The hand-written helpers that solve exactly this
  (`uploadMany`, the Playwright reporter) already existed in `client-sdk/src/`,
  but `package.json` had no `version`, no `files`, no publish metadata, and its
  `exports` pointed at `.ts` sources.
- **The build output was not loadable.** `@hey-api/openapi-ts` emits
  extensionless specifiers (`./sdk.gen`, `./client`), `tsc` preserves them, and
  Node's ESM resolver infers neither extensions nor a directory's `index.js`.
  Importing the committed `dist/` failed with `ERR_MODULE_NOT_FOUND`. Any
  publishing story would have shipped a broken package.

Publishing to npm was considered and declined: this is a self-hosted product
where operators run their own server, an npm release adds a second release track
and a public supply-chain surface for a package whose audience is exactly the
people already running the code, and the client must match the server version —
a registry encourages `^`-ranges that drift.

## Decision

1. **The client ships as a tarball attached to a GitHub release.** Users install
   it by URL:
   `npm i https://github.com/<owner>/visual-regression/releases/download/v1.3.0/fishkob-vrt-1.3.0.tgz`.
   No registry, no login, no `^`-range.
2. **The tarball version is the release tag.** `release-client-sdk.yml` runs on a
   published release and passes the tag to the packaging script, which stamps it
   into the staged `package.json`. The committed `version` field is the floor of
   the last release, not the source of truth.
3. **A loadable ESM bundle is part of the definition of done.**
   `client-sdk/scripts/fix-esm-specifiers.mjs` rewrites the emitted specifiers to
   explicit `.js`/`index.js` paths, and `scripts/check-client-sdk-package.sh`
   proves the result: it packs the tarball, installs it into an empty project,
   imports every subpath in Node ESM and type-checks a consumer under both
   `nodenext` and `bundler` resolution. `scripts/verify.sh` runs that check on
   every push and the release workflow runs it again before uploading.
4. **The client stays optional.** The HTTP endpoints and the capture manifest
   remain the contract; the SDK is a convenience layer over them. Nothing in the
   server requires a client version, and a consumer that cannot use JavaScript
   loses no capability.

## Rationale

- **No skew by construction.** A tarball URL names the exact build; the same
  string appears in the release notes, in `client-sdk/README.md` and in the
  consuming project's lockfile. An operator upgrading the server from 1.3.0 to
  1.4.0 bumps one URL.
- **No second release track.** One release-please run, one tag, one changelog.
- **The failure mode is visible.** Packing and importing the artifact is a gate,
  not a hope: the class of bug that made `dist/` unusable (extensionless ESM
  specifiers) cannot reach a consumer again without a red build.
- **Runtime dependencies stay at zero.** Nothing to audit, nothing to install,
  no transitive supply chain inside a customer's pipeline.

## Alternatives Considered

- **npm (public, with provenance).** The most ergonomic install, but it publishes
  an artifact whose audience is self-hosted operators, adds a release track and a
  registry dependency, and invites version ranges that drift from the server.
  Not rejected forever — a future ADR can publish the same tarball to npm without
  changing the build.
- **GitHub Packages.** Requires a registry login and an `.npmrc` scope mapping in
  the consumer's repository — more friction than a URL, for the same outcome.
- **Git dependency (`github:owner/repo#v1.3.0`).** A monorepo subpackage cannot be
  installed this way without a build step on install (`prepare`) and workspace
  resolution; it also installs the whole repository.
- **Copying the helpers into the user's project.** Drift on every API change, and
  no way to fix a bug in a released client.
- **Making a client library mandatory.** It would turn the API surface into the
  library's surface, lock non-JavaScript pipelines out, and make `/api/v1`
  changes a client release problem. The upload endpoint plus the manifest format
  already give a language-neutral path.

## Consequences

- Consumers must edit the version they download to upgrade. Accepted: it is the
  same edit as pinning a version, and it makes the coupling explicit.
- The repository is private, so the download is authenticated (see the Status
  amendment). Installation is a two-step `gh release download` + `npm i <file>`,
  not a single URL.
- The tarball lives on the release, so it is not discoverable through `npm view`.
  `README.md`, `docs/ci-integration.md` and `client-sdk/README.md` carry the
  install line instead.
- The local gate grows by one step (~10 s: build, pack, install, two type checks).
- The published types must stay free of Node globals — a `Buffer` in a public
  interface breaks consumers that type-check with `lib: dom`. `PlaywrightAttachment`
  uses `Uint8Array` for that reason.
- If the package is ever published to npm, the build, the version stamping and
  the packaging check stay exactly as they are; only the upload step changes.

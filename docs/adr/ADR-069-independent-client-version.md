# ADR 069: The Client SDK Has Its Own Version Line

## Status

Accepted — 2026-11-07. Supersedes decision 2 of
[ADR-068](./ADR-068-client-sdk-on-npm.md) — "the version in the tarball is the
release tag" — and the install guidance that followed from it. Enforced by
[`release-please-config.json`](../../release-please-config.json), by the
`paths_released` conditions in
[`release-please.yml`](../../.github/workflows/release-please.yml) and by
[`release-client-sdk.yml`](../../.github/workflows/release-client-sdk.yml),
which takes the version from `client-sdk/package.json` instead of stamping the
tag.

## Context

ADR-068 shipped `@fishkob/vrt` with the release tag as its version. That ties
two artifacts together that move at different speeds:

- The platform gets a release for every change to the server, the frontend, the
  deployment or the docs.
- The client is generated from the OpenAPI document. It changes exactly when
  the generated surface or the two hand-written helpers change, and those files
  all live under `client-sdk/`. A backend fix that leaves the contract alone
  does not touch a single file in the package.

The first two releases show the result: `3.4.0` and `3.5.0` are the same client
byte for byte, published twice. The version number therefore carries no
information about the client, and the documented rule — "install the version
that matches your server" — asks consumers to pin a number that tells them
nothing about what they are installing. The skew that ADR-056 and ADR-068 were
guarding against is a property of the range, not of the number: an exact pin of
any version is equally safe.

## Decision

1. **The client has its own release line.** `release-please` manages
   `client-sdk` as its own package: own version in
   `client-sdk/package.json`, own `client-sdk/CHANGELOG.md`, own tag
   `vrt-client-vX.Y.Z`.
2. **A platform release no longer publishes the client.** The publish workflow
   runs only when release-please reports a release for the `client-sdk` path.
3. **The published version is the committed `client-sdk/package.json`.** The
   workflow no longer stamps the tag into a copy: the artifact and its version
   come from the same commit, and `workflow_dispatch` uses the tag only to
   check out the right tree.
4. **Compatibility is the API version, not the platform version.** The client
   speaks `/api/v1`; a client release is compatible with every server that
   serves that API version. Docs say so and stop asking for a server-matched
   pin.
5. **The offline tarball is attached to client releases only.** Attaching it to
   platform releases published nothing new.

## Rationale

- **The version moves when the artifact moves.** A backend-only commit produces
  a platform release and no client release; a regenerated SDK diff produces a
  client release and no platform release.
- **One changelog per artifact.** The client changelog lists client changes
  instead of repeating the platform's.
- **The version still pins exactly.** Every consumer installs an exact version;
  what changes is that the number now means something for the artifact they are
  installing.

## Alternatives Considered

- **Keep the tag version and skip unchanged publishes.** Rejected: the number
  still jumps at every platform release, so a consumer still cannot tell two
  identical clients apart, and the "latest" client version would trail the
  platform arbitrarily.
- **Bump `client-sdk/package.json` by hand and publish only when it changed.**
  Rejected: it works until someone forgets, and the failure mode is a silent
  non-publish. A path-scoped release-please component derives the bump from the
  same Conventional Commits the rest of the repository already uses.
- **Publish a floating range instead of exact versions.** Rejected for the same
  reason ADR-056 gave: this is a self-hosted product where the client and the
  server are upgraded together, and the docs pin exactly.

## Consequences

- **Two release PRs can be open at once** — one for the platform, one for the
  client. Images, chart and the client are published by different runs.
- **The client version no longer identifies the platform build it came from.**
  Accepted: the API version is the contract. A future support need can be served
  by sending a client-version header, not by re-coupling the numbers.
- **The first independent version starts at the last published one.** `3.5.0` is
  already on npm, so the manifest records `client-sdk: 3.5.0`; the first client
  change produces `3.5.1` or `3.6.0`, never a downgrade.
- **`workflow_dispatch` needs the client tag**, not the platform tag: it checks
  out the tagged tree, and the version comes from that tree.

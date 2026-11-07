# ADR 072: Release Artifacts Are Verified and Attested

## Status

Accepted — 2026-11-07. Enforced by `.github/workflows/release-images.yml`,
`.github/workflows/release-client-sdk.yml` and `.github/workflows/chart-validate.yml`.

## Context

The repository is public and publishes two things strangers install: container
images on GHCR and the `@fishkob/vrt` package on npm. Both release workflows took
a git tag as proof that the code underneath it had been reviewed.

It is not. A branch ruleset covers `main`; tags have no protection at all. Anyone
who can write to the repository — a compromised maintainer token, a stolen PAT —
can move `v1.2.3` onto an unreviewed commit and dispatch the release. The images
are rebuilt and pushed under the same tag, the chart keeps pointing at it, and
nothing in Git shows a diff. The npm workflow was worse: its `workflow_dispatch`
input was a free-form `ref`, and `actions/checkout` resolves a branch name just as
happily as a tag, so one dispatch could package a branch and publish it.

Neither artifact carried any proof of where it came from, so a replaced image or
tarball could not be distinguished from a real one after the fact.

## Decision

1. **A release tag must point at a commit on `main`.** Both release workflows
   fetch `origin/main` and refuse to publish when the tagged commit is not an
   ancestor of it. The client workflow additionally requires the ref to be a
   tag whose name matches the tagged `client-sdk/package.json` version.
2. **Nothing is attached to a release that a run did not build.** The npm
   workflow no longer `--clobber`s an existing release asset.
3. **Every published artifact carries provenance.** Images are built with
   `provenance: mode=max` and an SPDX SBOM and attested through
   `actions/attest`; npm publishes with provenance (`id-token: write`).
4. **The release build restores a cache nobody else can write.** Release builds
   read a `release-<image>` GHA cache scope and never export one.
5. **Inputs to the build are pinned.** Base images by digest, the
   OpenTelemetry javaagent by SHA-256, `osv-scanner` against its published
   `SHA256SUMS`, Semgrep as a digest-pinned image instead of a PyPI resolve, and
   the Helm validator by digest.

## Rationale

- A tag is a pointer, not a review. Checking ancestry delegates "was this
  reviewed?" to the ruleset that actually answers it, instead of restating the
  answer in a second place that can drift.
- Provenance is the other half: verification at publish time catches a forged
  tag before the push, attestation lets a consumer catch a substituted artifact
  afterwards. One without the other leaves a window.
- Pinning build inputs is what makes the attestation mean something; an unpinned
  base image is an unattested input inside an attested artifact.

## Alternatives Considered

- **Tag ruleset alone.** Rejected as the only control: repository settings are
  not in the repository, cannot be reviewed in a pull request, and are not
  restored when a fork rebuilds the project. It stays as the second layer.
- **Require a manual approval on the release workflow.** Rejected: it moves the
  decision into a click that leaves no record, and the dispatch path that was
  exploitable would still exist.
- **Trusted publishing for npm now.** The right end state, but it needs a
  package-side configuration that only the first successful publish can create;
  the token path stays until then, with provenance already on.

## Consequences

- **A tag pushed without landing on `main` fails the release run.** That is the
  point, but a hotfix built from a side branch now needs a merge first.
- **Checksums and digests have to be bumped deliberately.** Dependabot updates
  the digests; the javaagent digest and the `SHA256SUMS` verification are manual
  and fail loudly on a mismatch, which is the intended failure mode.
- **The chart refuses to render with the tracked placeholder credentials.**
  `helm install` with the default values now fails instead of deploying an object
  store that answers to a password printed in this repository, so
  `chart-validate.yml` renders with `--set` and asserts the failing case.
- **Consumers can verify.** `gh attestation verify` and `npm audit signatures`
  work against published artifacts; the commands are in
  [docs/deployment.md](../deployment.md#verifying-a-release).

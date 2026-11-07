# ADR 073: Release Assets and Immutable Releases

## Status

Accepted — 2026-11-07. Supersedes [ADR-069](./ADR-069-independent-client-version.md)
decision 5 (the offline tarball), which no longer has an asset to attach. Enforced
by the repository's `immutable_releases` setting, which lives outside the
repository and therefore cannot be reviewed in a pull request, and by the guard in
`.github/workflows/release-client-sdk.yml`.

## Context

ADR-072 made every published artifact carry provenance and stopped a release run
from replacing an asset it did not build. Neither closes the window that is left
open by the release object itself: a GitHub release is mutable after publish, so a
token with `contents: write` can swap the SDK tarball of a version an operator
already pinned, and nothing in Git shows a diff. ADR-072's rule only binds the
workflow; a direct `POST /releases/assets` is not the workflow.

The npm registry does not have that window — a version cannot be republished — so
the two distribution paths differ in exactly one property, and the release asset
is the weaker one.

GitHub can close it: with repository-level **release immutability** on, a published
release's assets and notes are fixed, and an asset can only be added while the
release is still a draft. Three facts about this repository, all verified against
the API on 2026-11-07, decide whether that is compatible with the release flow:

1. **A draft release does not create its tag.** Creating a draft release with a
   `tag_name` and `target_commitish` leaves no `refs/tags/...` behind; the tag
   appears when the release is published. `release-client-sdk.yml` checks out
   `refs/tags/<client tag>`, requires it to be a tag that is an ancestor of `main`
   and compares it against the tagged `client-sdk/package.json`, so a draft that
   arrives without its tag fails that check before it can publish anything.
2. **The client workflow attaches the tarball after the release is published.**
   `release-please` creates the release published, `release-client-sdk.yml` builds
   and publishes to npm, and only then uploads the tarball with `gh release
upload`. Under immutability that last step is refused, every time.
3. **No release has ever carried an asset.** `v1.0.0`, `v1.0.1` and
   `vrt-client-v1.0.0` all have zero assets, while `docs/ci-integration.md`,
   `client-sdk/README.md` and `docs/deployment.md` describe the tarball as
   attached. The offline path was documented before it ever produced a file, so
   dropping the asset takes nothing away that anyone can currently download — and
   it stops three documents from promising something the pipeline does not keep.

The release object exposes the setting per release (`draft` and `immutable`), so a
workflow can branch on it instead of guessing — which is how
`release-client-sdk.yml` behaves today: it reports a notice on a published
immutable release instead of failing the run, because a red release run would hide
that the npm publish succeeded.

## Decision

**Option B: turn release immutability on and stop treating the GitHub release as
an artifact store.** The release carries the tag and the notes; the artifact is the
npm package, which is immutable by registry rule and carries its provenance
attestation back to the commit. `release-client-sdk.yml` keeps its guard, so the
flip is a repository setting and nothing else changes.

Its two consequences are accepted deliberately: `gh release download` no longer
returns the SDK tarball, and the drop of the asset is only recorded here — the
setting itself lives outside the repository and cannot be reviewed in a pull
request.

The alternative is **option C** below, which keeps the asset and immutability both
and pays for them with a release-flow redesign.

## Rationale

- The immutability gap is the last one in the artifact chain ADR-072 started
  closing, and it is the only one that needs no new code to close.
- Two copies of the same tarball are not twice the evidence: the npm one is the
  copy consumers install, it is bound to the exact commit by provenance, and it
  cannot be replaced. The release asset is a second copy with fewer guarantees.
- Option C's complexity buys discoverability, not integrity. That is a real
  trade-off, but it should be made explicitly rather than by accident.

## Alternatives Considered

- **Option A — leave immutability off and keep the asset.** The status quo. It
  keeps the `gh release download` path the docs already promise, and it is what the
  workflow was written for, but it leaves the swap window open for as long as the
  repository exists. Rejected: the mitigation (provenance) tells a careful consumer
  that an asset is forged, while immutability prevents the forgery.
- **Option C — turn immutability on and move tag/release creation into the
  workflow.** `release-please` would keep owning the version bump, the changelog
  and the release pull request, while `release-client-sdk.yml` creates the tag from
  the merged commit, creates the release as a draft, attaches the tarball and
  publishes the draft — the documented draft-then-publish flow. It keeps both the
  asset and immutability. It is rejected as the _first_ step because:
  - `release-please` gets a per-package option to skip its own release
    (`skip-github-release`), but that also has to be reconciled with the
    `release: published` trigger the workflow carries for a human-published
    release, and with the `paths_released` output the caller filters on;
  - the tag becomes an artifact the workflow creates, so ADR-072's "the tag is the
    proof of review" moves from `release-please` to our own code and has to keep
    the ancestor check and the version match;
  - the failure mode is worse: a wrong draft stays invisible instead of failing a
    publish that an operator notices.
    It remains the right move if the release asset is worth that redesign; this ADR
    would then be superseded.
- **Attach an attestation to the release instead of the tarball.** Not possible on
  a user-owned repository: `actions/attest` needs
  `create-storage-record: true` to store a record outside the run, and storage
  records exist for organization-owned repositories only — the same restriction
  that keeps `secret_scanning_non_provider_patterns` and validity checks switched
  off here. The attestation stays a workflow artifact.

## Consequences

- **The setting is a manual, out-of-repo step**, not part of a pull request, so it
  is recorded next to the tag ruleset in [docs/deployment.md](../deployment.md).
  If it is ever turned off, this ADR is wrong and needs a new one.
- **The release page documents, it does not distribute.** Any link or doc that
  points a consumer at a release asset has to point at the npm package instead;
  verification stays `npm audit signatures` (ADR-072).
- **The guard in `release-client-sdk.yml` becomes the normal path**, not the
  exceptional one: a client release reports one notice per run. That is expected
  and not a failure to investigate.
- **This ADR does not supersede ADR-072.** Its rule that a release asset must come
  from the run that publishes it stays in force; what changes is that there is no
  longer an asset for it to apply to.

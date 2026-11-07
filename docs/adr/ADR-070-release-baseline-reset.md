# ADR 070: The Release Lines Restart at 4.0.0 and 1.0.0

## Status

Accepted — 2026-11-07. Supersedes the "first independent version starts at the
last published one" consequence of
[ADR-069](./ADR-069-independent-client-version.md) and the numbering of every
release before this one. Enforced by `.release-please-manifest.json`, by the
`v4.0.0` and `vrt-client-v1.0.0` tags and by the versions in both
`package.json` files.

## Context

Two release lines exist and neither number says anything useful:

- The platform collected tags from `v1.0.0` to `v3.5.0` across the pre-1.0
  build-up. Only `v3.4.0` and `v3.5.0` ever had GitHub releases; the rest are
  tags.
- The client inherited the platform tag when it was first published, so its
  first and only npm version is `3.5.0` — a number it reached without ever
  being `1.0.0`.

The next change on either line would produce `3.5.1`, which continues a
numbering that was accidental rather than chosen. A deliberate baseline is
wanted instead.

## Decision

1. **The platform restarts at `4.0.0`.** `v1.0.0` already exists as a tag and
   tags are immutable, so reusing that number would mean deleting the release
   history. `4.0.0` is the next major above everything published, and it is
   honest: the platform has shipped 3.x.
2. **The client restarts at `1.0.0`.** Its only published version, `3.5.0`, is
   unpublished inside npm's 72-hour window and has no dependents, so `1.0.0`
   becomes the first version the registry has ever served.
3. **Both baselines are tagged and seeded.** `v4.0.0` and `vrt-client-v1.0.0`
   point at the reset commit, and `.release-please-manifest.json` records the
   same numbers, so release-please continues from the baseline instead of
   walking back through history.
4. **Both changelogs carry a baseline entry**, so the jump is explained where a
   reader meets it.

## Rationale

- **Tags stay immutable.** A restart adds a number; it does not rewrite one.
- **The baseline is visible.** `4.0.0` for the platform is the first version of
  a new scheme, not a silently reused label.
- **The client gets the clean start it never had.** `1.0.0` is true for the
  client in a way `3.5.0` was not.

## Alternatives Considered

- **Delete every tag and re-tag `1.0.0` on both lines.** Rejected: it breaks
  pinned references in charts, image tags and documents for a cosmetic gain, and
  it makes release-please see no history at all.
- **Calendar versioning (`v2026.11.0`).** Rejected: it changes the tag scheme
  for years to come to solve a one-off.
- **Continue with `3.5.1`.** Rejected: the number stays accidental, and the
  client's line would carry the platform's baggage forever.

## Consequences

- **npm serves exactly one client version.** `@fishkob/vrt@1.0.0` is the only
  version; npm's staged-publishing placeholder (`0.0.0-stage`) remains as a
  registry artifact of the first publish attempt.
- **Old platform tags remain.** `v1.0.0` … `v3.5.0` stay in the repository and
  in GHCR; they are history, not a supported line.
  Amended 2026-11-07: the tags and the two releases they carried were deleted
  after the reset, leaving only `v4.0.0` and `vrt-client-v1.0.0`; the GHCR
  images built from the deleted tags may still exist.
- **Anyone who pinned the client at `3.5.0` must move to `1.0.0`.** The API is
  unchanged, so it is a version move, not a migration.
- **The chart and images resume at `4.0.0`.** The first image build after this
  ADR carries that tag.

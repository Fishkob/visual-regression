# ADR 071: The Platform Baseline Is 1.0.0

## Status

Accepted — 2026-11-07. Supersedes the `4.0.0` baseline of
[ADR-070](./ADR-070-release-baseline-reset.md); everything else in ADR-070 —
the client at `1.0.0`, the tagged baselines, the changelog entries — stays in
force. Enforced by `.release-please-manifest.json`, by
`package.json` and by the `v1.0.0` tag.

## Context

ADR-070 restarted the platform at `4.0.0` for one reason: `v1.0.0` was still
taken by a pre-1.0 tag, and tags are immutable. The same reset then deleted the
old tags — `v1.0.0` … `v3.5.0` and their releases — which removed the only
obstacle to the number the reset was supposed to use.

Leaving the platform at `4.0.0` would keep a number that exists solely because
of a constraint that no longer holds, and it would give the product a different
baseline from its client for no reason.

## Decision

1. **The platform restarts at `1.0.0`.** The `v4.0.0` tag is retired; the
   manifest and `package.json` record `1.0.0`.
2. **The baseline is tagged `v1.0.0`** at the same commit, and the images are
   rebuilt as `1.0.0`; the Helm chart follows.
3. **The client keeps its `1.0.0`**, so both lines start at the same number —
   which is what the reset was asked for.

## Rationale

- The reason for `4.0.0` disappeared with the tags; a baseline should describe
  the project, not a constraint that was true for an hour.
- Both artifacts of a young self-hosted product starting at `1.0.0` is the
  simplest story to tell an operator.

## Alternatives Considered

- **Keep `4.0.0`.** Rejected: it encodes a superseded constraint and splits the
  two baselines for no reason.
- **Roll the whole reset back to `3.5.1`.** Rejected: the mess the reset was
  meant to end.

## Consequences

- **The `4.0.0` images become orphans.** They should be deleted alongside the
  old `1.0.0`–`3.5.0` versions; nothing points at them after the chart is
  rebuilt.
- **The platform's GitHub release is `v1.0.0`.** The manually created `4.0.0`
  release was already removed.
- **ADR-070 stays as history.** It records the interim step and why it existed;
  its client line and its changelog entries are unchanged.

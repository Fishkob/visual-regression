# ADR 077: Release Pull Requests Do Not Block Each Other

## Status

Accepted — 2026-11-13. Supplements
[ADR-069](./ADR-069-independent-client-version.md): the two release lines stay
separate, and this fixes how their pull requests stop colliding. Enforced by
`always-update` in [`release-please-config.json`](../../release-please-config.json),
by the `RELEASE_PLEASE_TOKEN` secret in
[`release-please.yml`](../../.github/workflows/release-please.yml) and
[`release-images.yml`](../../.github/workflows/release-images.yml).

## Context

ADR-069 gave the client its own release line and used `separate-pull-requests`
to keep the two release PRs apart. Both PRs still describe their version in the
same four-line file, `.release-please-manifest.json`, and the two version keys
sit on adjacent lines:

```json
{
  ".": "3.0.0",
  "client-sdk": "3.0.0"
}
```

That is fine only while the two PRs never overlap in time. On 2026-11-13 the
release of the platform (`#65`, 06:26) merged while the client release PR
(`#69`, opened 06:10) was still open. `#69` inherited a branch based on
`acae6f5` and a change on the `client-sdk` line, `main` moved the `"."` line
one commit ahead, and git cannot merge two edits to neighbouring lines of one
hunk. The pull request showed a conflict in a file neither side had a real
disagreement about, and `.release-please-manifest.json` was the only conflicting
file.

The conflict is a symptom. The cause is in release-please itself: by default an
open release PR is updated only when its **release notes** change
(`maybeUpdateExistingPullRequest` compares the body and logs `remained the
same` otherwise). A branch whose notes are unchanged is never pushed, so it
keeps sitting on the commit it was created from no matter how far `main` has
moved. The run after `#65` merged said exactly that:

```
✔ Building candidate release pull request for path: client-sdk
✔ PR https://github.com/Fishkob/visual-regression/pull/69 remained the same
```

Two independent things then block a bot-opened pull request here:

1. **The stale branch conflicts** and `strict_required_status_checks_policy`
   refuses to merge a branch that is behind `main`.
2. **Its CI never starts.** A pull request created with `github.token` has no
   trusted author, so every workflow run it triggers waits for a maintainer.
   The same run proves it: attempt 1 ended `action_required` at 06:10:21, and
   attempt 2 only started at 06:18:43 after a human approved it. This is
   documented as an accepted step in
   [docs/deployment.md](../deployment.md#cicd-flow), and it also
   caught the chart bump PR `#79`, whose auto-merge sat armed on four runs that
   nobody had approved.

The two are not independent in practice. `always-update` force-pushes an open
release PR on **every** push to `main`, which starts a fresh CI run each time —
without a token, that turns one approval into one approval per push.

## Decision

1. **`always-update: true`.** release-please rebuilds an open release PR on
   every run instead of comparing release notes. The rebuilt branch is computed
   against the current `main` (`buildChangeSet(updates, targetBranch)` and a
   forced push), so the manifest arrives with `main`'s values and the shared
   file can no longer conflict.
2. **Release pull requests are opened with `RELEASE_PLEASE_TOKEN`,** a
   fine-grained token with `contents`, `pull-requests` and `issues` write.
   Both paths inherit it: release-please itself, and the chart bump, which
   receives it through the `workflow_call` interface of `release-images.yml`.
   Both fall back to `github.token` when the secret is unset, so a fork and a
   repository that has not configured the secret keep working exactly as today.
3. **One config and one manifest stay.** The failure was a stale branch, not the
   shared file; `always-update` makes the file safe to share, and the single
   manifest keeps the package list in one place.

## Rationale

- The conflict was never a disagreement about versions. `#69` wanted
  `client-sdk: 3.1.0` and `main` wanted `".": 3.1.0`; both are correct. Line
  based merging cannot express that, and no conflict resolution strategy fixes
  it — only not being stale does.
- `always-update` costs API calls and CI minutes and buys the property the
  ruleset already demands: an open release PR is mergeable at any moment. The
  alternative is a merge order that has to be remembered, which is what failed.
- The token is the difference between "a maintainer approves each bot PR" and
  "a maintainer reviews the release when it is ready". The approval step was
  never a security boundary here: `required_approving_review_count` is `0`, so
  the approval only ever gated the _workflow run_, not the merge.

## Alternatives Considered

- **One combined release PR (`separate-pull-requests: false`).** It removes the
  shared file from the diff entirely. Rejected: it re-couples the two version
  lines, and a platform release would bump the client for a package that did not
  change — the exact outcome ADR-069 was written to end.
- **A second manifest, one per release line.** Two `config-file`/`manifest-file`
  pairs in two action runs. Rejected for now: it doubles the configuration to
  keep in sync and does **not** fix the stale branch, so an out-of-date release
  PR would still need a manual update under the strict checks. It stays the right
  move if the two lines ever need different target branches or changelog
  policies — this ADR would then be superseded.
- **A merge queue in the ruleset.** A queue serialises merges and rebuilds the
  branch on the current base, but a branch that already conflicts cannot enter
  it, and the queue does not update a PR that is merely behind.
- **Dropping `strict_required_status_checks_policy`.** It makes a behind branch
  mergeable but gives up "the checks ran against what `main` looks like now".
  That guarantee is worth more than the manual step it costs.

## Consequences

- **An open release PR is force-pushed on every push to `main`,** so its CI
  re-runs. With the token this is invisible; without it, expect one approval per
  push instead of one per pull request.
- **The secret is an out-of-repo step,** like the immutability setting of
  ADR-073: it cannot be reviewed in a pull request, so it is recorded in
  [docs/deployment.md](../deployment.md#cicd-flow) next to the other
  release prerequisites. If the token is revoked, the behaviour falls back to
  the approval gate rather than failing the release.
- **The chart bump PR is still behind after another merge.** It is opened once
  per release and nothing rebuilds it, so the note in
  [docs/deployment.md](../deployment.md#cicd-flow) about updating
  its branch stays correct; only the approval half is removed by this ADR.
- **This does not supersede ADR-069.** Its decision that the client has its own
  version line, tag and changelog is untouched; what changes is that the two
  release PRs can now be open at the same time.

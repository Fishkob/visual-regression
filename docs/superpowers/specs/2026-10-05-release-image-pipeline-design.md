# Release Image Pipeline — Design

Date: 2026-10-05

## Problem

The five first-party container images (`visual-regression-backend`,
`visual-regression-frontend`, `visual-regression-worker`, `pdf-sidecar`,
`visual-regression-migrate`) are built and pushed to GHCR **only** by
`deploy-manual.yml`, which runs on `workflow_dispatch`. Nothing rebuilds them
when `main` moves, so the published images drift away from the code, and
`latest` is only as fresh as the last time someone remembered to press the
button.

There is no notion of a release: no git tags, no changelog, no versioned image
tags. The workflow hardcodes two tags (`latest`, `sha-<short>`) and then rewrites
`deploy/charts/vrt/values.yaml` to a short-SHA tag. `cleanup.yml` prunes GHCR
history for only two of the five packages.

## Decision

**A release is a git tag `vX.Y.Z`. A release publishes all five images tagged
`X.Y.Z` and bumps the Helm chart to that tag.**

- Releases are cut by **release-please** from Conventional Commits.
- Image build/push is a **reusable workflow** invoked by the same release run,
  reading the version from the (already bumped) root `package.json`. This avoids
  the `GITHUB_TOKEN`-created-tag limitation without a PAT.
- `deploy-manual.yml` is removed; its build matrix and manifest-bump logic move
  into the release pipeline.

Out of scope (tracked separately): base/infra image automation
(Dependabot/Renovate), the `rustfs/rustfs:1.0.0-rc.3` pin, the hardcoded
`pnpm`/`prisma` versions in the Dockerfiles, and Trivy as a release gate.

## Flow

```
push to main
  └─ release-please.yml
       ├─ job release-please  ──► maintains release PR / on merge: tag vX.Y.Z + GitHub Release
       │                          (output: releases_created)
       ├─ job tests  (if releases_created == 'true')  ──► backend & frontend lint + typecheck + unit
       └─ job build-images  (needs tests, if releases_created == 'true')
            └─ uses: ./.github/workflows/release-images.yml   (workflow_call)
                 ├─ read VERSION from package.json
                 ├─ matrix build+push all 5 images → ghcr.io/fishkob/<name>:X.Y.Z
                 └─ bump deploy/charts/vrt/values.yaml, commit + push  [skip ci]
```

### Why `workflow_call` instead of `on: push: tags`

Tags created with the default `GITHUB_TOKEN` do not trigger further workflow
runs. Since release-please-action creates the tag with `GITHUB_TOKEN`, a
standalone `on: push: tags: ['v*']` build job would never fire. Calling a
reusable workflow from the release-please run sidesteps this with no secret to
provision. The version does not need to be passed explicitly: release-please
bumps `package.json` in the release PR, so when the build job checks out the
merge commit on `main`, `package.json` already carries the new version.

## Components

### 1. `.github/workflows/release-please.yml` (new)

- Trigger: `push` to `main`.
- Job `release-please`: `googleapis/release-please-action@v4` with
  `release-type: node` (single root component; inline config is sufficient — no
  manifest needed). Permissions: `contents: write`, `pull-requests: write`.
  Maintains `CHANGELOG.md` and the root `package.json` version; opening the
  release PR, and on merge creating tag `vX.Y.Z` + GitHub Release notes.
- Job `tests`: `needs: release-please`,
  `if: needs.release-please.outputs.releases_created == 'true'`. Checks out the
  repo, runs `.github/actions/setup`, then backend and frontend
  `lint:check` + `typecheck` + unit tests. This is the publish gate.
- Job `build-images`: `needs: [release-please, tests]`,
  `if: needs.release-please.outputs.releases_created == 'true'`,
  `uses: ./.github/workflows/release-images.yml` (the reusable workflow uses the
  always-available `github.token`; no `secrets: inherit`).
  Permissions: `contents: write`, `packages: write`.

### 2. `.github/workflows/release-images.yml` (new, reusable)

- Triggers: `workflow_call` and `workflow_dispatch` (for manual re-runs; on
  dispatch it checks out the default branch and re-publishes its current
  version).
- Steps:
  1. `actions/checkout@v6` at the triggering commit (carries the bumped
     `package.json`).
  2. `VERSION="$(node -p "require('./package.json').version")"`.
  3. Login to GHCR, `docker/setup-buildx-action`.
  4. Matrix build+push with `docker/build-push-action`, tag
     `type=raw,value=${VERSION}` via `docker/metadata-action`. No `latest`, no
     `sha`, no moving major/minor tags.
  5. Job `bump-chart` (after the matrix): checkout `main`, rewrite the five
     `tag:` lines in `deploy/charts/vrt/values.yaml` to `${VERSION}`, commit
     `chore(release): bump chart image tags to ${VERSION} [skip ci]` and push.

Matrix contexts/files (mirroring the Dockerfiles):

| Image                        | Context         | Dockerfile                   |
| ---------------------------- | --------------- | ---------------------------- |
| `visual-regression-backend`  | `.`             | `backend/Dockerfile`         |
| `visual-regression-frontend` | `.`             | `frontend/Dockerfile`        |
| `visual-regression-worker`   | `.`             | `backend/Dockerfile.worker`  |
| `pdf-sidecar`                | `./pdf-sidecar` | `pdf-sidecar/Dockerfile`     |
| `visual-regression-migrate`  | `.`             | `backend/Dockerfile.migrate` |

The previous `cp -r client-sdk frontend/client-sdk` host step is dropped: the
frontend Dockerfile already copies the repo-root `client-sdk/`, and the `@sdk`
alias resolves to `../client-sdk`.

### 3. `deploy-manual.yml` (removed)

Build matrix and manifest bump are absorbed by the two workflows above. The
per-target selection and the skip-tests toggle go away. The release run gates
publishing on its own `tests` job (backend + frontend lint/typecheck/unit):
release-please opens its PR with `GITHUB_TOKEN`, and workflow runs on such
bot-created PRs start in an approval-required state, so the pipeline must not
assume the merged PR's CI has passed.

### 4. `deploy/charts/vrt/values.yaml`

- This work only rewrites the comment above `images:` to describe the release
  flow. The `tag:` defaults stay `latest` for now: no semver image exists yet,
  and the existing GHCR `latest` tags keep fresh installs working.
- From the first release onward the `bump-chart` job owns the `tag:` lines and
  writes the concrete `X.Y.Z` version, so a fresh `helm install` pins a real
  immutable image.

### 5. `cleanup.yml`

- Generalised to a matrix over all five packages (currently only backend and
  frontend are pruned), keep-count raised to `5` so recent releases remain
  available for chart rollback.

### 6. Docs

- `docs/deployment.md`: replace "updated there by the Manual Deploy workflow"
  with the release flow.
- `README.md`: correct any reference to manual image publishing / `latest`.

## Error handling & operations

- A failed image build leaves the tag and the GitHub Release in place but does
  not bump the chart — re-run `release-images.yml` via `workflow_dispatch`; it
  republishes the current `main` version idempotently.
- The chart-bump commit is pushed with `GITHUB_TOKEN`, so it triggers no
  workflows (no loop). `[skip ci]` is kept as defence in depth.
- ArgoCD observes the repository directly, so the bump commit still reconciles
  the new tag.

## Verification

- `actionlint` / workflow lint on the changed YAML.
- Dry-run release-please locally or on a scratch branch, confirm the release PR,
  and that merging it produces `vX.Y.Z` + a `releases_created` run.
- Confirm the build matrix produces five `:X.Y.Z` tags in GHCR and that the
  chart bump commit contains the expected `tag:` values.
- Existing checks: `pnpm run lint`, `pnpm run typecheck:all`, `pnpm run format:check`.

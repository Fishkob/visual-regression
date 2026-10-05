# Release Image Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish all five first-party images on every semver release, tagged `X.Y.Z`, and bump the Helm chart to the released tag automatically.

**Architecture:** `release-please` turns Conventional Commits into a release PR; merging it creates the `vX.Y.Z` tag and GitHub Release, then the same workflow run calls a reusable `release-images.yml` that reads the version from `package.json`, builds/pushes the five images, and commits the new tag into `deploy/charts/vrt/values.yaml`. There is no PAT and no `latest`/`sha` tag.

**Tech Stack:** GitHub Actions, `googleapis/release-please-action@v4`, `docker/build-push-action@v7`, `docker/metadata-action@v6`, `actionlint`.

---

**Note on commits:** the repo's `AGENTS.md` requires an explicit user request before committing. The commit steps below are the intended per-task commits; run them only once the user has authorised committing for this work.

**Note on "tests":** these are workflow/config changes, so the verification loop is `actionlint` for syntax/semantics plus a manual `workflow_dispatch` smoke run (Task 7) instead of a unit test suite.

---

### Task 1: Add the release-please workflow

**Files:**

- Create: `.github/workflows/release-please.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release-please.yml` with exactly:

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    name: Release Please
    runs-on: ubuntu-latest
    outputs:
      releases_created: ${{ steps.release.outputs.releases_created }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          release-type: node

  tests:
    name: Test release
    needs: release-please
    if: needs.release-please.outputs.releases_created == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup

      - name: Backend lint, typecheck & unit tests
        working-directory: backend
        run: pnpm run lint:check && pnpm run typecheck && pnpm run test -- test/unit

      - name: Frontend lint, typecheck & unit tests
        working-directory: frontend
        run: pnpm run lint:check && pnpm run typecheck && pnpm run test

  build-images:
    name: Build release images
    needs: [release-please, tests]
    if: needs.release-please.outputs.releases_created == 'true'
    permissions:
      contents: write
      packages: write
    uses: ./.github/workflows/release-images.yml
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/release-please.yml`
Expected: no output, exit code 0. (If actionlint reports that the called workflow does not exist yet, that is resolved in Task 2 — re-run after Task 2.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release-please.yml
git commit -m "ci(release): add release-please workflow"
```

---

### Task 2: Add the reusable image build workflow

**Files:**

- Create: `.github/workflows/release-images.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release-images.yml` with exactly:

```yaml
name: Release Images

on:
  workflow_call:
  workflow_dispatch:

permissions:
  contents: write
  packages: write

concurrency:
  group: release-images-${{ github.ref }}
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_OWNER: ${{ github.repository_owner }}

jobs:
  build:
    name: Build ${{ matrix.image }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - image: visual-regression-backend
            context: .
            file: ./backend/Dockerfile
          - image: visual-regression-frontend
            context: .
            file: ./frontend/Dockerfile
          - image: visual-regression-worker
            context: .
            file: ./backend/Dockerfile.worker
          - image: pdf-sidecar
            context: ./pdf-sidecar
            file: ./pdf-sidecar/Dockerfile
          - image: visual-regression-migrate
            context: .
            file: ./backend/Dockerfile.migrate
    steps:
      - uses: actions/checkout@v6

      - name: Read version
        id: version
        run: |
          VALUE=$(node -p "require('./package.json').version")
          [ -n "$VALUE" ] || { echo "could not read package.json version"; exit 1; }
          echo "value=$VALUE" >> "$GITHUB_OUTPUT"

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ github.token }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_OWNER }}/${{ matrix.image }}
          tags: type=raw,value=${{ steps.version.outputs.value }}

      - name: Build and push
        uses: docker/build-push-action@v7
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.file }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  bump-chart:
    name: Bump chart image tags
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v6
        with:
          ref: main
          fetch-depth: 0
          token: ${{ github.token }}

      - name: Read version
        id: version
        run: |
          VALUE=$(node -p "require('./package.json').version")
          [ -n "$VALUE" ] || { echo "could not read package.json version"; exit 1; }
          echo "value=$VALUE" >> "$GITHUB_OUTPUT"

      - name: Update image tags in values.yaml
        run: |
          VERSION="${{ steps.version.outputs.value }}"
          for name in visual-regression-backend visual-regression-frontend visual-regression-worker pdf-sidecar visual-regression-migrate; do
            sed -i "/name: ${name}$/{n;s|tag:.*|tag: ${VERSION}|;}" deploy/charts/vrt/values.yaml
          done

      - name: Commit and push
        run: |
          VERSION="${{ steps.version.outputs.value }}"
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add deploy/charts/vrt/values.yaml
          git diff --staged --quiet || git commit -m "chore(release): bump chart image tags to ${VERSION} [skip ci]"
          git pull --rebase --autostash origin main
          git push
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/release-images.yml`
Expected: no output, exit code 0.

- [ ] **Step 3: Re-lint the release workflow (the reusable workflow now exists)**

Run: `actionlint .github/workflows/release-please.yml`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-images.yml
git commit -m "ci(release): add reusable image build workflow"
```

---

### Task 3: Remove the manual deploy workflow

**Files:**

- Delete: `.github/workflows/deploy-manual.yml`

- [ ] **Step 1: Delete the file**

Run:

```bash
git rm .github/workflows/deploy-manual.yml
```

- [ ] **Step 2: Confirm no dangling references (outside the design spec)**

Run:

```bash
grep -rn "deploy-manual" .github deploy README.md docs/deployment.md || echo "no references"
```

Expected: `no references` (the design spec under `docs/superpowers/specs/` intentionally mentions the removal and is not searched here).

- [ ] **Step 3: Commit**

```bash
git commit -m "ci(release): remove manual deploy workflow"
```

---

### Task 4: Update the Helm chart image comment

**Files:**

- Modify: `deploy/charts/vrt/values.yaml:24-42`

- [ ] **Step 1: Replace the stale comment block above `images:`**

Replace:

```yaml
images:
  # The deploy workflow tags every pushed image with `latest` and `sha-<shortsha>`
  # (see .github/workflows/deploy-manual.yml). `latest` is the safe default here;
  # the workflow pins exact shas into this file after each deploy.
```

with:

```yaml
images:
  # Images are published by the release pipeline: release-please cuts a git tag
  # `vX.Y.Z`, and .github/workflows/release-images.yml builds every image tagged
  # `X.Y.Z` and rewrites the `tag:` values below. The pipeline does not publish
  # `latest`; the `latest` defaults here are placeholders until the first release
  # overwrites them.
```

Leave the five `tag: latest` values unchanged — the `bump-chart` job owns them from the first release onward.

- [ ] **Step 2: Verify the YAML still parses**

Run: `actionlint .github/workflows/release-images.yml >/dev/null && node -e "require('yaml').parse(require('fs').readFileSync('deploy/charts/vrt/values.yaml','utf8'))" 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('deploy/charts/vrt/values.yaml'))" && echo "values.yaml OK"`
Expected: `values.yaml OK`

- [ ] **Step 3: Commit**

```bash
git add deploy/charts/vrt/values.yaml
git commit -m "docs(chart): describe release-driven image tags"
```

---

### Task 5: Generalise the cleanup workflow to all five packages

**Files:**

- Modify: `.github/workflows/cleanup.yml` (whole file)

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `.github/workflows/cleanup.yml` with:

```yaml
name: Cleanup old images

on:
  schedule:
    - cron: "0 3 * * 0" # Every Sunday at 3am
  workflow_dispatch:
    inputs:
      keep:
        description: "Number of image versions to keep"
        required: false
        type: string
        default: "5"

permissions:
  packages: write

jobs:
  cleanup:
    name: Cleanup ${{ matrix.image }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        image:
          - visual-regression-backend
          - visual-regression-frontend
          - visual-regression-worker
          - pdf-sidecar
          - visual-regression-migrate
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - name: Delete old versions
        env:
          KEEP: ${{ github.event.inputs.keep || '5' }}
        run: |
          # Keep at least one version so the chart's image tags stay pullable.
          if ! [[ "$KEEP" =~ ^[0-9]+$ ]] || [ "$KEEP" -lt 1 ]; then
            echo "Invalid keep='$KEEP', defaulting to 1"
            KEEP=1
          fi

          # User- and org-owned packages live under different API paths.
          OWNER="${{ github.repository_owner }}"
          OWNER_TYPE=$(gh api "/repos/${GITHUB_REPOSITORY}" --jq .owner.type) || OWNER_TYPE="User"
          if [ "$OWNER_TYPE" = "Organization" ]; then
            BASE="/orgs/${OWNER}"
          else
            BASE="/users/${OWNER}"
          fi

          echo "Fetching ${{ matrix.image }} versions (newest first)..."
          VERSIONS=$(gh api -XGET \
            "${BASE}/packages/container/${{ matrix.image }}/versions" \
            --paginate --slurp \
            --jq 'add | sort_by(.created_at) | reverse | .[].id') || VERSIONS=""

          if [ -z "$VERSIONS" ]; then
            echo "No versions found for ${{ matrix.image }}"
            exit 0
          fi

          COUNT=0
          for VERSION_ID in $VERSIONS; do
            COUNT=$((COUNT + 1))
            if [ "$COUNT" -gt "$KEEP" ]; then
              echo "Deleting ${{ matrix.image }} version: $VERSION_ID"
              gh api -XDELETE "${BASE}/packages/container/${{ matrix.image }}/versions/$VERSION_ID" || echo "Failed to delete $VERSION_ID, skipping"
            fi
          done

          echo "Kept $KEEP latest versions of ${{ matrix.image }}"
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/cleanup.yml`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/cleanup.yml
git commit -m "ci(cleanup): prune all five image packages"
```

---

### Task 6: Update deployment docs

**Files:**

- Modify: `docs/deployment.md:47`
- Modify: `docs/deployment.md:183-198`
- Modify: `docs/deployment.md:209-218`

- [ ] **Step 1: Fix the ArgoCD sentence (line 47)**

Replace:

```markdown
The ArgoCD `Application` tracks `main` and syncs `deploy/charts/vrt` automatically. ArgoCD applies the chart's `values.yaml` (image tags are updated there by the Manual Deploy workflow). Get the admin password and port-forward the UI:
```

with:

```markdown
The ArgoCD `Application` tracks `main` and syncs `deploy/charts/vrt` automatically. ArgoCD applies the chart's `values.yaml` (image tags are updated there by the release pipeline). Get the admin password and port-forward the UI:
```

- [ ] **Step 2: Rewrite the CI/CD Flow section (lines 183-198)**

Replace the whole section from `## CI/CD Flow` through the paragraph ending `...required for any comparison to run.` with:

```markdown
## CI/CD Flow

On every push to `main` or `develop`, GitHub Actions runs tests (unit + e2e) automatically.

Releases are cut from [Conventional Commits](https://www.conventionalcommits.org/) by release-please: it maintains a release PR, and merging that PR creates a `vX.Y.Z` tag and a GitHub Release. The same workflow run then builds and pushes every image tagged `X.Y.Z` to GHCR and updates the `tag:` values in `deploy/charts/vrt/values.yaml`, which ArgoCD picks up automatically.

The release run re-runs the backend and frontend lint, typecheck, and unit tests before building, so an image is never published from untested code.

Images are pushed to (resolved from the repository owner, e.g. `ghcr.io/<owner>/...`):

- `ghcr.io/<owner>/visual-regression-backend`
- `ghcr.io/<owner>/visual-regression-frontend`
- `ghcr.io/<owner>/visual-regression-worker`
- `ghcr.io/<owner>/pdf-sidecar`
- `ghcr.io/<owner>/visual-regression-migrate`

The Helm chart's `registry` value (default `ghcr.io`) and `imageOwner` value (default `fishkob`) build the image path. Forks that publish their own images override `imageOwner` via `--set imageOwner=<fork-owner>`; to pull from a different registry, override `registry` too (or set both in the chart values in ArgoCD).

> **Release prerequisites (repository settings):** enable _Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"_ so release-please can open its release PR. Workflow runs on that PR start in an approval-required state, so a maintainer must approve them before the PR's CI runs (the release run re-tests before publishing regardless). The `bump-chart` job pushes directly to `main`, so branch protection must allow the Actions `GITHUB_TOKEN` to push (or add the GitHub Actions integration to the ruleset's bypass list).

### Re-running a failed release build

If the image build or chart bump fails, re-run **Actions → Release Images → Run workflow**. It republishes the current `main` version and rewrites the chart tags.
```

- [ ] **Step 3: Rewrite the Manual Image Tag Update section (lines 209-218)**

Replace the section from `## Manual Image Tag Update` to the end of the file with:

````markdown
## Manual Image Tag Update

The release pipeline sets the image tags automatically. To override a released version (e.g. for a hotfix or rollback), edit the Helm values file:

```bash
nano deploy/charts/vrt/values.yaml
```

Set the `tag:` under each entry in `images:` to a released version such as `1.2.3`, then commit — ArgoCD reconciles it. This override lasts only until the next release, which rewrites every `tag:`; for a durable pin, set the tags from ArgoCD or revert the release commit.
````

- [ ] **Step 4: Check the docs for stale wording**

Run:

```bash
grep -rn "Manual Deploy\|manual.*GHCR\|sha-<shortsha>" docs/deployment.md README.md || echo "clean"
```

Expected: `clean`

- [ ] **Step 5: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: describe release-driven image pipeline"
```

---

### Task 7: End-to-end smoke verification

This task proves the pipeline behaviour on the real remote. It pushes images and a chart commit, so run it only when the user agrees.

**Files:** none (verification only)

- [ ] **Step 1: Validate the reusable build workflow directly**

Run (requires `gh` auth with `workflow` scope):

```bash
gh workflow run release-images.yml --repo <owner>/visual-regression --ref main
gh run watch "$(gh run list --repo <owner>/visual-regression --workflow=release-images.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: one run with 5 successful `Build <image>` matrix jobs plus a successful `Bump chart image tags` job.

- [ ] **Step 2: Confirm the image tags in GHCR**

Run:

```bash
VERSION=$(node -p "require('./package.json').version")
for img in visual-regression-backend visual-regression-frontend visual-regression-worker pdf-sidecar visual-regression-migrate; do
  echo "== $img =="
  gh api "/user/packages/container/${img}/versions" --jq '.[].metadata.container.tags[]' 2>/dev/null | sort -u
done
```

Expected: `$VERSION` listed for each of the five packages (alongside any pre-existing `latest`/`sha-*` tags).

- [ ] **Step 3: Confirm the chart bump commit**

Run:

```bash
git pull --ff-only
git log --oneline -3
grep -A1 "name: visual-regression-backend$" deploy/charts/vrt/values.yaml
```

Expected: a `chore(release): bump chart image tags to <version> [skip ci]` commit, and `tag: <version>` in the values file.

- [ ] **Step 4: Exercise the release-please path**

Run:

```bash
gh workflow run ci-backend.yml --repo <owner>/visual-regression   # optional: warm run
git commit --allow-empty -m "feat: trigger first release"          # or merge any feat commit
git push
gh run list --repo <owner>/visual-regression --workflow=release-please.yml --limit 3
```

Expected: release-please opens a release PR. After merging it, a run appears with `releases_created == true` and the `Build release images` job executes; `gh release list` shows `vX.Y.Z`.

- [ ] **Step 5: Report**

No commit. Report the observed version, the five GHCR tags, and the chart bump commit hash back to the user.

---

## Self-Review

**Spec coverage:**

| Spec section                                                                     | Task                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------- |
| release-please workflow                                                          | Task 1                                    |
| reusable release-images workflow (matrix, version from package.json, chart bump) | Task 2                                    |
| remove `deploy-manual.yml`                                                       | Task 3                                    |
| chart default/comment                                                            | Task 4                                    |
| cleanup generalised to 5 packages                                                | Task 5                                    |
| docs (`deployment.md`)                                                           | Task 6                                    |
| error handling / re-run via `workflow_dispatch`                                  | Task 2 (dispatch trigger) + Task 7 Step 1 |
| verification                                                                     | Task 7                                    |

**Placeholder scan:** no `TBD`/`TODO`; every code step contains full file contents.

**Type consistency:** the image names in the bump loop (Task 2) match the matrix `image` values and the `cleanup.yml` matrix (Task 5); the chart `name:` values in `values.yaml` (`visual-regression-backend`, `visual-regression-frontend`, `visual-regression-worker`, `pdf-sidecar`, `visual-regression-migrate`) match the `name` interpolation in the sed loop.

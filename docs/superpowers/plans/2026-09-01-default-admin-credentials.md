# Default Admin Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give local-dev setups a working default admin login (`admin`/`admin-secret`) and document where the admin credentials come from in the README for both the Docker and local-dev paths.

**Architecture:** Config/docs-only change. The backend bootstrap logic (`backend/src/modules/internal/auth/bootstrap-admin.ts`) is unchanged: it creates the admin on startup when both `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` are set and no user exists yet. Local dev (`./scripts/dev.sh`) copies `backend/.env.local.example` → `backend/.env.local` on first setup; the Docker path (`./install.sh`) still generates a random password into `.env` and prints it.

**Tech Stack:** Shell env templates, Markdown. Prettier (root, `format:check`) covers `.md` files; `.env.*` files are gitignored from Prettier via `.prettierignore`.

---

### Task 1: Set the local-dev admin default

**Files:**
- Modify: `backend/.env.local.example:51-53`

- [ ] **Step 1: Update the bootstrap admin block**

Current content (lines 51-53):
```
# First admin user, bootstrapped on startup. Remove after first login.
BOOTSTRAP_ADMIN_USERNAME=
BOOTSTRAP_ADMIN_PASSWORD=
```

Replace with:
```
# First admin user, bootstrapped on startup. Remove after first login.
# Local-dev default: admin / admin-secret (override as needed).
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=admin-secret
```

- [ ] **Step 2: Verify the change**

Run: `sed -n '47,56p' backend/.env.local.example`
Expected: the block above, with `BOOTSTRAP_ADMIN_USERNAME=admin` and `BOOTSTRAP_ADMIN_PASSWORD=admin-secret`.

- [ ] **Step 3: Commit**

```bash
git add backend/.env.local.example
git commit -m "feat(dev): default local-dev admin login to admin/admin-secret"
```

---

### Task 2: Document the first login in the README

**Files:**
- Modify: `README.md` (insert new section after line 42; update lines 41-42 and the Security bullet around line 359)

- [ ] **Step 1: Add a "First login" subsection**

Insert directly before `### Optional: seed demo data` (after the two lines "Open the printed **frontend URL**..." / "Remove `BOOTSTRAP_ADMIN_*` from `.env` after first login."):

```markdown
### First login

Where the admin credentials come from depends on how you run the platform:

- **Self-hosting (`./install.sh`)** — `install.sh` generates a random admin
  password and prints it in the success banner ("Admin login"). The same value
  is stored in `.env` as `BOOTSTRAP_ADMIN_PASSWORD`; the username is
  `BOOTSTRAP_ADMIN_USERNAME` (default `admin`). Remove `BOOTSTRAP_ADMIN_*` from
  `.env` after first login.
- **Local dev (`pnpm run dev`)** — a fresh setup bootstraps the admin as
  `admin` / `admin-secret`. Override via `BOOTSTRAP_ADMIN_USERNAME` /
  `BOOTSTRAP_ADMIN_PASSWORD` in `backend/.env.local`.
```

- [ ] **Step 2: Point the Quick Start text at the new section**

Replace:
```
Open the printed **frontend URL** and log in with the printed admin credentials.
Remove `BOOTSTRAP_ADMIN_*` from `.env` after first login.
```

With:
```
Open the printed **frontend URL** and log in — see [First login](#first-login).
```

- [ ] **Step 3: Update the Security Considerations bullet**

In the "Security Considerations" section, replace:
```
- **Bootstrap admin** — The first admin user is created on startup from `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` (only when both are set). Remove them from the environment after first login.
```

With:
```
- **Bootstrap admin** — The first admin user is created on startup from `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` (only when both are set). Local dev defaults these to `admin` / `admin-secret`; there is no production default. Remove them from the environment after first login. See [First login](#first-login).
```

- [ ] **Step 4: Verify formatting**

Run: `pnpm run format:check`
Expected: passes (README.md is covered by the root Prettier config; `.env.*` files are Prettier-ignored, so Task 1 needs no formatting).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document first-login admin credentials"
```

---

### Task 3: Verify the full change set

**Files:** none (verification only)

- [ ] **Step 1: Confirm no production default was added**

Run: `rg -n "BOOTSTRAP_ADMIN" .env.example backend/.env.production.example backend/.env.staging.example`
Expected: `BOOTSTRAP_ADMIN_PASSWORD` is still empty in all three files (no known default ships into production).

- [ ] **Step 2: Confirm the design spec + plan exist**

Run: `ls docs/superpowers/specs docs/superpowers/plans`
Expected: `2026-09-01-default-admin-credentials-design.md` and `2026-09-01-default-admin-credentials.md`.

- [ ] **Step 3: Show the final diff**

Run: `git log --oneline -5`
Expected: the design-doc commit plus the two new commits from Tasks 1 and 2.

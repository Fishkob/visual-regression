# Default Admin Credentials — Design

Date: 2026-09-01

## Problem

Users struggle to find the admin login. The README documents no default
password. Two setups are affected:

- **Local dev** (`pnpm run dev`): `BOOTSTRAP_ADMIN_USERNAME` /
  `BOOTSTRAP_ADMIN_PASSWORD` are empty in `backend/.env.local.example`, so no
  admin is bootstrapped at all — a fresh local install has no way to log in
  unless the developer sets the variables manually.
- **Docker / self-hosting** (`./install.sh`): a random password is generated
  and printed in the installer banner, but there is no README reference that
  tells the user where to find it.

## Decision

Approach **B** (recommended during brainstorming): a fixed default for local
dev only, random secrets for production, with clear README documentation.

1. **`backend/.env.local.example`** — set the dev-only default:
   `BOOTSTRAP_ADMIN_USERNAME=admin` / `BOOTSTRAP_ADMIN_PASSWORD=admin-secret`.
   `dev.sh` copies this template to `backend/.env.local` on first setup, so a
   fresh local install boots with the working login `admin` / `admin-secret`.
   This is consistent with the frontend E2E defaults
   (`E2E_ADMIN_USERNAME`/`E2E_ADMIN_PASSWORD` default to `admin`/`admin-secret`).

2. **`.env.example`** — unchanged. The username already defaults to `admin`;
   the password stays empty. `./install.sh` replaces it with a random secret,
   so no known default ships into production.

3. **`README.md`** — add a "First login" section after the Quick Start:
   - Docker (`./install.sh`): username `admin` by default; the password is the
     randomly generated one from the installer banner, stored as
     `BOOTSTRAP_ADMIN_PASSWORD` in `.env`.
   - Local dev: `admin` / `admin-secret`, overridable via
     `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` in
     `backend/.env.local`.
   - Point the existing Quick Start text (lines 41-42) and the Security
     Considerations bootstrap-admin bullet (line 359) at this section.

4. **`backend/.env.production.example` / `.env.staging.example`** — stay empty
   (no default in non-dev environments).

## Non-goals

- No backend code changes — the bootstrap logic in
  `backend/src/modules/internal/auth/bootstrap-admin.ts` is unchanged.
- No "force password change on first login" feature (approach C) — out of scope.
- No change to `install.sh` — it keeps generating a random password.

## Out of scope for tests

Configuration/documentation-only change. The frontend E2E fixtures already
default to `admin`/`admin-secret`. No new unit tests.

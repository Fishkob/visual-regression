# ADR 024: Database Migrations via Prisma Migrate

## Status

Accepted — 2026-08-09

## Context

The platform uses `prisma db push` for schema management. `db push` syncs the DB to
`schema.prisma` but does not track schema history: it can apply destructive changes
(column/table drops) without review or rollback, and it is unsafe for a live system
with data that must survive. A stale `0001_init` migration from the old split-schema
era was tracked in the repo but unused — the repo appeared to use migrations while
every workflow ran `db push`.

The platform is not yet live, so no data-preserving upgrade path is needed.

## Decision

Use Prisma Migrate for schema management.

- **Baseline**: A single fresh `0001_init` migration generated from the current
  unified `schema.prisma`. No upgrade path from the old split schema — databases are
  disposable today, and a baseline represents the initial schema for future
  deployments.
- **Development**: `prisma migrate dev` (via `cd backend && pnpm run db:migrate`) —
  auto-creates migration files on schema change and applies them. Schema and
  migrations cannot drift in the dev loop.
- **CI / production**: `prisma migrate deploy` (via `pnpm run db:prepare`,
  `dev.sh docker`, the Docker `db-migrate` service, the Helm `migration-job.yaml`,
  and both CI workflows) — applies only unapplied migrations, idempotently.
- **Drift guard**: CI (backend-e2e job) runs
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
--exit-code` after `migrate deploy` against the e2e Postgres. Exit `2` (drift)
  fails the build.

## Rationale

- **Safety for a future live system**: `migrate deploy` orders and tracks schema
  changes; destructive changes are reviewed as migration files before they apply.
- **Consistency**: Schema, migrations, and deployed DB stay in lockstep; CI fails on
  drift instead of silently desyncing.
- **Reuses existing infrastructure**: the Helm migration job and Docker
  `db-migrate` service already existed — they now do the right thing.

## Alternatives Considered

- **Keep `db push`**: simplest for disposable DBs, but unsafe once real data exists
  and leaves schema history untracked.
- **Hybrid (push in dev, deploy in CI)**: faster dev iteration but allows drift
  between `schema.prisma` and committed migrations.

## Consequences

- A schema change now requires generating a migration (`db:migrate` in dev) and
  committing it — it can no longer be applied silently.
- Fresh databases get the baseline applied via `migrate deploy`. A database that
  already has the schema but no `_prisma_migrations` table is **not** migrated by
  `migrate deploy` — Prisma refuses with P3005 ("database schema is not empty"),
  so such a local/CI database has to be baselined explicitly
  (`prisma migrate resolve --applied 0001_init`) or reset.
- `prisma db push` no longer appears in live tooling or config (historical mentions in
  this ADR and past docs are context for the decision).

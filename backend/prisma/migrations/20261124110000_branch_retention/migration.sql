-- Branch retention (ADR-067).
--
-- Branches are materialized by the first upload and the platform never learns
-- that the Git branch behind one was merged or deleted, so a project's branch
-- list grew forever. The sweep that retires them reads two things this
-- migration adds:
--
--   * `Branch.lastActivityAt` — the clock. Comparisons cannot serve as the
--     clock: an identical upload writes no comparison row, and `runKey` is
--     optional, so a run-less pipeline would look dead while it uploads daily.
--     The intake path touches this column outside every upload transaction,
--     guarded to at most one write per window, so the hot upload path pays a
--     no-op statement instead of a row lock.
--
--     Existing rows get the migration's `now()`, which means the first sweep
--     after an upgrade cannot delete anything a deployment did not already
--     leave idle for the full window. That grace is deliberate.
--
--   * `Project.branchRetentionDays` — the per-project override. NULL uses
--     `BRANCH_RETENTION_DAYS`; `0` disables the sweep for that project.
--
-- AlterTable
ALTER TABLE "Project" ADD COLUMN "branchRetentionDays" INTEGER;

-- CHECK mirrors the domain range (`>= 0`, nullable = "use the default"), like
-- the other retention columns in 20261124090000_schema_hardening.
ALTER TABLE "Project" ADD CONSTRAINT "Project_branchRetentionDays_check" CHECK ("branchRetentionDays" IS NULL OR "branchRetentionDays" >= 0) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_branchRetentionDays_check";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
--
-- The sweep filters one project's branches by activity (and also reads them for
-- the retention preview). The unique `(projectId, name)` key cannot serve that
-- predicate.
CREATE INDEX "Branch_projectId_lastActivityAt_idx" ON "Branch"("projectId", "lastActivityAt");

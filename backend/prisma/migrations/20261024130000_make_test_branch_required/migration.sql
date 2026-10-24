-- Enforce branch on every test.
--
-- A plain ALTER ... SET NOT NULL takes an ACCESS EXCLUSIVE lock and scans the
-- whole table while every upload waits, and it fails only after the scan. Adding
-- the rule as a CHECK first and validating it (SHARE UPDATE EXCLUSIVE: reads and
-- writes keep working) both proves the data is clean up front and lets
-- PostgreSQL 12+ take the short path in SET NOT NULL — it reuses the validated
-- constraint instead of re-scanning the table.
ALTER TABLE "UnifiedTest"
  ADD CONSTRAINT "UnifiedTest_branchId_not_null" CHECK ("branchId" IS NOT NULL) NOT VALID;

ALTER TABLE "UnifiedTest" VALIDATE CONSTRAINT "UnifiedTest_branchId_not_null";

ALTER TABLE "UnifiedTest" ALTER COLUMN "branchId" SET NOT NULL;

-- The CHECK has done its job; the column constraint now carries the rule.
ALTER TABLE "UnifiedTest" DROP CONSTRAINT "UnifiedTest_branchId_not_null";

-- Drop the project link. The column's unique index and its foreign key go with
-- it (PostgreSQL drops a column's constraints and indexes on DROP COLUMN).
--
-- Deployment note: this migration is a breaking step for the *server*, not just
-- the database — a previous build still selects and writes "projectId". It must
-- run in a maintenance window with the old instance stopped, or be released
-- expand/contract across two deploys. See ADR-027 "Deployment".
DROP INDEX "UnifiedTest_projectId_name_key";
ALTER TABLE "UnifiedTest" DROP COLUMN "projectId";

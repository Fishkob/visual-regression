-- ComparisonStatus.UNCHANGED was never a persisted value: a zero-diff
-- comparison retires its candidate without storing a row, and the outcome is
-- reported on the observability event instead. Removing the value leaves the
-- enum with exactly the statuses a UnifiedComparison row can hold.
ALTER TYPE "ComparisonStatus" RENAME TO "ComparisonStatus_old";
CREATE TYPE "ComparisonStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED');
ALTER TABLE "UnifiedComparison"
  ALTER COLUMN "status" TYPE "ComparisonStatus"
  USING ("status"::text::"ComparisonStatus");
DROP TYPE "ComparisonStatus_old";

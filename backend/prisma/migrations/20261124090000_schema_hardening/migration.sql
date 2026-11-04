-- Hardening the invariants the schema only described in comments.
--
-- 1. A screenshot always belongs to a variant. Screenshots written before the
--    variant model existed carry NULL and are unreachable from every reader
--    (they are only ever read through their variant), so they are removed here
--    instead of blocking the NOT NULL. Their files are reclaimed by the
--    unreferenced-object sweep, which treats a missing row as unreferenced.
DELETE FROM "UnifiedScreenshot" WHERE "variantId" IS NULL;

-- 2. Duplicate webhook endpoints for the same (project, url) double every
--    delivery and are always a misconfiguration. Keep the oldest row, move its
--    deliveries to it, then drop the duplicates — otherwise the unique index
--    below would fail on an installation that already had one.
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (PARTITION BY "projectId", url ORDER BY "createdAt", id) AS keeper
  FROM "WebhookEndpoint"
)
UPDATE "WebhookDelivery" d
SET "endpointId" = r.keeper
FROM ranked r
WHERE d."endpointId" = r.id AND r.id <> r.keeper;

DELETE FROM "WebhookEndpoint" w
USING (
  SELECT
    id,
    first_value(id) OVER (PARTITION BY "projectId", url ORDER BY "createdAt", id) AS keeper
  FROM "WebhookEndpoint"
) r
WHERE w.id = r.id AND w.id <> r.keeper;

-- DropForeignKey
ALTER TABLE "UnifiedScreenshot" DROP CONSTRAINT "UnifiedScreenshot_variantId_fkey";

-- DropIndex: (testId, type) is served by the leading column of the unique key.
DROP INDEX "UnifiedScreenshot_testId_type_idx";

-- DropIndex: both single-column indexes are shadowed by status-first lookups.
DROP INDEX "ComparisonJob_createdAt_idx";

-- DropIndex
DROP INDEX "ComparisonJob_runKey_idx";

-- AlterTable
ALTER TABLE "UnifiedScreenshot" ALTER COLUMN "variantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "UnifiedTest_tags_idx" ON "UnifiedTest" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEndpoint_projectId_url_key" ON "WebhookEndpoint"("projectId", "url");

-- AddForeignKey
ALTER TABLE "UnifiedScreenshot" ADD CONSTRAINT "UnifiedScreenshot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "UnifiedVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain checks. Added NOT VALID first and validated in the same migration so a
-- populated installation does not hold an ACCESS EXCLUSIVE lock for the length
-- of a full-table scan; the migration is small enough that one transaction is
-- still cheaper than leaving them unvalidated.
--
-- They guard the values the application already enforces, so a bad migration,
-- a manual SQL fix, or a future code path that forgets the rule fails here
-- instead of shipping an unreadable row.

-- Project settings
ALTER TABLE "Project" ADD CONSTRAINT "Project_requiredApprovals_check" CHECK ("requiredApprovals" >= 1) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_requiredApprovals_check";

ALTER TABLE "Project" ADD CONSTRAINT "Project_quotaSoftPercent_check" CHECK ("quotaSoftPercent" IS NULL OR ("quotaSoftPercent" >= 0 AND "quotaSoftPercent" <= 100)) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_quotaSoftPercent_check";

ALTER TABLE "Project" ADD CONSTRAINT "Project_pixelDiffThreshold_check" CHECK ("pixelDiffThreshold" IS NULL OR "pixelDiffThreshold" >= 0) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_pixelDiffThreshold_check";

ALTER TABLE "Project" ADD CONSTRAINT "Project_baselineRevisionLimit_check" CHECK ("baselineRevisionLimit" IS NULL OR "baselineRevisionLimit" >= 1) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_baselineRevisionLimit_check";

ALTER TABLE "Project" ADD CONSTRAINT "Project_runHistoryDays_check" CHECK ("runHistoryDays" IS NULL OR "runHistoryDays" >= 0) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_runHistoryDays_check";

ALTER TABLE "Project" ADD CONSTRAINT "Project_orphanGraceHours_check" CHECK ("orphanGraceHours" IS NULL OR "orphanGraceHours" >= 0) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_orphanGraceHours_check";

ALTER TABLE "Project" ADD CONSTRAINT "Project_storageQuotaBytes_check" CHECK ("storageQuotaBytes" IS NULL OR "storageQuotaBytes" >= 0) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_storageQuotaBytes_check";

ALTER TABLE "Project" ADD CONSTRAINT "Project_storageUsedBytes_check" CHECK ("storageUsedBytes" IS NULL OR "storageUsedBytes" >= 0) NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_storageUsedBytes_check";

-- Screenshots and comparisons
ALTER TABLE "UnifiedScreenshot" ADD CONSTRAINT "UnifiedScreenshot_sizeBytes_check" CHECK ("sizeBytes" >= 0) NOT VALID;
ALTER TABLE "UnifiedScreenshot" VALIDATE CONSTRAINT "UnifiedScreenshot_sizeBytes_check";

ALTER TABLE "UnifiedScreenshot" ADD CONSTRAINT "UnifiedScreenshot_pixelDiffThreshold_check" CHECK ("pixelDiffThreshold" >= 0) NOT VALID;
ALTER TABLE "UnifiedScreenshot" VALIDATE CONSTRAINT "UnifiedScreenshot_pixelDiffThreshold_check";

ALTER TABLE "UnifiedComparison" ADD CONSTRAINT "UnifiedComparison_mismatchPixelCount_check" CHECK ("mismatchPixelCount" >= 0) NOT VALID;
ALTER TABLE "UnifiedComparison" VALIDATE CONSTRAINT "UnifiedComparison_mismatchPixelCount_check";

ALTER TABLE "UnifiedComparison" ADD CONSTRAINT "UnifiedComparison_mismatchPageCount_check" CHECK ("mismatchPageCount" IS NULL OR "mismatchPageCount" >= 0) NOT VALID;
ALTER TABLE "UnifiedComparison" VALIDATE CONSTRAINT "UnifiedComparison_mismatchPageCount_check";

ALTER TABLE "UnifiedComparison" ADD CONSTRAINT "UnifiedComparison_diffSizeBytes_check" CHECK ("diffSizeBytes" >= 0) NOT VALID;
ALTER TABLE "UnifiedComparison" VALIDATE CONSTRAINT "UnifiedComparison_diffSizeBytes_check";

-- Queue and rate limiter
ALTER TABLE "ComparisonJob" ADD CONSTRAINT "ComparisonJob_attempts_check" CHECK ("attempts" >= 0) NOT VALID;
ALTER TABLE "ComparisonJob" VALIDATE CONSTRAINT "ComparisonJob_attempts_check";

ALTER TABLE "ComparisonJob" ADD CONSTRAINT "ComparisonJob_maxAttempts_check" CHECK ("maxAttempts" >= 1) NOT VALID;
ALTER TABLE "ComparisonJob" VALIDATE CONSTRAINT "ComparisonJob_maxAttempts_check";

ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_count_check" CHECK ("count" >= 0) NOT VALID;
ALTER TABLE "RateLimitBucket" VALIDATE CONSTRAINT "RateLimitBucket_count_check";

-- An assignment must name at least the test or the run it belongs to; a row
-- with neither names no target at all.
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_target_check" CHECK ("testId" IS NOT NULL OR "runId" IS NOT NULL) NOT VALID;
ALTER TABLE "ReviewAssignment" VALIDATE CONSTRAINT "ReviewAssignment_target_check";

-- The two history outcome columns are read by the trend SQL as literal values
-- (`outcome = 'changed'`), so a typo silently breaks the flake rate instead of
-- failing a query.
ALTER TABLE "ComparisonOutcomeEvent" ADD CONSTRAINT "ComparisonOutcomeEvent_outcome_check" CHECK ("outcome" IN ('changed', 'unchanged', 'within_threshold')) NOT VALID;
ALTER TABLE "ComparisonOutcomeEvent" VALIDATE CONSTRAINT "ComparisonOutcomeEvent_outcome_check";

ALTER TABLE "RunUpload" ADD CONSTRAINT "RunUpload_outcome_check" CHECK ("outcome" IN ('identical', 'baseline_created', 'comparison_queued')) NOT VALID;
ALTER TABLE "RunUpload" VALIDATE CONSTRAINT "RunUpload_outcome_check";

-- Analytics counters
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_accessCount_check" CHECK ("accessCount" >= 0) NOT VALID;
ALTER TABLE "ShareLink" VALIDATE CONSTRAINT "ShareLink_accessCount_check";

ALTER TABLE "BaselineRevision" ADD CONSTRAINT "BaselineRevision_pixelDiffThreshold_check" CHECK ("pixelDiffThreshold" >= 0) NOT VALID;
ALTER TABLE "BaselineRevision" VALIDATE CONSTRAINT "BaselineRevision_pixelDiffThreshold_check";

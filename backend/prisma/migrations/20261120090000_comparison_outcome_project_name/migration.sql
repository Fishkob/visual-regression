-- AlterTable
ALTER TABLE "ComparisonOutcomeEvent" ADD COLUMN "projectName" TEXT;

-- Backfill from the live join chain; rows whose test is already deleted stay NULL
-- by design and are simply not attributable to a project.
UPDATE "ComparisonOutcomeEvent" e
SET "projectName" = p."name"
FROM "UnifiedTest" t
JOIN "Branch" b ON b.id = t."branchId"
JOIN "Project" p ON p.id = b."projectId"
WHERE e."testId" = t.id;

-- CreateIndex
CREATE INDEX "ComparisonOutcomeEvent_projectName_createdAt_idx" ON "ComparisonOutcomeEvent"("projectName", "createdAt");

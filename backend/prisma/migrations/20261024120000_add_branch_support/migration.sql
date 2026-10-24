-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetBranchId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultBranchId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_projectId_name_key" ON "Branch"("projectId", "name");

-- CreateIndex
CREATE INDEX "Branch_targetBranchId_idx" ON "Branch"("targetBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_defaultBranchId_key" ON "Project"("defaultBranchId");

-- Backfill: one main branch per project
INSERT INTO "Branch" ("id", "projectId", "name", "createdAt")
SELECT 'br_' || md5(p."id" || ':main'), p."id", 'main', CURRENT_TIMESTAMP
FROM "Project" p;

UPDATE "Project" p
SET "defaultBranchId" = b."id"
FROM "Branch" b
WHERE b."projectId" = p."id" AND b."name" = 'main';

-- Add nullable branch link to tests and backfill
ALTER TABLE "UnifiedTest" ADD COLUMN     "branchId" TEXT;

UPDATE "UnifiedTest" t
SET "branchId" = p."defaultBranchId"
FROM "Project" p
WHERE t."projectId" = p."id";

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedTest_branchId_name_key" ON "UnifiedTest"("branchId", "name");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_targetBranchId_fkey" FOREIGN KEY ("targetBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedTest" ADD CONSTRAINT "UnifiedTest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "UnifiedVariant" ADD COLUMN     "isInherited" BOOLEAN NOT NULL DEFAULT false;

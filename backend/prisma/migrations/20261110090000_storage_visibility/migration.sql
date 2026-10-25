-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "baselineRevisionLimit" INTEGER,
ADD COLUMN     "orphanGraceHours" INTEGER,
ADD COLUMN     "quotaSoftPercent" INTEGER DEFAULT 80,
ADD COLUMN     "runHistoryDays" INTEGER,
ADD COLUMN     "storageQuotaBytes" BIGINT;

-- AlterTable
ALTER TABLE "UnifiedComparison" ADD COLUMN     "diffSizeBytes" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UnifiedScreenshot" ADD COLUMN     "sizeBytes" BIGINT NOT NULL DEFAULT 0;


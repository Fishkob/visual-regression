-- AlterTable
ALTER TABLE "UnifiedTest" ADD COLUMN     "description" TEXT,
ADD COLUMN     "muteReason" TEXT,
ADD COLUMN     "mutedUntil" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];


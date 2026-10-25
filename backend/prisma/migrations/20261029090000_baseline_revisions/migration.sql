-- CreateEnum
CREATE TYPE "BaselineRevisionReason" AS ENUM ('approval', 'restore', 'import');

-- CreateTable
CREATE TABLE "BaselineRevision" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "viewport" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "pageCount" INTEGER,
    "pixelDiffThreshold" INTEGER NOT NULL DEFAULT 0,
    "reason" "BaselineRevisionReason" NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaselineRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BaselineRevision_testId_createdAt_idx" ON "BaselineRevision"("testId", "createdAt");

-- CreateIndex
CREATE INDEX "BaselineRevision_variantId_createdAt_idx" ON "BaselineRevision"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "BaselineRevision_imageUrl_idx" ON "BaselineRevision"("imageUrl");

-- AddForeignKey
ALTER TABLE "BaselineRevision" ADD CONSTRAINT "BaselineRevision_testId_fkey" FOREIGN KEY ("testId") REFERENCES "UnifiedTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineRevision" ADD CONSTRAINT "BaselineRevision_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "UnifiedVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


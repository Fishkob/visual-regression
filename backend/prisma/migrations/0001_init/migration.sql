-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TestKind" AS ENUM ('image', 'pdf');

-- CreateEnum
CREATE TYPE "ScreenshotType" AS ENUM ('BASELINE', 'CURRENT');

-- CreateEnum
CREATE TYPE "ComparisonStatus" AS ENUM ('UNCHANGED', 'PENDING_APPROVAL', 'APPROVED');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('PENDING', 'UNCHANGED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedTest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TestKind" NOT NULL DEFAULT 'image',
    "status" "TestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnifiedTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedVariant" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "viewport" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "baselineId" TEXT,

    CONSTRAINT "UnifiedVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedScreenshot" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "variantId" TEXT,
    "type" "ScreenshotType" NOT NULL,
    "imageHash" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "pageCount" INTEGER,
    "pixelDiffThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnifiedScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedComparison" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "pageCount" INTEGER,
    "mismatchPixelCount" INTEGER NOT NULL,
    "mismatchPageCount" INTEGER,
    "diffImageUrl" TEXT,
    "diffPdfUrl" TEXT,
    "status" "ComparisonStatus" NOT NULL,
    "baselineId" TEXT NOT NULL,
    "candidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnifiedComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonJob" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "candidateId" TEXT,
    "variantViewport" TEXT,
    "variantBrowser" TEXT,
    "variantEnvironment" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ComparisonJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedTest_projectId_name_key" ON "UnifiedTest"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedVariant_baselineId_key" ON "UnifiedVariant"("baselineId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedVariant_testId_viewport_browser_environment_key" ON "UnifiedVariant"("testId", "viewport", "browser", "environment");

-- CreateIndex
CREATE INDEX "UnifiedScreenshot_testId_type_idx" ON "UnifiedScreenshot"("testId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedScreenshot_testId_variantId_type_key" ON "UnifiedScreenshot"("testId", "variantId", "type");

-- CreateIndex
CREATE INDEX "UnifiedComparison_testId_idx" ON "UnifiedComparison"("testId");

-- CreateIndex
CREATE INDEX "UnifiedComparison_status_idx" ON "UnifiedComparison"("status");

-- CreateIndex
CREATE INDEX "UnifiedComparison_baselineId_idx" ON "UnifiedComparison"("baselineId");

-- CreateIndex
CREATE INDEX "UnifiedComparison_candidateId_idx" ON "UnifiedComparison"("candidateId");

-- CreateIndex
CREATE INDEX "ComparisonJob_status_nextAttemptAt_idx" ON "ComparisonJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ComparisonJob_status_heartbeatAt_idx" ON "ComparisonJob"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "ComparisonJob_status_candidateId_idx" ON "ComparisonJob"("status", "candidateId");

-- CreateIndex
CREATE INDEX "ComparisonJob_createdAt_idx" ON "ComparisonJob"("createdAt");

-- AddForeignKey
ALTER TABLE "UnifiedTest" ADD CONSTRAINT "UnifiedTest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedVariant" ADD CONSTRAINT "UnifiedVariant_testId_fkey" FOREIGN KEY ("testId") REFERENCES "UnifiedTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedVariant" ADD CONSTRAINT "UnifiedVariant_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "UnifiedScreenshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedScreenshot" ADD CONSTRAINT "UnifiedScreenshot_testId_fkey" FOREIGN KEY ("testId") REFERENCES "UnifiedTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedScreenshot" ADD CONSTRAINT "UnifiedScreenshot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "UnifiedVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedComparison" ADD CONSTRAINT "UnifiedComparison_testId_fkey" FOREIGN KEY ("testId") REFERENCES "UnifiedTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedComparison" ADD CONSTRAINT "UnifiedComparison_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "UnifiedScreenshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedComparison" ADD CONSTRAINT "UnifiedComparison_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "UnifiedScreenshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

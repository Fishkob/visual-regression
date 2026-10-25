-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "branchName" TEXT,
    "testId" TEXT NOT NULL,
    "testKind" "TestKind" NOT NULL,
    "variantViewport" TEXT NOT NULL,
    "variantBrowser" TEXT NOT NULL,
    "variantEnvironment" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "candidateHash" TEXT NOT NULL,
    "baselineHash" TEXT,
    "mismatchPixelCount" INTEGER,
    "mismatchPageCount" INTEGER,
    "pageCount" INTEGER,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Approval_projectName_testName_approvedAt_idx" ON "Approval"("projectName", "testName", "approvedAt");

-- CreateIndex
CREATE INDEX "Approval_approvedAt_idx" ON "Approval"("approvedAt");


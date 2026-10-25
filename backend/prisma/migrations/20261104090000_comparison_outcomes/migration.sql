-- CreateTable
CREATE TABLE "ComparisonOutcomeEvent" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "kind" "TestKind" NOT NULL,
    "viewport" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "comparisonId" TEXT,
    "runId" TEXT,
    "runKey" TEXT,
    "outcome" TEXT NOT NULL,
    "mismatchMetric" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparisonOutcomeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComparisonOutcomeEvent_createdAt_idx" ON "ComparisonOutcomeEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ComparisonOutcomeEvent_testId_createdAt_idx" ON "ComparisonOutcomeEvent"("testId", "createdAt");

-- CreateIndex
CREATE INDEX "ComparisonOutcomeEvent_runKey_idx" ON "ComparisonOutcomeEvent"("runKey");

-- CreateIndex
CREATE INDEX "ComparisonOutcomeEvent_comparisonId_idx" ON "ComparisonOutcomeEvent"("comparisonId");


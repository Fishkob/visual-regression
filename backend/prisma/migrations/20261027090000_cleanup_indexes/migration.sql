-- DropIndex
DROP INDEX "UnifiedComparison_status_idx";

-- CreateIndex
CREATE INDEX "ComparisonJob_status_completedAt_idx" ON "ComparisonJob"("status", "completedAt");

-- CreateIndex
CREATE INDEX "ComparisonJob_testId_idx" ON "ComparisonJob"("testId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "UnifiedComparison_status_createdAt_idx" ON "UnifiedComparison"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UnifiedComparison_diffImageUrl_idx" ON "UnifiedComparison"("diffImageUrl");

-- CreateIndex
CREATE INDEX "UnifiedComparison_diffPdfUrl_idx" ON "UnifiedComparison"("diffPdfUrl");

-- CreateIndex
CREATE INDEX "UnifiedScreenshot_imageUrl_idx" ON "UnifiedScreenshot"("imageUrl");


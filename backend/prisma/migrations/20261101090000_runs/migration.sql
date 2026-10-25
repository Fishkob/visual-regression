-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "runId" TEXT,
ADD COLUMN     "runKey" TEXT;

-- AlterTable
ALTER TABLE "ComparisonJob" ADD COLUMN     "runId" TEXT,
ADD COLUMN     "runKey" TEXT;

-- AlterTable
ALTER TABLE "UnifiedComparison" ADD COLUMN     "runId" TEXT,
ADD COLUMN     "runKey" TEXT;

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "commitSha" TEXT,
    "commitMessage" TEXT,
    "ciUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "finishedBy" TEXT,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Run_projectId_createdAt_idx" ON "Run"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Run_finishedAt_lastActivityAt_idx" ON "Run"("finishedAt", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "Run_branchId_key_key" ON "Run"("branchId", "key");

-- CreateIndex
CREATE INDEX "Approval_runId_idx" ON "Approval"("runId");

-- CreateIndex
CREATE INDEX "Approval_runKey_idx" ON "Approval"("runKey");

-- CreateIndex
CREATE INDEX "ComparisonJob_runId_idx" ON "ComparisonJob"("runId");

-- CreateIndex
CREATE INDEX "ComparisonJob_runKey_idx" ON "ComparisonJob"("runKey");

-- CreateIndex
CREATE INDEX "UnifiedComparison_runId_idx" ON "UnifiedComparison"("runId");

-- CreateIndex
CREATE INDEX "UnifiedComparison_runKey_idx" ON "UnifiedComparison"("runKey");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;


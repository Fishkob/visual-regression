-- CreateTable
CREATE TABLE "ReviewAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "branchName" TEXT,
    "testId" TEXT,
    "runId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "assigneeUsername" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewAssignment_assigneeId_completedAt_idx" ON "ReviewAssignment"("assigneeId", "completedAt");

-- CreateIndex
CREATE INDEX "ReviewAssignment_projectId_idx" ON "ReviewAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ReviewAssignment_testId_idx" ON "ReviewAssignment"("testId");

-- CreateIndex
CREATE INDEX "ReviewAssignment_runId_idx" ON "ReviewAssignment"("runId");

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_testId_fkey" FOREIGN KEY ("testId") REFERENCES "UnifiedTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


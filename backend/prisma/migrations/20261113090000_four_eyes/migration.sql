-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "requiredApprovals" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ApprovalVote" (
    "id" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalVote_projectName_approvedAt_idx" ON "ApprovalVote"("projectName", "approvedAt");

-- CreateIndex
CREATE INDEX "ApprovalVote_comparisonId_idx" ON "ApprovalVote"("comparisonId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalVote_comparisonId_userId_key" ON "ApprovalVote"("comparisonId", "userId");


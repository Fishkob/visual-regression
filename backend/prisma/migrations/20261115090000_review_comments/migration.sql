-- CreateEnum
CREATE TYPE "ApprovalReason" AS ENUM ('INTENDED_CHANGE', 'FLAKE', 'INFRA');

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "note" TEXT,
ADD COLUMN     "reason" "ApprovalReason";

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "branchName" TEXT,
    "testId" TEXT NOT NULL,
    "comparisonId" TEXT,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "author" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewComment_testId_createdAt_idx" ON "ReviewComment"("testId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewComment_comparisonId_idx" ON "ReviewComment"("comparisonId");

-- CreateIndex
CREATE INDEX "ReviewComment_projectName_createdAt_idx" ON "ReviewComment"("projectName", "createdAt");


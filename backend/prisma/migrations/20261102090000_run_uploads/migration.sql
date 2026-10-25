-- CreateTable
CREATE TABLE "RunUpload" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "kind" "TestKind" NOT NULL,
    "viewport" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunUpload_runId_testId_idx" ON "RunUpload"("runId", "testId");

-- CreateIndex
CREATE INDEX "RunUpload_testId_idx" ON "RunUpload"("testId");

-- AddForeignKey
ALTER TABLE "RunUpload" ADD CONSTRAINT "RunUpload_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;


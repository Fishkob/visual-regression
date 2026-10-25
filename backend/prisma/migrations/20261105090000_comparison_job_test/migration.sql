-- AddForeignKey
ALTER TABLE "ComparisonJob" ADD CONSTRAINT "ComparisonJob_testId_fkey" FOREIGN KEY ("testId") REFERENCES "UnifiedTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


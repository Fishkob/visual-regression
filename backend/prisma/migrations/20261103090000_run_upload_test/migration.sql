-- AddForeignKey
ALTER TABLE "RunUpload" ADD CONSTRAINT "RunUpload_testId_fkey" FOREIGN KEY ("testId") REFERENCES "UnifiedTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


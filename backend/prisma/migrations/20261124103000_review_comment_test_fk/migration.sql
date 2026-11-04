-- The discussion is owned by its test.
--
-- ReviewComment was created FK-less on purpose (a comparison row is deleted on
-- approval, and the discussion that led to it has to survive that), but the same
-- argument was never true for the test: `TestDeletionService` deleted the
-- comments by hand in its own transaction and `ReviewArtifactCleanupTask`
-- swept what an older or concurrent path had already orphaned. Two mechanisms
-- and a daily sweep stood in for one foreign key. The comparison link stays
-- FK-less — that half of the original decision is still right (ADR-064).
--
-- Orphans first: they are the rows the sweep existed for, and the only ones a
-- NOT VALID-free constraint cannot accept. They are already unreachable by the
-- review UI (comments are read by testId, and the test is gone).
DELETE FROM "ReviewComment" c
WHERE NOT EXISTS (SELECT 1 FROM "UnifiedTest" t WHERE t."id" = c."testId");

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_testId_fkey" FOREIGN KEY ("testId") REFERENCES "UnifiedTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

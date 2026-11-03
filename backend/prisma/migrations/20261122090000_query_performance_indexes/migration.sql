-- Every reviewer-facing search matches names with `ILIKE '%q%'` (Prisma's
-- `contains` + `mode: 'insensitive'`), which no btree index can serve: without
-- the pg_trgm operator class each of those queries is a sequential scan over
-- Project/Branch/UnifiedTest. The extension has to exist before the trigram
-- indexes are created, so it is created first in the same migration.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Branch_name_trgm_idx" ON "Branch" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Project_name_trgm_idx" ON "Project" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "UnifiedTest_name_trgm_idx" ON "UnifiedTest" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_createdAt_idx" ON "WebhookDelivery"("status", "createdAt");

-- NOTE on large installations: Prisma runs a migration inside a transaction, so
-- these indexes are built under a write lock (ShareLock on the table, blocking
-- writes for the duration). On a database where these tables are large, build
-- them out of band instead and mark this migration as applied:
--
--   CREATE INDEX CONCURRENTLY "Branch_name_trgm_idx"      ON "Branch"      USING GIN ("name" gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY "Project_name_trgm_idx"     ON "Project"     USING GIN ("name" gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY "UnifiedTest_name_trgm_idx" ON "UnifiedTest" USING GIN ("name" gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY "WebhookDelivery_status_createdAt_idx" ON "WebhookDelivery"("status", "createdAt");
--   prisma migrate resolve --applied 20261122090000_query_performance_indexes

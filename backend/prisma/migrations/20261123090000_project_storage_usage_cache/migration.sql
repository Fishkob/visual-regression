-- Cached evidence byte total for the quota check (ADR-060). Nullable on
-- purpose: NULL means "never computed", which is different from "0 bytes", and
-- the first quota check of a project derives the value from its rows.
--
-- No backfill here: the rows are the truth and every quota check re-derives a
-- stale value from them, so a new installation and an upgraded one behave
-- identically (the first upload of a project pays one aggregate).
ALTER TABLE "Project" ADD COLUMN     "storageUsageComputedAt" TIMESTAMP(3),
ADD COLUMN     "storageUsedBytes" BIGINT;

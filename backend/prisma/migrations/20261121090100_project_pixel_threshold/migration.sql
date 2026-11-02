-- Project-wide default pixel tolerance. A NULL means "no project default": the
-- effective threshold of a variant is its own baseline threshold, else this
-- value, else 0. Additive and nullable, so no backfill is needed.
ALTER TABLE "Project" ADD COLUMN "pixelDiffThreshold" INTEGER;

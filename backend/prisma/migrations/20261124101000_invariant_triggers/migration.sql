-- Database backstops for two invariants the code owned alone.
--
-- Prisma cannot express a partial unique index without `migrate dev` dropping it
-- as drift, so the guarantee is a trigger instead. Triggers are invisible to the
-- Prisma schema diff and survive regeneration.

-- ---------------------------------------------------------------------------
-- 1. At most one reviewable comparison per variant.
--
-- ComparisonRetirementService retires the superseded comparison before the new
-- one is written, but two workers can pass their read at the same time. The
-- advisory lock serialises the check per baseline, so the second insert waits
-- and then sees the first one instead of both committing. The unique key is
-- wrong here on purpose: approved PDF comparisons are retained and share a
-- baseline over time, so only PENDING_APPROVAL rows are constrained.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_single_pending_comparison()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'PENDING_APPROVAL' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."baselineId", 0));
    IF EXISTS (
      SELECT 1
      FROM "UnifiedComparison" c
      WHERE c."baselineId" = NEW."baselineId"
        AND c.status = 'PENDING_APPROVAL'
        AND c.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'baseline % already has a pending comparison', NEW."baselineId"
        USING ERRCODE = '23505',
              HINT = 'Retire the superseded comparison before creating a new one.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnifiedComparison_single_pending"
  BEFORE INSERT OR UPDATE OF "status", "baselineId" ON "UnifiedComparison"
  FOR EACH ROW EXECUTE FUNCTION enforce_single_pending_comparison();

-- ---------------------------------------------------------------------------
-- 2. An API key does not keep the id of a deleted project.
--
-- The allowlist is a text[] (no foreign key), so deleting a project would leave
-- a dead id that the key list renders back. Removing it in the delete's own
-- transaction keeps the stored scope equal to the projects that exist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forget_deleted_project_in_api_keys()
RETURNS trigger AS $$
BEGIN
  UPDATE "ApiKey"
  SET "projectIds" = array_remove("projectIds", OLD."id")
  WHERE OLD."id" = ANY ("projectIds");
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Project_forget_api_key_scope"
  BEFORE DELETE ON "Project"
  FOR EACH ROW EXECUTE FUNCTION forget_deleted_project_in_api_keys();

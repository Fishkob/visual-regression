-- Project identity is the id, not the name.
--
-- A project can be renamed (`PATCH /projects/:projectName`) and its name can be
-- reused after a deletion. Everything that stored the name therefore had two
-- failure modes: a rename silently broke the reference, and a recreated name
-- silently adopted the old rows. Security-relevant rows (share links, api-key
-- allowlists) and the history/trend reads are moved to the id.

-- ---------------------------------------------------------------------------
-- 1. Share links: id + foreign key, so a link cannot outlive its project.
-- ---------------------------------------------------------------------------
ALTER TABLE "ShareLink" ADD COLUMN "projectId" TEXT;

UPDATE "ShareLink" s
SET "projectId" = p."id"
FROM "Project" p
WHERE p."name" = s."projectName";

-- An orphaned link (its project is already gone) has no target to point at.
-- The rule the delete path already states applies here: a token keyed by a name
-- that no longer exists must not survive to be revived.
DELETE FROM "ShareLink" WHERE "projectId" IS NULL;

ALTER TABLE "ShareLink" ALTER COLUMN "projectId" SET NOT NULL;

DROP INDEX "ShareLink_projectName_idx";
CREATE INDEX "ShareLink_projectId_idx" ON "ShareLink"("projectId");

ALTER TABLE "ShareLink"
  ADD CONSTRAINT "ShareLink_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShareLink" DROP COLUMN "projectName";

-- ---------------------------------------------------------------------------
-- 2. API key allowlists: names -> ids.
--
-- Empty means "all projects" in both shapes. A key whose non-empty allowlist
-- no longer resolves to a single project would become unrestricted after the
-- conversion, so such a key is revoked rather than widened: it could not match
-- a project request before the migration either, and describing it as active
-- would be wrong.
-- ---------------------------------------------------------------------------
ALTER TABLE "ApiKey" ADD COLUMN "projectIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "ApiKey" a
SET "projectIds" = COALESCE(
  (
    SELECT array_agg(p."id" ORDER BY p."name")
    FROM "Project" p
    WHERE p."name" = ANY (a."projectNames")
  ),
  ARRAY[]::TEXT[]
);

UPDATE "ApiKey"
SET "revokedAt" = COALESCE("revokedAt", now()),
    "revokedReason" = COALESCE("revokedReason", 'project-scope-unresolved-after-migration')
WHERE cardinality("projectNames") > 0
  AND cardinality("projectIds") = 0;

ALTER TABLE "ApiKey" DROP COLUMN "projectNames";

-- ---------------------------------------------------------------------------
-- 3. History tables get a stable project id.
--
-- They keep the name as the display snapshot (and as the fallback for rows
-- whose project is already deleted). The trigger resolves the id from the name
-- on insert, so every existing writer — approval service, audit service,
-- comparison outcome service — keeps writing what it wrote and cannot forget
-- the id. Prisma does not model triggers, so `migrate dev` leaves them alone.
-- ---------------------------------------------------------------------------
ALTER TABLE "Approval" ADD COLUMN "projectId" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ComparisonOutcomeEvent" ADD COLUMN "projectId" TEXT;

UPDATE "Approval" a SET "projectId" = p."id" FROM "Project" p WHERE p."name" = a."projectName";
UPDATE "AuditEvent" e SET "projectId" = p."id" FROM "Project" p WHERE p."name" = e."projectName";
UPDATE "ComparisonOutcomeEvent" e SET "projectId" = p."id" FROM "Project" p WHERE p."name" = e."projectName";

DROP INDEX "Approval_projectName_testName_approvedAt_idx";
CREATE INDEX "Approval_projectId_testName_approvedAt_idx" ON "Approval"("projectId", "testName", "approvedAt");

DROP INDEX "AuditEvent_projectName_createdAt_idx";
CREATE INDEX "AuditEvent_projectId_createdAt_idx" ON "AuditEvent"("projectId", "createdAt");

DROP INDEX "ComparisonOutcomeEvent_projectName_createdAt_idx";
CREATE INDEX "ComparisonOutcomeEvent_projectId_createdAt_idx" ON "ComparisonOutcomeEvent"("projectId", "createdAt");

CREATE OR REPLACE FUNCTION set_project_id_from_name()
RETURNS trigger AS $$
BEGIN
  IF NEW."projectId" IS NULL AND NEW."projectName" IS NOT NULL THEN
    SELECT p."id" INTO NEW."projectId" FROM "Project" p WHERE p."name" = NEW."projectName";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Approval_set_project_id"
  BEFORE INSERT ON "Approval"
  FOR EACH ROW EXECUTE FUNCTION set_project_id_from_name();

CREATE TRIGGER "AuditEvent_set_project_id"
  BEFORE INSERT ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION set_project_id_from_name();

CREATE TRIGGER "ComparisonOutcomeEvent_set_project_id"
  BEFORE INSERT ON "ComparisonOutcomeEvent"
  FOR EACH ROW EXECUTE FUNCTION set_project_id_from_name();

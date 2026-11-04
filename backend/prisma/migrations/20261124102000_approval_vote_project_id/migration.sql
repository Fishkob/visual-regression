-- ApprovalVote is the fourth history table and the one the project-identity
-- migration missed: it kept `projectName` as its only project reference, so a
-- rename split the four-eyes trail exactly like it split the approval, audit
-- and trend trails before ADR-061. The id is resolved by the same
-- set_project_id_from_name() trigger the other three use, so no writer changes:
-- the approval service keeps passing the name it has.
ALTER TABLE "ApprovalVote" ADD COLUMN "projectId" TEXT;

-- Backfill from the live project. A vote whose project is already deleted keeps
-- NULL, like the other history tables: it cannot be attributed.
UPDATE "ApprovalVote" v
SET "projectId" = p."id"
FROM "Project" p
WHERE p."name" = v."projectName";

CREATE TRIGGER "ApprovalVote_set_project_id"
  BEFORE INSERT ON "ApprovalVote"
  FOR EACH ROW EXECUTE FUNCTION set_project_id_from_name();

-- The `(projectName, approvedAt)` index goes with the column change. Nothing
-- reads votes by project today (the repository counts and uniqueness-checks by
-- comparisonId), so it was write cost on every vote — and a name-keyed index is
-- the wrong index for the read that eventually arrives. That read adds
-- `(projectId, approvedAt)` when it exists.
--
-- DropIndex
DROP INDEX "ApprovalVote_projectName_approvedAt_idx";

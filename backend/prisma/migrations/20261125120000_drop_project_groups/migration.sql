-- The team is the only project axis (ADR-084).
--
-- `ProjectGroup` and `Project.groupId` are dropped: the group was a navigation
-- label that granted no access and decided nothing, and since ADR-083 every
-- project already sits in exactly one team — a bucket that means something. The
-- projects, branches, tests, baselines, comparisons, approvals and audit rows
-- are untouched; only the folder name is lost. A deployment that wants to keep
-- its folder names exports `GET /groups` and the projects' `groupId` before this
-- migration runs.

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_groupId_fkey";

-- DropIndex
DROP INDEX "Project_groupId_idx";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "groupId";

-- DropTable
DROP TABLE "ProjectGroup";

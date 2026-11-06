-- Remove the 4-eyes approval gate (ADR-066).
--
-- `Project.requiredApprovals` let a project require more than one approval
-- before a comparison finalized; `ApprovalVote` recorded the individual votes
-- that reached that threshold. Both go: the comparison finalizes on the one
-- approval again, so the votes have no reader and the project field no writer.
--
-- The four-eyes trail is deleted deliberately, not silently: ADR-050 kept it as
-- audit, and this migration supersedes that decision for installations that
-- carried a gate. `Approval` and `AuditEvent` remain the durable record of the
-- approvals themselves.

-- DropTable
--
-- This also drops the `ApprovalVote_set_project_id` trigger and the
-- `(comparisonId)`, `(comparisonId, userId)` and primary-key indexes; the
-- `set_project_id_from_name()` function stays, the other history tables use it.
DROP TABLE "ApprovalVote";

-- DropForeignKey (none: the column had no foreign key, only the check below)

-- AlterTable
--
-- The `Project_requiredApprovals_check` from 20261124090000_schema_hardening
-- belongs to the column and goes with it.
ALTER TABLE "Project" DROP CONSTRAINT "Project_requiredApprovals_check";
ALTER TABLE "Project" DROP COLUMN "requiredApprovals";

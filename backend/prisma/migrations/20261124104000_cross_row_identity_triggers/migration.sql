-- Cross-row identities the schema cannot express as foreign keys.
--
-- Five columns name another row's owner twice: a screenshot carries the test of
-- its variant, a comparison the test of the baseline (and candidate) it compares,
-- a run the project of its branch, a branch the project of its target, a project
-- the project of its default branch. Prisma can model none of them as a
-- composite foreign key without adding a redundant scalar column per relation,
-- and a hand-written constraint would be dropped as drift by the next
-- `prisma migrate dev`. CONTEXT.md therefore listed them as application-enforced.
--
-- Triggers are the established answer to exactly that problem (ADR-063: invisible
-- to the schema diff, so they survive regeneration). A single indexed primary-key
-- lookup per write is the cost; the alternative is a row that reads as belonging
-- to two different tests and produces a diff against someone else's image.
--
-- Not enforced: `UnifiedVariant.baselineId` pointing at a screenshot of the same
-- test. The PDF download guards reject a foreign baseline with 403, and the e2e
-- suite builds that exact state to exercise them; a constraint would make the
-- guard unreachable from a test that also runs against the real database. Named
-- exception, see ADR-065.
--
-- The guard blocks below make an upgrade fail here, loudly, if an installation
-- already carries a mismatch: a trigger would not touch existing rows, so the
-- first write to such a row would fail with a message about a row nobody
-- remembers creating. Nothing to clean is invented — a violating row needs a
-- human.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "UnifiedScreenshot" s
    JOIN "UnifiedVariant" v ON v."id" = s."variantId"
    WHERE s."testId" <> v."testId"
  ) THEN
    RAISE EXCEPTION 'UnifiedScreenshot.testId does not match its variant''s testId; fix the rows before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "UnifiedComparison" c
    JOIN "UnifiedScreenshot" b ON b."id" = c."baselineId"
    WHERE c."testId" <> b."testId"
  ) THEN
    RAISE EXCEPTION 'UnifiedComparison.testId does not match its baseline''s testId; fix the rows before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "UnifiedComparison" c
    JOIN "UnifiedScreenshot" k ON k."id" = c."candidateId"
    WHERE c."testId" <> k."testId"
  ) THEN
    RAISE EXCEPTION 'UnifiedComparison.testId does not match its candidate''s testId; fix the rows before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Run" r
    JOIN "Branch" b ON b."id" = r."branchId"
    WHERE r."projectId" <> b."projectId"
  ) THEN
    RAISE EXCEPTION 'Run.projectId does not match its branch''s projectId; fix the rows before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Branch" b
    JOIN "Branch" t ON t."id" = b."targetBranchId"
    WHERE t."projectId" <> b."projectId"
  ) THEN
    RAISE EXCEPTION 'Branch.targetBranchId points at a branch of another project; fix the rows before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Project" p
    JOIN "Branch" b ON b."id" = p."defaultBranchId"
    WHERE b."projectId" <> p."id"
  ) THEN
    RAISE EXCEPTION 'Project.defaultBranchId points at a branch of another project; fix the rows before applying this migration';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. A screenshot belongs to its variant's test.
--
-- The unique key `(testId, variantId, type)` already keeps a test from holding
-- two CURRENT rows, but it accepts the same variant under two different testIds
-- — and `UnifiedScreenshot.testId` is what every reader filters by.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_screenshot_belongs_to_variant()
RETURNS trigger AS $$
DECLARE
  variant_test_id TEXT;
BEGIN
  SELECT v."testId" INTO variant_test_id
  FROM "UnifiedVariant" v
  WHERE v."id" = NEW."variantId";

  IF variant_test_id IS DISTINCT FROM NEW."testId" THEN
    RAISE EXCEPTION 'screenshot % names test %, but its variant % belongs to test %',
      NEW."id", NEW."testId", NEW."variantId", variant_test_id
      USING ERRCODE = '23514',
            HINT = 'Write the screenshot under the variant''s test.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnifiedScreenshot_test_matches_variant"
  BEFORE INSERT OR UPDATE OF "testId", "variantId" ON "UnifiedScreenshot"
  FOR EACH ROW EXECUTE FUNCTION enforce_screenshot_belongs_to_variant();

-- ---------------------------------------------------------------------------
-- 2. A comparison compares screenshots of its own test.
--
-- The baseline is read for every review page and the candidate for the diff, so
-- a cross-test pair renders one test's evidence under another test's review —
-- silently. `candidateId` is nullable (a retained, approved PDF comparison
-- detaches it), hence IF NOT NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_comparison_test_matches_screenshots()
RETURNS trigger AS $$
DECLARE
  baseline_test_id  TEXT;
  candidate_test_id TEXT;
BEGIN
  SELECT b."testId" INTO baseline_test_id
  FROM "UnifiedScreenshot" b
  WHERE b."id" = NEW."baselineId";

  IF baseline_test_id IS DISTINCT FROM NEW."testId" THEN
    RAISE EXCEPTION 'comparison % names test %, but its baseline % belongs to test %',
      NEW."id", NEW."testId", NEW."baselineId", baseline_test_id
      USING ERRCODE = '23514',
            HINT = 'Write the comparison under its baseline''s test.';
  END IF;

  IF NEW."candidateId" IS NOT NULL THEN
    SELECT k."testId" INTO candidate_test_id
    FROM "UnifiedScreenshot" k
    WHERE k."id" = NEW."candidateId";

    IF candidate_test_id IS DISTINCT FROM NEW."testId" THEN
      RAISE EXCEPTION 'comparison % names test %, but its candidate % belongs to test %',
        NEW."id", NEW."testId", NEW."candidateId", candidate_test_id
        USING ERRCODE = '23514',
              HINT = 'Write the comparison under its candidate''s test.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnifiedComparison_test_matches_screenshots"
  BEFORE INSERT OR UPDATE OF "testId", "baselineId", "candidateId" ON "UnifiedComparison"
  FOR EACH ROW EXECUTE FUNCTION enforce_comparison_test_matches_screenshots();

-- ---------------------------------------------------------------------------
-- 3. A run belongs to the project of its branch.
--
-- `Run.projectId` exists so a project's run list is one indexed read; the
-- column duplicates `branch.project` by construction, which is exactly the kind
-- of copy the branch migration deleted from `UnifiedTest` (its project is
-- reached through the branch). The copy stays for the read; the trigger makes
-- the two facts unable to disagree.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_run_project_matches_branch()
RETURNS trigger AS $$
DECLARE
  branch_project_id TEXT;
BEGIN
  SELECT b."projectId" INTO branch_project_id
  FROM "Branch" b
  WHERE b."id" = NEW."branchId";

  IF branch_project_id IS DISTINCT FROM NEW."projectId" THEN
    RAISE EXCEPTION 'run % names project %, but its branch % belongs to project %',
      NEW."id", NEW."projectId", NEW."branchId", branch_project_id
      USING ERRCODE = '23514',
            HINT = 'Resolve the run''s project from its branch.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Run_project_matches_branch"
  BEFORE INSERT OR UPDATE OF "projectId", "branchId" ON "Run"
  FOR EACH ROW EXECUTE FUNCTION enforce_run_project_matches_branch();

-- ---------------------------------------------------------------------------
-- 4. A branch's target is a branch of the same project.
--
-- The inherited-baseline chain walks `targetBranchId`; a cross-project target
-- would make one project's review state depend on another project's baseline.
-- `NULL` means "the project's current default branch" and is legal, as is the
-- `ON DELETE SET NULL` update that produces it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_branch_target_in_project()
RETURNS trigger AS $$
DECLARE
  target_project_id TEXT;
BEGIN
  IF NEW."targetBranchId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t."projectId" INTO target_project_id
  FROM "Branch" t
  WHERE t."id" = NEW."targetBranchId";

  IF target_project_id IS DISTINCT FROM NEW."projectId" THEN
    RAISE EXCEPTION 'branch % targets branch %, which belongs to another project',
      NEW."id", NEW."targetBranchId"
      USING ERRCODE = '23514',
            HINT = 'A branch can only inherit from a branch of its own project.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Branch_target_in_project"
  BEFORE INSERT OR UPDATE OF "targetBranchId", "projectId" ON "Branch"
  FOR EACH ROW EXECUTE FUNCTION enforce_branch_target_in_project();

-- ---------------------------------------------------------------------------
-- 5. A project's default branch is a branch of that project.
--
-- `defaultBranchId` is unique, so it was already impossible for two projects to
-- claim one branch — but nothing stopped a project from claiming a branch that
-- belongs to a different one, and "omitting `branch` means the default branch"
-- would then resolve into the wrong project.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_default_branch_in_project()
RETURNS trigger AS $$
DECLARE
  branch_project_id TEXT;
BEGIN
  IF NEW."defaultBranchId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b."projectId" INTO branch_project_id
  FROM "Branch" b
  WHERE b."id" = NEW."defaultBranchId";

  IF branch_project_id IS DISTINCT FROM NEW."id" THEN
    RAISE EXCEPTION 'project % names branch % as its default, but that branch belongs to another project',
      NEW."id", NEW."defaultBranchId"
      USING ERRCODE = '23514',
            HINT = 'A project''s default branch must be its own.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Project_default_branch_in_project"
  BEFORE INSERT OR UPDATE OF "defaultBranchId" ON "Project"
  FOR EACH ROW EXECUTE FUNCTION enforce_default_branch_in_project();

-- A project always has a team, and "everyone" becomes a flag (ADR-083).
--
-- `Project.teamId` goes from nullable to NOT NULL, and `Project.isShared`
-- replaces the state that `null` used to mean. The index and the
-- `ON DELETE RESTRICT` foreign key from ADR-082 stay: a team that owns projects
-- is not deletable, and a project has exactly one owner.
--
-- The upgrade changes nobody's view. Projects that carry no owner are adopted
-- into one ordinary team (`general`) and get `isShared = true`, which is exactly
-- what "no team" meant before: visible to every authenticated principal. The
-- adopting team needs no members — its projects are visible through the flag,
-- not through membership — and it is not special: it can be renamed, emptied and
-- deleted like any other team. A deployment with nothing to adopt gets no such
-- team, and an existing team that already answers to `general` is reused instead
-- of failing the unique index.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isShared" BOOLEAN NOT NULL DEFAULT false;

-- Adopt the ownerless projects (see the header). Only the migration ever writes
-- a project without an owner, so this is the one place the nullable state is
-- still visible.
INSERT INTO "Team" ("id", "name", "createdBy", "createdAt")
SELECT gen_random_uuid()::text, 'general', NULL, now()
WHERE EXISTS (SELECT 1 FROM "Project" WHERE "teamId" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "Team" WHERE "name" = 'general');

UPDATE "Project"
SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'general'),
    "isShared" = true
WHERE "teamId" IS NULL;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "teamId" SET NOT NULL;

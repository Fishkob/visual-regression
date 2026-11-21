-- Team-scoped project access, schema half (ADR-082).
--
-- A Team owns Projects and has members; the access narrowing it implies is a
-- separate step. Two properties are decisions, not defaults:
--
--   * `Project.teamId` is NULLABLE. Null means "shared": every authenticated
--     principal keeps seeing that project, so this migration changes nobody's
--     view and an existing deployment upgrades to exactly what it had. Tagging a
--     project is the act that narrows access.
--   * `Project_teamId_fkey` is ON DELETE RESTRICT. A cascade (or SET NULL) would
--     silently turn a deleted team's products into shared ones — a widening
--     nobody asked for. Deleting a team that still owns projects fails here and
--     is reported as a 409 by the service.
--
-- `TeamMember` cascades on both sides: a deleted user or team leaves no
-- dangling membership, and `@@id([teamId, userId])` makes a duplicate
-- membership unrepresentable. The `userId` index serves the reverse lookup
-- ("which teams is this user in"), which is what a session request will ask.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX "Project_teamId_idx" ON "Project"("teamId");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

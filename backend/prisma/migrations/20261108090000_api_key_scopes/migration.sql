-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "projectNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY['upload', 'read', 'approve']::TEXT[];

-- CreateIndex
CREATE INDEX "ApiKey_ownerId_idx" ON "ApiKey"("ownerId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


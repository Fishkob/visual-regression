-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "keyHint" TEXT,
ADD COLUMN "createdBy" TEXT,
ADD COLUMN "lastUsedAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "revokedReason" TEXT,
ADD COLUMN "replacedById" TEXT;

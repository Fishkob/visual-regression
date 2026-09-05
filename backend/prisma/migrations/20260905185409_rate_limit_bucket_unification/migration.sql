/*
  Warnings:

  - You are about to drop the `ApiKeyRateLimitBucket` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ApiKeyRateLimitBucket" DROP CONSTRAINT "ApiKeyRateLimitBucket_apiKeyId_fkey";

-- DropTable
DROP TABLE "ApiKeyRateLimitBucket";

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_scope_key_windowStart_key" ON "RateLimitBucket"("scope", "key", "windowStart");

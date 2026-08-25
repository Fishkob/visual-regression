-- CreateTable
CREATE TABLE "ApiKeyRateLimitBucket" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKeyRateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiKeyRateLimitBucket_windowStart_idx" ON "ApiKeyRateLimitBucket"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKeyRateLimitBucket_apiKeyId_windowStart_key" ON "ApiKeyRateLimitBucket"("apiKeyId", "windowStart");

-- AddForeignKey
ALTER TABLE "ApiKeyRateLimitBucket" ADD CONSTRAINT "ApiKeyRateLimitBucket_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

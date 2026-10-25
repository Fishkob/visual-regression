-- AlterTable
ALTER TABLE "WebhookDelivery" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_claimedAt_idx" ON "WebhookDelivery"("status", "claimedAt");

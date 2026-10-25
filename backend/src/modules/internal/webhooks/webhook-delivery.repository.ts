import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { Prisma } from '@/prisma/client';
import type {
  WebhookDeliveryRow,
  WebhookPayload,
} from '@internal/webhooks/webhook.types';

// A row left in PROCESSING longer than this is presumed abandoned (dispatcher
// crash, restart, killed process) and is returned to PENDING. The lease bounds
// how long a delivery can silently vanish; an expired claim gets re-delivered,
// which the at-least-once contract already allows.
export const WEBHOOK_PROCESSING_LEASE_MINUTES = 10;

@Injectable()
export class WebhookDeliveryRepository extends BaseRepository {
  // Outbox write: one row per subscribed endpoint, in the caller's transaction
  // when the event comes from a StateChangeWorkflow.
  async createMany(
    endpointIds: string[],
    event: string,
    payload: WebhookPayload,
  ): Promise<number> {
    if (endpointIds.length === 0) return 0;
    const result = await this.client.webhookDelivery.createMany({
      data: endpointIds.map((endpointId) => ({
        endpointId,
        event,
        payload: payload as unknown as Prisma.InputJsonValue,
      })),
    });
    return result.count;
  }

  async create(
    endpointId: string,
    event: string,
    payload: WebhookPayload,
  ): Promise<WebhookDeliveryRow> {
    return this.client.webhookDelivery.create({
      data: {
        endpointId,
        event,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Reclaim expired claims before claiming: a row whose dispatcher died stays
  // PROCESSING forever otherwise. Attempts are deliberately NOT reset (the
  // retry budget is the delivery's, not the claim's) and nextAttemptAt is set
  // to NOW() so the row is claimable in the same cycle. Rows claimed before
  // this column existed fall back to createdAt for an age estimate.
  async reclaimExpired(): Promise<number> {
    return this.client.$executeRaw(Prisma.sql`
      UPDATE "WebhookDelivery"
      SET "status" = 'PENDING'::"WebhookDeliveryStatus",
          "nextAttemptAt" = NOW(),
          "claimedAt" = NULL
      WHERE "status" = 'PROCESSING'::"WebhookDeliveryStatus"
        AND COALESCE("claimedAt", "createdAt") <
            NOW() - make_interval(mins => ${WEBHOOK_PROCESSING_LEASE_MINUTES})
    `);
  }

  // Atomic claim: expired claims are returned to PENDING first, then the
  // sub-select locks the due rows, the UPDATE flips them to PROCESSING (with
  // the lease start stamped) and RETURNING hands them to the dispatcher.
  async claimDue(limit: number): Promise<WebhookDeliveryRow[]> {
    await this.reclaimExpired();
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    return this.client.$queryRawUnsafe<WebhookDeliveryRow[]>(
      `UPDATE "WebhookDelivery"
       SET "status" = 'PROCESSING'::"WebhookDeliveryStatus",
           "claimedAt" = NOW()
       WHERE "id" IN (
         SELECT "id" FROM "WebhookDelivery"
         WHERE "status" = 'PENDING'::"WebhookDeliveryStatus"
           AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
         ORDER BY "createdAt"
         LIMIT ${safeLimit}
         FOR UPDATE SKIP LOCKED
       )
       RETURNING "id", "endpointId", "event", "payload", "status", "attempts",
                 "nextAttemptAt", "responseStatus", "lastError", "claimedAt",
                 "createdAt", "deliveredAt"`,
    );
  }

  async listForEndpoint(
    endpointId: string,
    take: number,
  ): Promise<WebhookDeliveryRow[]> {
    return this.client.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async findByIdForEndpoint(
    endpointId: string,
    id: string,
  ): Promise<WebhookDeliveryRow | null> {
    return this.client.webhookDelivery.findFirst({
      where: { id, endpointId },
    });
  }

  async markDelivered(id: string, responseStatus: number): Promise<void> {
    await this.client.webhookDelivery.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        responseStatus,
        lastError: null,
        deliveredAt: new Date(),
        claimedAt: null,
      },
    });
  }

  async markTerminalFailure(
    id: string,
    attempts: number,
    error: string,
    responseStatus: number | null,
  ): Promise<void> {
    await this.client.webhookDelivery.update({
      where: { id },
      data: {
        status: 'FAILED',
        attempts,
        lastError: error,
        responseStatus,
        nextAttemptAt: null,
        claimedAt: null,
      },
    });
  }

  async markForRetry(
    id: string,
    attempts: number,
    error: string,
    responseStatus: number | null,
    nextAttemptAt: Date,
  ): Promise<void> {
    await this.client.webhookDelivery.update({
      where: { id },
      data: {
        status: 'PENDING',
        attempts,
        lastError: error,
        responseStatus,
        nextAttemptAt,
        claimedAt: null,
      },
    });
  }

  async replay(id: string): Promise<void> {
    await this.client.webhookDelivery.update({
      where: { id },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        responseStatus: null,
        lastError: null,
        deliveredAt: null,
        claimedAt: null,
      },
    });
  }
}

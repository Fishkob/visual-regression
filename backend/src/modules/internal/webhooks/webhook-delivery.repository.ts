import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { Prisma } from '@/prisma/client';
import type {
  WebhookDeliveryRow,
  WebhookPayload,
} from '@internal/webhooks/webhook.types';
import { WEBHOOK_MAX_ATTEMPTS } from '@internal/webhooks/webhook-backoff';

// A row left in PROCESSING longer than this is presumed abandoned (dispatcher
// crash, restart, killed process) and is returned to PENDING. The lease bounds
// how long a delivery can silently vanish; an expired claim gets re-delivered,
// which the at-least-once contract already allows.
export const WEBHOOK_PROCESSING_LEASE_MINUTES = 10;

@Injectable()
export class WebhookDeliveryRepository extends BaseRepository {
  // Outbox write: one row per subscribed endpoint, always inside the
  // StateChangeWorkflow transaction of the change it announces — `assertWritable`
  // makes that a guarantee instead of a comment.
  async createMany(
    endpointIds: string[],
    event: string,
    payload: WebhookPayload,
  ): Promise<number> {
    if (endpointIds.length === 0) return 0;
    this.assertWritable();
    const result = await this.client.webhookDelivery.createMany({
      data: endpointIds.map((endpointId) => ({
        endpointId,
        event,
        payload: payload as unknown as Prisma.InputJsonValue,
      })),
    });
    return result.count;
  }

  // The endpoint test button writes one row with no domain change to ride, so
  // this one deliberately does NOT assert a transaction.
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
  // to now so the row is claimable in the same cycle. Rows claimed before this
  // column existed fall back to createdAt for an age estimate.
  // A claim whose worker died is returned to PENDING, but the attempt counts:
  // a delivery that consistently crashes the process must exhaust its budget
  // instead of looping forever. Rows that would exceed the budget are failed
  // first, so the second statement only touches the retryable remainder.
  //
  // Prisma rather than SQL: the lease age is a plain timestamp comparison and
  // the budget check is `attempts >= MAX - 1`, the same integer arithmetic as
  // the SQL's `attempts + 1 >= MAX`. Only the claim below needs raw SQL
  // (FOR UPDATE SKIP LOCKED + RETURNING).
  async reclaimExpired(): Promise<number> {
    const now = new Date();
    const leaseCutoff = new Date(
      now.getTime() - WEBHOOK_PROCESSING_LEASE_MINUTES * 60_000,
    );
    const expiredLease = {
      status: 'PROCESSING' as const,
      OR: [
        { claimedAt: { lt: leaseCutoff } },
        { claimedAt: null, createdAt: { lt: leaseCutoff } },
      ],
    };

    await this.client.webhookDelivery.updateMany({
      where: { ...expiredLease, attempts: { gte: WEBHOOK_MAX_ATTEMPTS - 1 } },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        lastError: 'Delivery lease expired',
        nextAttemptAt: null,
        claimedAt: null,
      },
    });

    const requeued = await this.client.webhookDelivery.updateMany({
      where: expiredLease,
      data: {
        status: 'PENDING',
        attempts: { increment: 1 },
        nextAttemptAt: now,
        claimedAt: null,
      },
    });
    return requeued.count;
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

  // Every write is guarded by the PROCESSING status the claim stamped, so a row
  // that vanished (endpoint deleted, cascade) or whose claim was lost (shutdown
  // drain released it) is a no-op instead of a P2025 that aborts the batch.
  async markDelivered(id: string, responseStatus: number): Promise<void> {
    await this.client.webhookDelivery.updateMany({
      where: { id, status: 'PROCESSING' },
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
    await this.client.webhookDelivery.updateMany({
      where: { id, status: 'PROCESSING' },
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
    await this.client.webhookDelivery.updateMany({
      where: { id, status: 'PROCESSING' },
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

  // Hand the claims the dispatcher did not get to back to PENDING so a deploy
  // does not stall them for the whole processing lease. The PROCESSING guard
  // leaves a concurrently written delivery alone.
  async releaseClaims(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.client.webhookDelivery.updateMany({
      where: { id: { in: ids }, status: 'PROCESSING' },
      data: { status: 'PENDING', claimedAt: null },
    });
    return result.count;
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

import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { WORKER_TIMING } from '@common/utils/worker-timing';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import { WebhookSender } from '@internal/webhooks/webhook-sender.service';
import {
  WEBHOOK_MAX_ATTEMPTS,
  nextAttemptAt,
} from '@internal/webhooks/webhook-backoff';
import type { WebhookDeliveryRow } from '@internal/webhooks/webhook.types';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 10_000;

export interface WebhookDispatchRunResult {
  delivered: number;
  retried: number;
  failed: number;
}

// Worker-side outbox dispatcher. It runs only in worker mode: the API process
// never performs outbound webhook I/O. At-least-once delivery; the consumer
// deduplicates on X-VRT-Delivery-Id.
@Injectable()
export class WebhookDispatcher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<unknown> | null = null;
  private unprocessedClaimIds: Set<string> | null = null;
  private running = false;
  private shuttingDown = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly deliveries: WebhookDeliveryRepository,
    private readonly endpoints: WebhookEndpointRepository,
    private readonly sender: WebhookSender,
    private readonly logger: AppLoggerService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeMode !== 'worker') return;
    this.logger.log('WebhookDispatcher started');
    this.tick();
  }

  private tick(): void {
    if (this.shuttingDown || this.running) return;
    this.running = true;
    this.inFlight = this.runOnce()
      .catch((err: unknown) => {
        this.logger.error(
          'Webhook dispatch cycle failed',
          err instanceof Error ? err.stack : String(err),
        );
      })
      .finally(() => {
        this.running = false;
        this.inFlight = null;
        this.scheduleNext();
      });
  }

  private scheduleNext(): void {
    if (this.shuttingDown) return;
    this.timer = setTimeout(() => {
      this.tick();
    }, POLL_INTERVAL_MS);
  }

  async runOnce(): Promise<WebhookDispatchRunResult> {
    const batch = await this.deliveries.claimDue(BATCH_SIZE);
    const result: WebhookDispatchRunResult = {
      delivered: 0,
      retried: 0,
      failed: 0,
    };
    // A batch is up to BATCH_SIZE sequential sends, far longer than the
    // container's stop grace period. The not-yet-processed ids are tracked so a
    // drain that overruns its budget can hand exactly those claims back.
    const unprocessed = new Set(batch.map((delivery) => delivery.id));
    this.unprocessedClaimIds = unprocessed;

    try {
      for (const delivery of batch) {
        try {
          await this.attemptDelivery(delivery, result);
          unprocessed.delete(delivery.id);
        } catch (err: unknown) {
          result.failed += 1;
          this.logger.error(
            'Webhook delivery write failed',
            err instanceof Error ? err.stack : String(err),
            { deliveryId: delivery.id, endpointId: delivery.endpointId },
          );
        }
      }
    } finally {
      this.unprocessedClaimIds = null;
    }

    return result;
  }

  private async attemptDelivery(
    delivery: WebhookDeliveryRow,
    result: WebhookDispatchRunResult,
  ): Promise<void> {
    const endpoint = await this.endpoints.findById(delivery.endpointId);
    if (!endpoint?.active) {
      await this.deliveries.markTerminalFailure(
        delivery.id,
        delivery.attempts + 1,
        'Endpoint is disabled or deleted',
        null,
      );
      result.failed += 1;
      return;
    }

    const send = await this.sender.send(endpoint, delivery);
    const attempts = delivery.attempts + 1;

    if (send.ok) {
      await this.deliveries.markDelivered(delivery.id, send.status ?? 200);
      result.delivered += 1;
      this.logger.log('Webhook delivered', {
        deliveryId: delivery.id,
        endpointId: endpoint.id,
        event: delivery.event,
        status: send.status,
      });
      return;
    }

    if (attempts >= WEBHOOK_MAX_ATTEMPTS) {
      await this.deliveries.markTerminalFailure(
        delivery.id,
        attempts,
        send.error ?? 'Delivery failed',
        send.status ?? null,
      );
      result.failed += 1;
      this.logger.warn('Webhook delivery failed permanently', {
        deliveryId: delivery.id,
        endpointId: endpoint.id,
        event: delivery.event,
        attempts,
        error: send.error,
      });
      return;
    }

    const next = nextAttemptAt(attempts);
    if (!next) {
      await this.deliveries.markTerminalFailure(
        delivery.id,
        attempts,
        send.error ?? 'Delivery failed',
        send.status ?? null,
      );
      result.failed += 1;
      return;
    }

    await this.deliveries.markForRetry(
      delivery.id,
      attempts,
      send.error ?? 'Delivery failed',
      send.status ?? null,
      next,
    );
    result.retried += 1;
    this.logger.warn('Webhook delivery will be retried', {
      deliveryId: delivery.id,
      endpointId: endpoint.id,
      event: delivery.event,
      attempts,
      nextAttemptAt: next.toISOString(),
      error: send.error,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.drainInFlight();
      this.inFlight = null;
    }
  }

  // The in-flight batch gets the shared drain budget, never more: an unbounded
  // wait outlives the stop grace period and ends in SIGKILL with every claimed
  // row stuck in PROCESSING. When the budget runs out, the claims this cycle
  // never reached go back to PENDING instead of waiting for the lease.
  private async drainInFlight(): Promise<void> {
    const inFlight = this.inFlight;
    if (!inFlight) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const didTimeOut = await Promise.race([
      inFlight.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          resolve(true);
        }, WORKER_TIMING.drainTimeoutMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });

    if (didTimeOut) await this.releaseUnprocessedClaims();
  }

  private async releaseUnprocessedClaims(): Promise<void> {
    const ids = [...(this.unprocessedClaimIds ?? [])];
    this.unprocessedClaimIds = null;

    if (ids.length === 0) {
      this.logger.warn(
        `Webhook dispatch drain exceeded ${String(WORKER_TIMING.drainTimeoutMs)}ms; no unprocessed claims to release`,
      );
      return;
    }

    try {
      const released = await this.deliveries.releaseClaims(ids);
      this.logger.warn(
        `Webhook dispatch drain exceeded ${String(WORKER_TIMING.drainTimeoutMs)}ms; released ${String(released)} of ${String(ids.length)} claimed deliveries back to PENDING`,
        { deliveryIds: ids },
      );
    } catch (err: unknown) {
      this.logger.error(
        'Failed to release unprocessed webhook deliveries',
        err instanceof Error ? err.stack : String(err),
        { deliveryIds: ids },
      );
    }
  }
}

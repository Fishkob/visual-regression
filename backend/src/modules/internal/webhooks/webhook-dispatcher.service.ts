import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import { WebhookSender } from '@internal/webhooks/webhook-sender.service';
import {
  WEBHOOK_MAX_ATTEMPTS,
  nextAttemptAt,
} from '@internal/webhooks/webhook-backoff';

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

    for (const delivery of batch) {
      const endpoint = await this.endpoints.findById(delivery.endpointId);
      if (!endpoint?.active) {
        await this.deliveries.markTerminalFailure(
          delivery.id,
          delivery.attempts + 1,
          'Endpoint is disabled or deleted',
          null,
        );
        result.failed += 1;
        continue;
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
        continue;
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
        continue;
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
        continue;
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

    return result;
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.inFlight;
      this.inFlight = null;
    }
  }
}

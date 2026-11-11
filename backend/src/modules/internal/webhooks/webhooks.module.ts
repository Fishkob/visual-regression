import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AppConfigModule } from '@config/app-config.module';
import { JOB_FAILURE_OBSERVERS } from '@common/domain/job-failure.interface';
import { WebhookContextRepository } from '@internal/webhooks/webhook-context.repository';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { WebhookDispatcher } from '@internal/webhooks/webhook-dispatcher.service';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import { WebhookJobFailureObserver } from '@internal/webhooks/webhook-job-failure.observer';
import { WebhookSender } from '@internal/webhooks/webhook-sender.service';

// Cross-cutting webhook infrastructure. Both the API (settings + event writes)
// and the worker (dispatcher) import this module; the dispatcher itself only
// starts in worker mode.
//
// The module also answers the queue's failure seam: it registers the webhook
// adapter in JOB_FAILURE_OBSERVERS, so a job that dies in the worker reaches the
// outbox without the queue importing anything webhook-shaped (ADR-076).
@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [
    WebhookEndpointRepository,
    WebhookDeliveryRepository,
    WebhookContextRepository,
    WebhookDispatchService,
    WebhookSender,
    WebhookDispatcher,
    WebhookJobFailureObserver,
    {
      provide: JOB_FAILURE_OBSERVERS,
      useFactory: (observer: WebhookJobFailureObserver) => [observer],
      inject: [WebhookJobFailureObserver],
    },
  ],
  exports: [
    WebhookEndpointRepository,
    WebhookDeliveryRepository,
    WebhookContextRepository,
    WebhookDispatchService,
    WebhookSender,
    JOB_FAILURE_OBSERVERS,
  ],
})
export class WebhooksModule {}

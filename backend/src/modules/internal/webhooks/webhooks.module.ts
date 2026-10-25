import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AppConfigModule } from '@config/app-config.module';
import { WebhookContextRepository } from '@internal/webhooks/webhook-context.repository';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { WebhookDispatcher } from '@internal/webhooks/webhook-dispatcher.service';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import { WebhookSender } from '@internal/webhooks/webhook-sender.service';

// Cross-cutting webhook infrastructure. Both the API (settings + event writes)
// and the worker (dispatcher) import this module; the dispatcher itself only
// starts in worker mode.
@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [
    WebhookEndpointRepository,
    WebhookDeliveryRepository,
    WebhookContextRepository,
    WebhookDispatchService,
    WebhookSender,
    WebhookDispatcher,
  ],
  exports: [
    WebhookEndpointRepository,
    WebhookDeliveryRepository,
    WebhookContextRepository,
    WebhookDispatchService,
    WebhookSender,
  ],
})
export class WebhooksModule {}

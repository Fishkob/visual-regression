import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppConfigService } from '@config/app-config.service';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { WebhookDeliveryStatus } from '@/prisma/client';

// Delivery rows are an outbox, not a history: once a delivery is terminal the
// payload has served its purpose. Keeping them forever costs two things — table
// growth proportional to review traffic (one row per subscribed endpoint per
// event) and indefinite retention of the event's content, which includes
// reviewer-supplied comment text, approval notes and usernames. Deleting the
// terminal rows after the retention window bounds both. PENDING/PROCESSING rows
// are never touched: they are still owed to the receiver.
@Injectable()
export class WebhookDeliveryCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.webhookDeliveryCleanup;
  readonly label = 'webhook delivery cleanup';
  private readonly retentionDays: number;

  constructor(
    private readonly connection: PrismaConnection,
    appConfig: AppConfigService,
  ) {
    this.retentionDays = appConfig.webhookRetention.days;
  }

  async execute(): Promise<MaintenanceResult> {
    const cutoff = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000,
    );
    const result = await this.connection.client.webhookDelivery.deleteMany({
      where: {
        status: {
          in: [WebhookDeliveryStatus.DELIVERED, WebhookDeliveryStatus.FAILED],
        },
        createdAt: { lt: cutoff },
      },
    });

    return {
      gauges: [
        { name: METRICS.cleanupWebhookDeliveriesDeleted, value: result.count },
        {
          name: METRICS.cleanupWebhookDeliveriesLastRun,
          value: Date.now(),
        },
      ],
    };
  }
}

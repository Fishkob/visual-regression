import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';

// Sweeps RateLimitBucket rows older than one day. The counters are only
// meaningful inside their window, so the sweep keeps a day of history for
// monitoring and drops everything older. Not transaction-ambient: it runs on
// the bare connection like the sibling maintenance tasks.
const RATE_LIMIT_BUCKET_RETENTION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RateLimitBucketCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.rateLimitBucketCleanup;
  readonly label = 'rate limit bucket cleanup';

  constructor(private readonly connection: PrismaConnection) {}

  async execute(): Promise<MaintenanceResult> {
    const cutoff = new Date(Date.now() - RATE_LIMIT_BUCKET_RETENTION_MS);
    const result = await this.connection.client.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: cutoff } },
    });
    return {
      gauges: [
        {
          name: METRICS.cleanupRateLimitBucketsDeleted,
          value: result.count,
        },
      ],
    };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';

// Expired sessions are never pruned by the auth flow (logout deletes the row it
// owns, but abandoned sessions otherwise live forever), so this sweep drops
// every row whose window has closed. Not transaction-ambient: it runs on the
// bare connection like the sibling maintenance tasks.
@Injectable()
export class SessionCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.sessionCleanup;
  readonly label = 'session cleanup';

  constructor(private readonly connection: PrismaConnection) {}

  async execute(): Promise<MaintenanceResult> {
    const result = await this.connection.client.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return {
      gauges: [
        { name: METRICS.cleanupSessionsDeleted, value: result.count },
        { name: METRICS.cleanupSessionsLastRun, value: Date.now() },
      ],
    };
  }
}

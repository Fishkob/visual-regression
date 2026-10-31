import { Injectable } from '@nestjs/common';
import { Prisma } from '@/prisma/client';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';

// Share links are resolved by token and then re-read live data by project name,
// so a row must be gone once it can no longer grant access:
//   - it expired (or was revoked) more than the grace period ago, or
//   - its project no longer exists (project deletion removes them
//     transactionally, so this covers rows written before that guard existed).
// The grace period keeps a freshly expired link around long enough for the
// access log to be correlated with it by an operator.
const EXPIRED_GRACE_DAYS = 7;

@Injectable()
export class ShareLinkCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.shareLinkCleanup;
  readonly label = 'share link cleanup';

  constructor(private readonly connection: PrismaConnection) {}

  async execute(): Promise<MaintenanceResult> {
    const cutoff = new Date(
      Date.now() - EXPIRED_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    const deleted = await this.connection.client.$executeRaw(Prisma.sql`
      DELETE FROM "ShareLink"
      WHERE "expiresAt" < ${cutoff}
         OR ("revokedAt" IS NOT NULL AND "revokedAt" < ${cutoff})
         OR NOT EXISTS (
              SELECT 1 FROM "Project" p WHERE p."name" = "ShareLink"."projectName"
            )
    `);

    return {
      gauges: [
        { name: METRICS.cleanupShareLinksDeleted, value: deleted },
        { name: METRICS.cleanupShareLinksLastRun, value: Date.now() },
      ],
    };
  }
}

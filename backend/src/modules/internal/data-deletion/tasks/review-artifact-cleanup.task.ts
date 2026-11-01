import { Injectable } from '@nestjs/common';
import { Prisma } from '@/prisma/client';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceTask,
  MaintenanceResult,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';

// ReviewComment has no foreign key to UnifiedTest, so a deleted test leaves its
// discussion behind. The transactional delete paths remove comments with the
// test; this sweep is the safety net for every path that does not (older rows,
// branch/project cascades, a crashed delete). Bounded so one run can never lock
// the tables for a long time; repeated daily runs drain a large backlog.
//
// ApprovalVote is deliberately NOT swept: it is the 4-eyes audit trail, and the
// schema contract is that the record of who approved what survives the test,
// branch and project it names. Votes of deleted tests therefore stay in the
// table by design. Not transaction-ambient: it runs on the bare connection like
// the sibling maintenance tasks.
const BATCH_SIZE = 10_000;

@Injectable()
export class ReviewArtifactCleanupTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.reviewArtifactCleanup;
  readonly label = 'review artifact cleanup';

  constructor(
    private readonly connection: PrismaConnection,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(): Promise<MaintenanceResult> {
    const comments = await this.deleteOrphanedComments();

    if (comments > 0) {
      this.logger.log(`Deleted ${String(comments)} orphaned review comment(s)`);
    }

    return {
      gauges: [
        { name: METRICS.cleanupReviewCommentsDeleted, value: comments },
        {
          name: METRICS.cleanupReviewArtifactsLastRun,
          value: Date.now(),
        },
      ],
    };
  }

  // A bounded id subquery keeps the DELETE idempotent and predictable: each run
  // removes at most BATCH_SIZE rows, and the orphan predicate re-evaluates the
  // live test table, so nothing that still has a test is ever touched.
  private async deleteOrphanedComments(): Promise<number> {
    return this.connection.client.$executeRaw(Prisma.sql`
      DELETE FROM "ReviewComment"
      WHERE "id" IN (
        SELECT c."id" FROM "ReviewComment" c
        WHERE NOT EXISTS (
          SELECT 1 FROM "UnifiedTest" t WHERE t."id" = c."testId"
        )
        ORDER BY c."createdAt"
        LIMIT ${BATCH_SIZE}
      )
    `);
  }
}

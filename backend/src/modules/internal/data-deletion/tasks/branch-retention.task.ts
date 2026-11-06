import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { METRICS } from '@common/domain/metrics-catalog';
import type {
  MaintenanceResult,
  MaintenanceTask,
} from '@common/domain/maintenance-task.interface';
import { MAINTENANCE_LOCK_IDS } from '@internal/data-deletion/maintenance-lock-ids';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BranchDeletionService } from '@public/visualTest/core/application/services/branch-deletion.service';

const DAY_MS = 24 * 60 * 60 * 1000;

// The audit actor the sweep writes. A deletion has to say who deleted the
// branch, and "no actor" would read like an operator action that lost its name.
export const BRANCH_RETENTION_ACTOR = 'system:branch-retention';

// Branches are materialized by the first upload and nothing removes them when
// the Git branch is merged or deleted, so a project's branch list and its
// evidence only ever grew. The sweep deletes a non-default branch once it has
// seen no upload for the project's window.
//
// It is opt-in (window 0 = off) and every deletion reuses BranchDeletionService,
// so the guards that protect a manual delete protect this one too: the default
// branch, a branch another branch targets, and — the one this task adds — a
// branch with an unreviewed comparison. See ADR-067.
@Injectable()
export class BranchRetentionTask implements MaintenanceTask {
  readonly lockId = MAINTENANCE_LOCK_IDS.branchRetention;
  readonly label = 'branch retention';

  constructor(
    private readonly projects: ProjectRepository,
    private readonly branches: BranchRepository,
    private readonly deletion: BranchDeletionService,
    private readonly config: AppConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(): Promise<MaintenanceResult> {
    const projects = await this.projects.listBranchRetentionProjects();
    let deleted = 0;
    for (const project of projects) {
      // Per-project override wins; `<= 0` means the window is disabled (the
      // deployment default is 0, and a project may switch it off again).
      const days =
        project.branchRetentionDays ??
        this.config.retention.branchRetentionDays;
      if (days <= 0) continue;

      const cutoff = new Date(Date.now() - days * DAY_MS);
      const candidates = await this.branches.findInactive(project.id, cutoff);
      for (const branch of candidates) {
        try {
          await this.deletion.delete(
            project.id,
            branch.id,
            BRANCH_RETENTION_ACTOR,
          );
          deleted += 1;
          this.logger.log(
            `Deleted branch "${branch.name}" of project ${project.id} after ${String(days)} days without an upload`,
          );
        } catch (error) {
          // A guard that fired between the candidate query and the delete (a
          // dependant appeared, an approval arrived) must not abort the rest of
          // the sweep. The branch simply survives to the next run.
          this.logger.warn(`Branch retention skipped "${branch.name}"`, {
            projectId: project.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      counters: [{ name: METRICS.cleanupBranchesDeleted, value: deleted }],
      gauges: [{ name: METRICS.cleanupBranchesLastRun, value: Date.now() }],
    };
  }
}

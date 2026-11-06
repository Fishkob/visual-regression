import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BaselineRevisionRepository } from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { BranchRepository } from '@public/visualTest/core/infrastructure/repositories/branch.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import { DEFAULT_ORPHAN_GRACE_HOURS } from '@common/domain/orphan-sweep.interface';
import { resolveRetention } from '@public/visualTest/core/domain/policies/retention-policy';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionPreview {
  baselineRevisions: { limit: number; overflow: number };
  runs: { days: number; eligible: number };
  branches: { days: number; eligible: number };
  effectiveOrphanGraceHours: number;
  storage: {
    usageBytes: string;
    quotaBytes: string | null;
    percent: number;
    warning: boolean;
  };
}

@Injectable()
export class RetentionPreviewService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly revisions: BaselineRevisionRepository,
    private readonly branches: BranchRepository,
    private readonly runs: RunRepository,
    private readonly storage: StorageUsageService,
    private readonly config: AppConfigService,
  ) {}

  async get(projectName: string): Promise<RetentionPreview> {
    const project = await this.projects.requireByName(projectName);
    const effective = resolveRetention(project, {
      baselineRevisionLimit: this.config.baselineHistory.limit,
      runHistoryDays: this.config.retention.runHistoryDays,
      branchRetentionDays: this.config.retention.branchRetentionDays,
      orphanGraceHours: DEFAULT_ORPHAN_GRACE_HOURS,
    });
    const cutoff = new Date(Date.now() - effective.runHistoryDays * DAY_MS);
    // A disabled window has no candidate set to report: counting against a
    // 0-day cutoff would list every branch and promise a deletion that the
    // sweep will not perform.
    const branchCutoff = new Date(
      Date.now() - effective.branchRetentionDays * DAY_MS,
    );
    const [overflow, eligible, branches, usage] = await Promise.all([
      this.revisions.countBeyondLimit(
        projectName,
        effective.baselineRevisionLimit,
      ),
      this.runs.countFinishedBefore(project.id, cutoff),
      effective.branchRetentionDays > 0
        ? this.branches.countInactive(project.id, branchCutoff)
        : Promise.resolve(0),
      this.storage.get(projectName),
    ]);
    return {
      baselineRevisions: { limit: effective.baselineRevisionLimit, overflow },
      runs: { days: effective.runHistoryDays, eligible },
      branches: { days: effective.branchRetentionDays, eligible: branches },
      effectiveOrphanGraceHours: effective.orphanGraceHours,
      storage: {
        usageBytes: usage.usageBytes,
        quotaBytes: usage.quotaBytes,
        percent: usage.percent,
        warning: usage.warning,
      },
    };
  }
}

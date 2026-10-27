import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BaselineRevisionRepository } from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';
import { DEFAULT_ORPHAN_GRACE_HOURS } from '@common/domain/orphan-sweep.interface';
import { resolveRetention } from '@public/visualTest/core/domain/policies/retention-policy';

export interface RetentionPreview {
  baselineRevisions: { limit: number; overflow: number };
  runs: { days: number; eligible: number };
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
    private readonly runs: RunRepository,
    private readonly storage: StorageUsageService,
    private readonly config: AppConfigService,
  ) {}

  async get(projectName: string): Promise<RetentionPreview> {
    const project = await this.projects.requireByName(projectName);
    const effective = resolveRetention(project, {
      baselineRevisionLimit: this.config.baselineHistory.limit,
      runHistoryDays: this.config.retention.runHistoryDays,
      orphanGraceHours: DEFAULT_ORPHAN_GRACE_HOURS,
    });
    const cutoff = new Date(
      Date.now() - effective.runHistoryDays * 24 * 60 * 60 * 1000,
    );
    const [overflow, eligible, usage] = await Promise.all([
      this.revisions.countBeyondLimit(
        projectName,
        effective.baselineRevisionLimit,
      ),
      this.runs.countFinishedBefore(project.id, cutoff),
      this.storage.get(projectName),
    ]);
    return {
      baselineRevisions: { limit: effective.baselineRevisionLimit, overflow },
      runs: { days: effective.runHistoryDays, eligible },
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

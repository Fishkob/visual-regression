import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { DomainError } from '@common/domain/domain-error';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { BaselineRevisionRepository } from '@public/visualTest/core/infrastructure/repositories/baseline-revision.repository';
import { RunRepository } from '@public/visualTest/core/infrastructure/repositories/run.repository';
import { StorageUsageService } from '@public/visualTest/core/application/services/storage-usage.service';

export interface RetentionPreview {
  baselineRevisions: { limit: number; overflow: number };
  runs: { days: number; eligible: number };
  orphanGraceHours: number;
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
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    const limit =
      project.baselineRevisionLimit ?? this.config.baselineHistory.limit;
    const days = project.runHistoryDays ?? this.config.retention.runHistoryDays;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [overflow, eligible, usage] = await Promise.all([
      this.revisions.countBeyondLimit(projectName, limit),
      this.runs.countFinishedBefore(project.id, cutoff),
      this.storage.get(projectName),
    ]);
    return {
      baselineRevisions: { limit, overflow },
      runs: { days, eligible },
      orphanGraceHours: project.orphanGraceHours ?? 24,
      storage: {
        usageBytes: usage.usageBytes,
        quotaBytes: usage.quotaBytes,
        percent: usage.percent,
        warning: usage.warning,
      },
    };
  }
}

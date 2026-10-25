import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';

export interface StorageUsageView {
  usageBytes: string;
  quotaBytes: string | null;
  percent: number;
  softPercent: number;
  warning: boolean;
  fileCount: number;
  diffCount: number;
  baselineRevisionLimit: number | null;
  runHistoryDays: number | null;
  orphanGraceHours: number | null;
}

@Injectable()
export class StorageUsageService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly screenshots: UnifiedScreenshotRepository,
    private readonly comparisons: UnifiedComparisonsRepository,
  ) {}

  async get(projectName: string): Promise<StorageUsageView> {
    const project = await this.projects.findByName(projectName);
    if (!project) {
      throw new DomainError(`Project "${projectName}" not found`, 'NOT_FOUND');
    }
    const [screenshots, diffs] = await Promise.all([
      this.screenshots.sumSizeForProject(projectName),
      this.comparisons.sumDiffSizeForProject(projectName),
    ]);
    const usageBytes = screenshots.bytes + diffs.bytes;
    const quota = project.storageQuotaBytes;
    const percent =
      quota && quota > 0n
        ? Math.min(100, Number((usageBytes * 10000n) / quota) / 100)
        : 0;
    const softPercent = project.quotaSoftPercent ?? 80;
    return {
      usageBytes: usageBytes.toString(),
      quotaBytes: quota?.toString() ?? null,
      percent,
      softPercent,
      warning: quota !== null && percent >= softPercent,
      fileCount: screenshots.count,
      diffCount: diffs.count,
      baselineRevisionLimit: project.baselineRevisionLimit ?? null,
      runHistoryDays: project.runHistoryDays ?? null,
      orphanGraceHours: project.orphanGraceHours ?? null,
    };
  }

  // Hard quota check runs before the object is stored. A soft threshold is
  // reported by the storage endpoint (and the upload still succeeds); only a
  // hard ceiling rejects with 413.
  async assertWithinQuota(
    projectName: string,
    incomingBytes: number,
  ): Promise<void> {
    const project = await this.projects.findByName(projectName);
    if (!project?.storageQuotaBytes) return;
    const usage = await this.get(projectName);
    const projected = BigInt(usage.usageBytes) + BigInt(incomingBytes);
    if (projected > project.storageQuotaBytes) {
      const used = Number(project.storageQuotaBytes) / 1024 / 1024;
      throw new DomainError(
        `Storage quota exceeded for project "${projectName}" (${used.toFixed(0)} MB limit)`,
        'QUOTA_EXCEEDED',
      );
    }
  }
}

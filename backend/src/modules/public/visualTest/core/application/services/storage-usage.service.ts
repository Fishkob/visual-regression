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
    const project = await this.projects.requireByName(projectName);
    const usage = await this.sumEvidence(projectName);
    const quota = project.storageQuotaBytes;
    const percent =
      quota && quota > 0n
        ? Math.min(100, Number((usage.bytes * 10000n) / quota) / 100)
        : 0;
    const softPercent = project.quotaSoftPercent ?? 80;
    return {
      usageBytes: usage.bytes.toString(),
      quotaBytes: quota?.toString() ?? null,
      percent,
      softPercent,
      warning: quota !== null && percent >= softPercent,
      fileCount: usage.fileCount,
      diffCount: usage.diffCount,
      baselineRevisionLimit: project.baselineRevisionLimit ?? null,
      runHistoryDays: project.runHistoryDays ?? null,
      orphanGraceHours: project.orphanGraceHours ?? null,
    };
  }

  // The single aggregate over evidence bytes: screenshot rows plus diff
  // artifacts. The pdf-render cache is not evidence and has no row, which is why
  // it never appears here (see ADR-043).
  private async sumEvidence(projectName: string): Promise<{
    bytes: bigint;
    fileCount: number;
    diffCount: number;
  }> {
    const [screenshots, diffs] = await Promise.all([
      this.screenshots.sumSizeForProject(projectName),
      this.comparisons.sumDiffSizeForProject(projectName),
    ]);
    return {
      bytes: screenshots.bytes + diffs.bytes,
      fileCount: screenshots.count,
      diffCount: diffs.count,
    };
  }

  // Hard quota check runs before the object is stored — the stored-write
  // convention (`StateChangeWorkflow.executeWithStoredFile`) is its only caller.
  // A soft threshold is reported by the storage endpoint (and the write still
  // succeeds); only a hard ceiling rejects, with 413.
  //
  // The project row is loaded once: this used to call `get()`, which loaded the
  // same row a second time.
  async assertWithinQuota(
    projectName: string,
    incomingBytes: number,
  ): Promise<void> {
    const project = await this.projects.findByName(projectName);
    const quota = project?.storageQuotaBytes ?? null;
    if (quota === null) return;
    // A stored 0 predates the DTO's positive-integer rule and has always meant
    // "no quota" (the old falsy test). Keep reading it that way instead of
    // bricking a project that carries one; the DTO no longer lets a new 0 in.
    if (quota <= 0n) return;
    const usage = await this.sumEvidence(projectName);
    const projected = usage.bytes + BigInt(incomingBytes);
    if (projected > quota) {
      throw new DomainError(
        `Storage quota exceeded for project "${projectName}" (${toMb(usage.bytes)} of ${toMb(quota)} MB used)`,
        'QUOTA_EXCEEDED',
      );
    }
  }
}

// Whole megabytes, for a message a human reads in a CI log.
function toMb(bytes: bigint): string {
  return (Number(bytes) / 1024 / 1024).toFixed(0);
}

import { Injectable } from '@nestjs/common';
import { DomainError } from '@common/domain/domain-error';
import {
  ProjectRepository,
  type ProjectData,
} from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';

// How long a computed evidence total is trusted by the quota check. Short on
// purpose: the bound on a burst is the evidence one window writes, and a
// refresh costs one aggregate per project, not per upload. See ADR-060.
const USAGE_CACHE_TTL_MS = 5_000;

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
  branchRetentionDays: number | null;
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
      branchRetentionDays: project.branchRetentionDays ?? null,
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
  // same row a second time. The byte total comes from the project's cached
  // `storageUsedBytes` (ADR-060) — a `SUM` over every evidence row of the
  // project on every upload grew linear with the project (68 ms of database
  // time at 500k screenshot rows, measured) and no index helps, because the
  // aggregate has to visit the rows. The cache is re-derived from those rows
  // whenever it is older than USAGE_CACHE_TTL_MS and advanced by each admitted
  // charge, so a burst still sees its own bytes; what it can lag is a deletion
  // or a store that failed after its charge, and both over-report — the safe
  // direction for a ceiling — for at most one window.
  async assertWithinQuota(
    projectName: string,
    incomingBytes: number,
  ): Promise<void> {
    const project = await this.projects.findByName(projectName);
    // A project that does not exist yet is not enforced: the upload that would
    // create it runs its own transaction after this check, and its bytes are
    // accounted by the next one.
    if (!project) return;
    const quota = project.storageQuotaBytes ?? null;
    if (quota === null) return;
    // A stored 0 predates the DTO's positive-integer rule and has always meant
    // "no quota" (the old falsy test). Keep reading it that way instead of
    // bricking a project that carries one; the DTO no longer lets a new 0 in.
    if (quota <= 0n) return;
    const used = await this.currentUsageBytes(project);
    const incoming = BigInt(incomingBytes);
    if (used + incoming > quota) {
      throw new DomainError(
        `Storage quota exceeded for project "${projectName}" (${toMb(used)} of ${toMb(quota)} MB used)`,
        'QUOTA_EXCEEDED',
      );
    }
    // Charge the admitted bytes into the cached total so the next upload of this
    // project sees them: without it every upload of one window would be decided
    // against the same total and a burst would land as a block. A charge that
    // never reaches storage (a failed store) or a deletion stays in the total
    // until the next re-derive, which is why the window is short — the error is
    // always "over-reports", the safe direction for a ceiling.
    await this.projects.addStorageUsage(project.id, incoming);
  }

  // The cached total, re-derived from the rows when it is missing or stale.
  // Deliberately NOT written inside the upload's transaction: the Project row is
  // shared by every concurrent upload, so a write there would serialize them.
  private async currentUsageBytes(project: ProjectData): Promise<bigint> {
    const computedAt = project.storageUsageComputedAt;
    const cached = project.storageUsedBytes;
    if (cached !== null && cached !== undefined && computedAt) {
      if (Date.now() - computedAt.getTime() < USAGE_CACHE_TTL_MS) return cached;
    }
    const usage = await this.sumEvidence(project.name);
    await this.projects.recordStorageUsage(project.id, usage.bytes, new Date());
    return usage.bytes;
  }
}

// Whole megabytes, for a message a human reads in a CI log.
function toMb(bytes: bigint): string {
  return (Number(bytes) / 1024 / 1024).toFixed(0);
}

import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { JobStatus, Prisma } from '@/prisma/client';
import { isString } from '@common/utils/is-string';
import type {
  IOrphanSweep,
  OrphanBaselineCriteria,
} from '@common/domain/orphan-sweep.interface';
import { DEFAULT_ORPHAN_BASELINE_MAX_AGE_MS } from '@common/domain/orphan-sweep.interface';

@Injectable()
export class OrphanedScreenshotRepository
  extends BaseRepository
  implements IOrphanSweep
{
  async findOrphanedCurrent(): Promise<{
    skipped: boolean;
    screenshots: { id: string; imageUrl: string }[];
  }> {
    // A PENDING/PROCESSING job with NULL candidateId (pre-backfill legacy row)
    // protects an unknown candidate — the sweep cannot prove that candidate is
    // not in flight. Storage-first deletion would destroy that candidate's
    // object before the guarded DELETE could refuse the row, so the sweep is
    // skipped entirely rather than risking a live upload. The skip is reported
    // so the caller can surface it instead of reporting a silent 0.
    if (await this.hasUnknownCandidateJob()) {
      return { skipped: true, screenshots: [] };
    }

    const activeCandidateIds = await this.activeCandidateIds();

    const screenshots = await this.client.unifiedScreenshot.findMany({
      where: {
        type: 'CURRENT',
        asCandidateComp: { none: {} },
        ...(activeCandidateIds.length > 0
          ? { id: { notIn: activeCandidateIds } }
          : {}),
      },
      select: { id: true, imageUrl: true },
    });

    return { skipped: false, screenshots };
  }

  // Re-checks orphan-ness at delete time so a concurrent upload that re-used
  // the row in place (upsertCandidateForVariant) is never destroyed. The
  // active-job and comparison guards are predicates of the SAME DELETE
  // statement, so Postgres evaluates them against one consistent snapshot — a
  // candidate claimed by an upload committing between a prior SELECT and this
  // delete is still excluded, instead of being deleted against a stale guard.
  async deleteCurrentOrphansByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    return this.client.$executeRaw`
      DELETE FROM "UnifiedScreenshot" s
      WHERE s.id IN (${Prisma.join(ids)})
        AND s.type = 'CURRENT'
        AND NOT EXISTS (
          SELECT 1 FROM "UnifiedComparison" c
          WHERE c."candidateId" = s.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM "ComparisonJob" j
          WHERE j.status IN ('PENDING', 'PROCESSING')
            AND (j."candidateId" = s.id OR j."candidateId" IS NULL)
        )
    `;
  }

  // True when any active job cannot say which candidate it protects. The find
  // and the delete-time guard both treat this as "sweep nothing", so a legacy
  // NULL-candidateId row cannot cause a live candidate to be destroyed.
  private async hasUnknownCandidateJob(): Promise<boolean> {
    const unknown = await this.client.comparisonJob.findFirst({
      where: {
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
        candidateId: null,
      },
      select: { id: true },
    });
    return unknown !== null;
  }

  private async activeCandidateIds(): Promise<string[]> {
    const activeJobs = await this.client.comparisonJob.findMany({
      where: { status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] } },
      select: { candidateId: true },
    });
    return activeJobs.map((job) => job.candidateId).filter(isString);
  }

  // Row-first twin of the storage-first flow: deletes the orphaned BASELINE
  // rows and RETURNS the URLs of exactly the rows the guarded DELETE removed.
  // Baseline content is live content — a comparison that re-adopts this
  // baseline between a file delete and a row delete would survive with its
  // object gone. Deleting the row first (guarded, in one statement) and only
  // then reclaiming its file closes that window: a file whose delete fails
  // leaks to the unreferenced-object sweep instead of stranding a live row.
  async deleteBaselineOrphansByIdsReturningUrls(
    ids: string[],
    maxAgeMs: number,
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const threshold = new Date(Date.now() - maxAgeMs);
    const deleted = await this.client.$queryRaw<{ imageUrl: string }[]>`
      DELETE FROM "UnifiedScreenshot" s
      WHERE s.id IN (${Prisma.join(ids)})
        AND s.type = 'BASELINE'
        AND NOT EXISTS (
          SELECT 1 FROM "UnifiedVariant" v
          WHERE v."baselineId" = s.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM "UnifiedComparison" c
          WHERE c."baselineId" = s.id
        )
        AND s."createdAt" < ${threshold}
      RETURNING s."imageUrl"
    `;
    return deleted.map((row) => row.imageUrl);
  }

  async findOrphanedBaseline(
    criteria?: OrphanBaselineCriteria,
  ): Promise<{ id: string; imageUrl: string }[]> {
    const maxAge = criteria?.maxAgeMs ?? DEFAULT_ORPHAN_BASELINE_MAX_AGE_MS;
    const threshold = new Date(Date.now() - maxAge);
    return this.client.unifiedScreenshot.findMany({
      where: {
        type: 'BASELINE',
        asBaseline: { is: null },
        // Same guard as deleteBaselineOrphansByIdsReturningUrls so the find
        // and delete predicates can never diverge on what counts as deletable.
        asBaselineComp: { none: {} },
        createdAt: { lt: threshold },
      },
      select: { id: true, imageUrl: true },
    });
  }
}

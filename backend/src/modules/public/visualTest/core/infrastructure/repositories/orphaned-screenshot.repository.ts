import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { JobStatus, Prisma } from '@/prisma/client';
import { isString } from '@common/utils/is-string';
import type {
  IOrphanSweep,
  OrphanBaselineCriteria,
} from '@common/domain/orphan-sweep.interface';

// The project's own grace, falling back to the caller's default. One fragment
// for the find and the guarded delete: the two predicates used to be a
// hand-copied `createdAt < now - maxAge` with a single global age, so they could
// only agree by inspection. Here they cannot diverge — both statements embed the
// same expression, which now reads the owning project's `orphanGraceHours`.
//
// Aliases are part of the contract: `s` = UnifiedScreenshot, `p` = Project.
const ORPHAN_GRACE_ELAPSED = (defaultGraceHours: number) => Prisma.sql`
  s."createdAt" < now() - make_interval(hours => COALESCE(p."orphanGraceHours", ${defaultGraceHours}))
`;

// Joins from a screenshot row to its project, shared by both statements.
const SCREENSHOT_PROJECT_JOINS = Prisma.sql`
  JOIN "UnifiedTest" t ON t."id" = s."testId"
  JOIN "Branch" b ON b."id" = t."branchId"
  JOIN "Project" p ON p."id" = b."projectId"
`;

// The job statuses that still own their candidate row: in flight (PENDING,
// PROCESSING) and failed-awaiting-retry (FAILED). A FAILED job's candidate is
// evidence, not garbage — the DLQ retry flips the row back to PENDING and
// re-downloads the payload's candidate URL, and `FailedJobCleanupTask` owns its
// retention (row first, then the file, after the retention window). Leaving
// FAILED out made the daily sweep destroy that object up to a week before the
// cleanup was allowed to, so an operator's retry turned into a silent moot.
const CANDIDATE_OWNING_JOB_STATUSES = [
  JobStatus.PENDING,
  JobStatus.PROCESSING,
  JobStatus.FAILED,
] as const;

@Injectable()
export class OrphanedScreenshotRepository
  extends BaseRepository
  implements IOrphanSweep
{
  async findOrphanedCurrent(): Promise<{
    skipped: boolean;
    screenshots: { id: string; imageUrl: string }[];
  }> {
    // A candidate-owning job with NULL candidateId (pre-backfill legacy row)
    // protects an unknown candidate — the sweep cannot prove that candidate is
    // not in flight or not awaiting a retry. Storage-first deletion would
    // destroy that candidate's object before the guarded DELETE could refuse the
    // row, so the sweep is skipped entirely rather than risking live evidence.
    // The skip is reported so the caller can surface it instead of a silent 0.
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
          WHERE j.status IN (${Prisma.join(CANDIDATE_OWNING_JOB_STATUSES)})
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
        status: { in: [...CANDIDATE_OWNING_JOB_STATUSES] },
        candidateId: null,
      },
      select: { id: true },
    });
    return unknown !== null;
  }

  private async activeCandidateIds(): Promise<string[]> {
    const activeJobs = await this.client.comparisonJob.findMany({
      where: { status: { in: [...CANDIDATE_OWNING_JOB_STATUSES] } },
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
    criteria: OrphanBaselineCriteria,
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const deleted = await this.client.$queryRaw<
      { imageUrl: string }[]
    >(Prisma.sql`
      DELETE FROM "UnifiedScreenshot" s
      USING "UnifiedTest" t, "Branch" b, "Project" p
      WHERE t."id" = s."testId"
        AND b."id" = t."branchId"
        AND p."id" = b."projectId"
        AND s.id IN (${Prisma.join(ids)})
        AND s.type = 'BASELINE'
        AND NOT EXISTS (
          SELECT 1 FROM "UnifiedVariant" v
          WHERE v."baselineId" = s.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM "UnifiedComparison" c
          WHERE c."baselineId" = s.id
        )
        AND ${ORPHAN_GRACE_ELAPSED(criteria.defaultGraceHours)}
      RETURNING s."imageUrl"
    `);
    return deleted.map((row) => row.imageUrl);
  }

  // The find and the delete share the grace expression *and* the orphan guards,
  // so a row the find hands over is still the row the guarded delete removes.
  async findOrphanedBaseline(
    criteria: OrphanBaselineCriteria,
  ): Promise<{ id: string; imageUrl: string }[]> {
    return this.client.$queryRaw<{ id: string; imageUrl: string }[]>(Prisma.sql`
      SELECT s."id", s."imageUrl"
      FROM "UnifiedScreenshot" s
      ${SCREENSHOT_PROJECT_JOINS}
      WHERE s.type = 'BASELINE'
        AND NOT EXISTS (
          SELECT 1 FROM "UnifiedVariant" v
          WHERE v."baselineId" = s.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM "UnifiedComparison" c
          WHERE c."baselineId" = s.id
        )
        AND ${ORPHAN_GRACE_ELAPSED(criteria.defaultGraceHours)}
    `);
  }
}

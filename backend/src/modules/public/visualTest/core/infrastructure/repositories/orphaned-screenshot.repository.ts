import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { JobStatus, Prisma } from '@/prisma/client';
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

// The sweep is a maintenance task under an advisory lock, so it must finish in
// bounded time and with bounded statements. A batch caps one run's find (memory,
// and one guard set for the chunked deletes); a larger backlog is drained over
// the following nightly runs, which is acceptable for orphaned rows. The delete
// chunk keeps each statement's bind-parameter count far below PostgreSQL's
// 65535 ceiling — `Prisma.join(ids)` binds one parameter per id, so an unbounded
// id list made the statement fail on every run once the table grew.
export const ORPHAN_SWEEP_BATCH_SIZE = 5000;
export const ORPHAN_DELETE_CHUNK_SIZE = 1000;

// The batch size rendered as SQL text: `LIMIT $n` makes the parameter type
// inference depend on the driver's number encoding, and the value is never
// caller-controlled.
const ORPHAN_SWEEP_LIMIT = Prisma.raw(String(ORPHAN_SWEEP_BATCH_SIZE));

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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

    // The job guard is a NOT EXISTS subquery (the delete-time guard's shape),
    // not a materialized id list: a project with many in-flight/failed jobs used
    // to build one bind parameter per candidate id, which turns into an
    // unbounded parameter list and eventually fails outright.
    const screenshots = await this.client.$queryRaw<
      { id: string; imageUrl: string }[]
    >(Prisma.sql`
      SELECT s."id", s."imageUrl"
      FROM "UnifiedScreenshot" s
      WHERE s."type" = 'CURRENT'
        AND NOT EXISTS (
          SELECT 1 FROM "UnifiedComparison" c WHERE c."candidateId" = s."id"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "ComparisonJob" j
          WHERE j."status" IN (${Prisma.join(CANDIDATE_OWNING_JOB_STATUSES)})
            AND (j."candidateId" = s."id" OR j."candidateId" IS NULL)
        )
      ORDER BY s."createdAt"
      LIMIT ${ORPHAN_SWEEP_BATCH_SIZE}
    `);

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

    let deleted = 0;
    for (const idChunk of chunk(ids, ORPHAN_DELETE_CHUNK_SIZE)) {
      deleted += await this.deleteCurrentOrphanChunk(idChunk);
    }
    return deleted;
  }

  private deleteCurrentOrphanChunk(ids: string[]): Promise<number> {
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
    const urls: string[] = [];
    for (const idChunk of chunk(ids, ORPHAN_DELETE_CHUNK_SIZE)) {
      urls.push(...(await this.deleteBaselineOrphanChunk(idChunk, criteria)));
    }
    return urls;
  }

  private async deleteBaselineOrphanChunk(
    ids: string[],
    criteria: OrphanBaselineCriteria,
  ): Promise<string[]> {
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
      LIMIT ${ORPHAN_SWEEP_LIMIT}
    `);
  }
}

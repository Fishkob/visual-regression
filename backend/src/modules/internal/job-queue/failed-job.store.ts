import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import { JobStatus, Prisma } from '@/prisma/client';
import type {
  FailedJobRecord,
  IFailedJobStore,
} from '@common/domain/job-queue.interface';
import { decodeJobData } from '@common/domain/job-data.decoder';

// Returns the cutoff instant N days ago, DST-safe (calendar-day arithmetic via
// setDate rather than fixed 24h increments). Used when pruning failed/completed
// jobs; the orphan-baseline sweep deliberately keeps its own ms-based age
// constant (DEFAULT_ORPHAN_BASELINE_MAX_AGE_MS).
function retentionCutoff(retentionDays: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff;
}

// Single owner of the FAILED-job surface plus the COMPLETED-row sweep, shared
// by the DLQ (list + retry) and the retention sweep (list + guarded delete).
// Previously this was split across IJobQueue.listFailed/retry, two retention
// helpers, and a satellite query file — four routes to the same rows with the
// same projection. Here the projection, the list cap, the row mapping, and the
// guarded writes live in one place.
@Injectable()
export class FailedJobStore extends BaseRepository implements IFailedJobStore {
  // Failed jobs accumulate over the whole retention window; the DLQ listing and
  // retention sweep must never be unbounded full-table reads.
  private static readonly listLimit = 500;

  // Row projection shared by failed-job listing and retention cleanup.
  private static readonly select = {
    id: true,
    testId: true,
    candidateId: true,
    payload: true,
    error: true,
    attempts: true,
    maxAttempts: true,
    createdAt: true,
  } as const satisfies Prisma.ComparisonJobSelect;

  async listFailed(): Promise<FailedJobRecord[]> {
    return this.fetchFailedJobRecords(
      { status: JobStatus.FAILED },
      { createdAt: 'desc' },
    );
  }

  async retry(jobId: string): Promise<'retried' | 'not-found' | 'not-failed'> {
    // The status predicate lives in the WRITE, not just the read: a worker may
    // have claimed the job (PROCESSING) between the read and the update — an
    // unguarded write would flip it back to PENDING mid-processing, losing the
    // ownership guard that markCompleted/markFailed rely on.
    const result = await this.client.comparisonJob.updateMany({
      where: { id: jobId, status: JobStatus.FAILED },
      data: {
        status: JobStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
        error: null,
        completedAt: null,
      },
    });
    if (result.count === 0) {
      const existing = await this.client.comparisonJob.findUnique({
        where: { id: jobId },
        select: { id: true, status: true },
      });
      if (!existing) return 'not-found';
      return 'not-failed';
    }
    return 'retried';
  }

  async findFailedJobs(retentionDays: number): Promise<FailedJobRecord[]> {
    return this.fetchFailedJobRecords(
      {
        status: JobStatus.FAILED,
        completedAt: { lte: retentionCutoff(retentionDays) },
      },
      {
        // Oldest first: when the backlog exceeds the per-run cap, the sweep makes
        // steady progress on the oldest failures instead of an arbitrary subset.
        completedAt: 'asc',
      },
    );
  }

  // Deletes only rows still in FAILED status and returns exactly which ids were
  // deleted, atomically: a DLQ retry that flips a row to PENDING between the
  // sweep's file delete and this guarded delete would otherwise leave a live
  // job without its candidate file. DELETE ... RETURNING returns the guarded
  // set in the same statement, so the caller reclaims files only for rows that
  // are actually gone.
  async deleteFailedJobRows(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const deleted = await this.client.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM "ComparisonJob"
       WHERE id = ANY($1::text[]) AND status = $2
       RETURNING id`,
      ids,
      JobStatus.FAILED,
    );
    return deleted.map((row) => row.id);
  }

  // Retention for non-failed job rows: the COMPLETED-row sweep. FAILED-job
  // listing + guarded deletion live above; this owns only the COMPLETED sweep,
  // kept on the same seam so the retention caller injects one owner.
  async deleteCompletedJobs(retentionDays: number): Promise<number> {
    const result = await this.client.comparisonJob.deleteMany({
      where: {
        status: JobStatus.COMPLETED,
        completedAt: { lte: retentionCutoff(retentionDays) },
      },
    });
    return result.count;
  }

  private async fetchFailedJobRecords(
    where: Prisma.ComparisonJobWhereInput,
    orderBy?: Prisma.ComparisonJobOrderByWithRelationInput,
  ): Promise<FailedJobRecord[]> {
    const rows = await this.client.comparisonJob.findMany({
      where,
      orderBy,
      take: FailedJobStore.listLimit,
      select: FailedJobStore.select,
    });
    return rows.map((row) => this.toFailedJobRecord(row));
  }

  private toFailedJobRecord(row: {
    id: string;
    testId: string;
    candidateId: string | null;
    payload: Prisma.JsonValue;
    error: string | null;
    attempts: number;
    maxAttempts: number | null;
    createdAt: Date;
  }): FailedJobRecord {
    const base = {
      id: row.id,
      testId: row.testId,
      candidateId: row.candidateId,
      error: row.error,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      createdAt: row.createdAt,
    };
    try {
      return { ...base, payload: decodeJobData(row.payload) };
    } catch {
      // A job that failed at decode time keeps its raw payload; represent it
      // without a typed payload so DLQ listing and retention stay functional.
      return base;
    }
  }
}

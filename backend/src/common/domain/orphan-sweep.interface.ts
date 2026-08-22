// The orphan-sweep seam: the query + guarded-delete operations the maintenance
// module's OrphanCleanupService needs to find and delete orphaned screenshot
// rows. Exists so internal/data-deletion crosses this interface instead of
// importing the concrete public OrphanedScreenshotRepository, matching the seam
// pattern of STORAGE_OBJECT_REFERENCEDNESS / STORAGE_PROVIDER / JOB_PRODUCER.
export const ORPHAN_SWEEP = 'ORPHAN_SWEEP';

export const DEFAULT_ORPHAN_BASELINE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface OrphanBaselineCriteria {
  maxAgeMs: number;
}

export interface OrphanScreenshotRow {
  id: string;
  imageUrl: string;
}

export interface IOrphanSweep {
  // CURRENT screenshot rows with no comparison candidate and no active job.
  // Returns skipped=true when an active job has NULL candidateId (pre-backfill
  // legacy row) — the sweep cannot prove that candidate is not in flight.
  findOrphanedCurrent(): Promise<{
    skipped: boolean;
    screenshots: OrphanScreenshotRow[];
  }>;

  // Guarded delete of CURRENT orphans: re-checks the comparison + active-job
  // guards in the SAME DELETE statement so a concurrent re-adopted row is never
  // destroyed. Returns the number of rows deleted.
  deleteCurrentOrphansByIds(ids: string[]): Promise<number>;

  // Row-first twin of the storage-first flow: deletes the orphaned BASELINE
  // rows and RETURNS the URLs of exactly the rows the guarded DELETE removed,
  // so files are reclaimed only for rows actually deleted.
  deleteBaselineOrphansByIdsReturningUrls(
    ids: string[],
    maxAgeMs: number,
  ): Promise<string[]>;

  findOrphanedBaseline(
    criteria?: OrphanBaselineCriteria,
  ): Promise<OrphanScreenshotRow[]>;
}

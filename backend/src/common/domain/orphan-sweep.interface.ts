// The orphan-sweep seam: the query + guarded-delete operations the maintenance
// module's OrphanCleanupService needs to find and delete orphaned screenshot
// rows. Exists so internal/data-deletion crosses this interface instead of
// importing the concrete public OrphanedScreenshotRepository, matching the seam
// pattern of STORAGE_OBJECT_REFERENCEDNESS / STORAGE_PROVIDER / JOB_PRODUCER.
export const ORPHAN_SWEEP = 'ORPHAN_SWEEP';

// A project can override the grace per project (`Project.orphanGraceHours`);
// this is the fallback when it does not. Hours because that is the unit the
// setting, the preview and the UI all speak.
export const DEFAULT_ORPHAN_GRACE_HOURS = 24;

export const HOUR_MS = 60 * 60 * 1000;

export interface OrphanBaselineCriteria {
  // Used for a screenshot whose project has no override.
  defaultGraceHours: number;
}

export interface OrphanScreenshotRow {
  id: string;
  imageUrl: string;
}

export interface IOrphanSweep {
  // CURRENT screenshot rows with no comparison candidate and no job that still
  // owns them: pending, processing, or failed-but-retryable. A FAILED job's
  // candidate is evidence for the operator's DLQ retry, never orphan garbage.
  // Returns skipped=true when such a job has NULL candidateId (pre-backfill
  // legacy row) — the sweep cannot prove that candidate is not in flight.
  findOrphanedCurrent(): Promise<{
    skipped: boolean;
    screenshots: OrphanScreenshotRow[];
  }>;

  // Guarded delete of CURRENT orphans: re-checks the comparison + candidate-
  // owning-job guards in the SAME DELETE statement so a concurrent re-adopted
  // row is never destroyed. Returns the number of rows deleted.
  deleteCurrentOrphansByIds(ids: string[]): Promise<number>;

  // Row-first twin of the storage-first flow: deletes the orphaned BASELINE
  // rows and RETURNS the URLs of exactly the rows the guarded DELETE removed,
  // so files are reclaimed only for rows actually deleted.
  deleteBaselineOrphansByIdsReturningUrls(
    ids: string[],
    criteria: OrphanBaselineCriteria,
  ): Promise<string[]>;

  findOrphanedBaseline(
    criteria: OrphanBaselineCriteria,
  ): Promise<OrphanScreenshotRow[]>;
}

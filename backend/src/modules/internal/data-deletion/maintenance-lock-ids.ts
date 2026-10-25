/**
 * Registry of advisory-lock IDs used by maintenance tasks. Keeping them in one
 * place makes collisions visible when adding a new task — two tasks sharing an
 * ID would silently serialize against each other.
 */
export const MAINTENANCE_LOCK_IDS = {
  orphanCleanup: 1001,
  failedJobCleanup: 1002,
  pdfRenderCacheCleanup: 1003,
  unreferencedObjectCleanup: 1004,
  rateLimitBucketCleanup: 1005,
  sessionCleanup: 1006,
  runAutoFinish: 1007,
  runHistoryCleanup: 1008,
} as const;

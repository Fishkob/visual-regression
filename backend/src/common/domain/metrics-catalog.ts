// Single owner of every metric this process records: the names, the histogram
// bucket config, and the recording interface. Producers draw names from here
// instead of spelling literals, so renaming a metric or re-bucketing a domain
// histogram is a one-edit change — and the name→bucket association cannot drift
// (a histogram whose name isn't in the map silently falls back to the default
// buckets, which is exactly the drift this catalog prevents). The recorder
// interface still accepts arbitrary names so the prod/in-memory adapters stay
// generic; every producer must draw from this catalog.
// The Tracker's span names: the Tracker derives `<name>_duration_ms`,
// `<name>_total`, and `<name>_errors_total` from a catalog entry instead of
// accepting a caller-spelled literal, so the tracked operation family edits in
// one place like every other metric. Callers pass a catalog value (or keyed
// group member), never a string literal.
export const TRACKED_OPERATIONS = {
  upload: {
    image: 'unified_upload_intake',
    pdf: 'unified_pdf_upload_intake',
  },
  approval: {
    image: 'image_approval',
    pdf: 'pdf_approval',
  },
  comparisonWorker: 'comparison_worker',
  queueEnqueue: 'queue_enqueue',
} as const;

export const METRICS = {
  httpRequestDuration: 'http_request_duration_ms',
  httpRequestsTotal: 'http_requests_total',
  domainEventsTotal: 'domain_events_total',
  comparisonPixelDiff: 'comparison_pixel_diff',
  comparisonPdfPageDiff: 'comparison_pdf_page_diff',
  maintenanceTaskFailuresTotal: 'maintenance_task_failures_total',
  postCommitCallbackFailuresTotal: 'post_commit_callback_failures_total',
  queueFailedJobs: 'queue_failed_jobs',
  queuePendingJobs: 'queue_pending_jobs',
  queueProcessingJobs: 'queue_processing_jobs',
  queueOldestPendingAgeSeconds: 'queue_oldest_pending_age_seconds',
  queueOwnershipLossTotal: 'queue_ownership_loss_total',
  queueHeartbeatFailuresTotal: 'queue_heartbeat_failures_total',
  queueJobTimeoutsTotal: 'queue_job_timeouts_total',
  queueBookkeepingFailuresTotal: 'queue_bookkeeping_failures_total',
  queueDuplicateJobSkippedTotal: 'queue_duplicate_job_skipped_total',
  cleanupOrphanedScreenshotsTotal: 'cleanup_orphaned_screenshots_total',
  cleanupOrphanedScreenshotsLastRun: 'cleanup_orphaned_screenshots_last_run',
  cleanupPdfRenderCacheTotal: 'cleanup_pdf_render_cache_total',
  cleanupPdfRenderCacheLastRun: 'cleanup_pdf_render_cache_last_run',
  cleanupFailedJobsDeleted: 'cleanup_failed_jobs_deleted',
  cleanupCompletedJobsDeleted: 'cleanup_completed_jobs_deleted',
  cleanupUnreferencedObjectsTotal: 'cleanup_unreferenced_objects_total',
  cleanupUnreferencedObjectsLastRun: 'cleanup_unreferenced_objects_last_run',
  rateLimitedTotal: 'rate_limited_total',
  cleanupRateLimitBucketsDeleted: 'cleanup_rate_limit_buckets_deleted',
  cleanupSessionsDeleted: 'cleanup_sessions_deleted',
  cleanupSessionsLastRun: 'cleanup_sessions_last_run',
  cleanupRunsAutoFinished: 'cleanup_runs_auto_finished',
  cleanupRunsRetained: 'cleanup_runs_retained_total',
  cleanupBranchesDeleted: 'cleanup_branches_deleted_total',
  cleanupBranchesLastRun: 'cleanup_branches_last_run',
  cleanupWebhookDeliveriesDeleted: 'cleanup_webhook_deliveries_deleted',
  cleanupWebhookDeliveriesLastRun: 'cleanup_webhook_deliveries_last_run',
  cleanupShareLinksDeleted: 'cleanup_share_links_deleted',
  cleanupShareLinksLastRun: 'cleanup_share_links_last_run',
  cleanupAuditEventsDeleted: 'cleanup_audit_events_deleted',
  cleanupAuditEventsLastRun: 'cleanup_audit_events_last_run',
  cleanupOutcomesDeleted: 'cleanup_outcomes_deleted',
  cleanupOutcomesLastRun: 'cleanup_outcomes_last_run',
  storageSizeBackfilled: 'storage_size_backfilled_total',
} as const;

// The domain histograms' bucket config, keyed by catalog name so the buckets
// live beside the name. Anything not listed falls back to the default buckets.
export const METRIC_HISTOGRAM_BUCKETS: Record<string, number[]> = {
  [METRICS.comparisonPixelDiff]: [0, 1, 10, 100, 1000, 10000, 100000, 1000000],
  [METRICS.comparisonPdfPageDiff]: [0, 1, 2, 5, 10, 25, 50, 100],
};

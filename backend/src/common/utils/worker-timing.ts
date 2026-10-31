// Single owner of the worker timing budget. The poller, the worker health
// server, and the job queue share one set of deadlines whose ordering is a
// live invariant:
//
//   heartbeatIntervalMs (5s)   <  stallTimeoutSeconds (60s)   — the queue's
//                                own row heartbeat must refresh a PROCESSING
//                                job before the stall-reclaim window;
//   workerHealthHeartbeatMs (30s) < stallTimeoutSeconds (60s) — a busy worker's
//                                liveness heartbeat keeps /health `ok` while
//                                the queue is still the one deciding "job is
//                                actually dead" at 60s;
//   maxPollIntervalMs (30s)     <  pollStallThresholdMs (150s) — a wedged poll
//                                loop (no cycle completes) is only reported as
//                                `error` after 5x the max backoff;
//   drainTimeoutMs (30s)        — upper bound on waiting for the in-flight job
//                                at shutdown; the poller claims nothing after
//                                SIGTERM, so this only bounds the last job.
//                                Must stay below the container stop grace period.
//
// Any change to one of these deadlines is one edit here, not a hunt across
// three files that must stay in sync by convention.
export const WORKER_TIMING = {
  minPollIntervalMs: 2000,
  maxPollIntervalMs: 30_000,
  workerHealthHeartbeatMs: 30_000,
  drainTimeoutMs: 30_000,
  pollStallThresholdMs: 150_000,
  stallTimeoutSeconds: 60,
  heartbeatIntervalMs: 5000,
} as const;

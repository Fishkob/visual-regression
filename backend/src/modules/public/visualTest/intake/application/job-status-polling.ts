// The long-poll budget of the job-status endpoint. The interval is a DI token
// (not a literal in the service) so tests can drive the loop without real
// 250 ms/30 s waits. `maxWaitSeconds` is the server-side cap: the query DTO
// rejects values above it, and the service clamps a direct caller as a second
// line of defence, so no request can pin a connection open indefinitely.
export const JOB_STATUS_POLLING = 'JOB_STATUS_POLLING';

export interface JobStatusPollingConfig {
  pollIntervalMs: number;
  maxWaitSeconds: number;
}

export const DEFAULT_JOB_STATUS_POLLING: JobStatusPollingConfig = {
  pollIntervalMs: 250,
  maxWaitSeconds: 30,
};

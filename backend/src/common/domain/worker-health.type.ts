// The wire contract between the worker process (server) and the API process
// (consumer): the API's HealthChecker polls the worker's health port and must
// understand the payload it receives. Living in common/domain keeps the health
// module free of a dependency on the worker module's implementation — both
// processes depend on this type, mirroring health-result.type.ts.
export interface WorkerHealthState {
  lastJobProcessedAt: string | null;
  lastPollAt: string | null;
  jobsProcessed: number;
  startTime: number;
}

export interface WorkerHealthPayload {
  status: 'ok' | 'error';
  uptime: number;
  lastJobProcessedAt: string | null;
  lastPollAt: string | null;
  jobsProcessed: number;
}

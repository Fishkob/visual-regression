// The recorder face of the worker health server: the public consumers that
// touch worker liveness (the job poller's record calls) depend on this small
// token so they never import the concrete WorkerHealthServer (with its HTTP
// server, config, and metrics dependencies) from internal/worker. The
// start()/stop() surface stays on the concrete class for the composition root;
// the wire contract (WorkerHealthPayload) is a separate type in
// worker-health.type.ts.
export const WORKER_HEALTH = 'WORKER_HEALTH';

export interface IWorkerHealth {
  recordPoll(): void;
  recordJobProcessed(): void;
}

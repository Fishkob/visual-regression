export const METRICS_RECORDER = 'METRICS_RECORDER';

export type MetricLabels = Record<string, string>;

// The narrow recording seam that base infrastructure (common/, prisma/) and
// internal modules depend on, so they never import the concrete MetricsService
// from modules/internal/metrics/. The full surface internal modules actually
// record lives here — counter, gauge, and histogram — plus the registry dump
// the worker's own health port scrapes (see worker-health-server), so that
// consumer crosses the seam too.
export interface IMetricsRecorder {
  incrementCounter(name: string, labels?: MetricLabels, value?: number): void;
  setGauge(name: string, value: number, labels?: MetricLabels): void;
  observeHistogram(name: string, value: number, labels?: MetricLabels): void;
  getPrometheusMetrics(): Promise<string>;
}

import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from '@prometheus-io/client';
import {
  IMetricsRecorder,
  MetricLabels,
} from '@common/domain/metrics-recorder.interface';
import { METRIC_HISTOGRAM_BUCKETS } from '@common/domain/metrics-catalog';

export type { MetricLabels };

const register = new Registry();

const DEFAULT_HISTOGRAM_BUCKETS = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000,
];

@Injectable()
export class MetricsService implements IMetricsRecorder {
  constructor(private readonly enabled = true) {
    if (this.enabled) {
      collectDefaultMetrics({ register });
    }
  }

  incrementCounter(name: string, labels?: MetricLabels, value = 1): void {
    if (!this.enabled) return;
    const labelNames = labels ? Object.keys(labels) : [];
    this.ensureCounter(name, labelNames).inc(labels ?? {}, value);
  }

  setGauge(name: string, value: number, labels?: MetricLabels): void {
    if (!this.enabled) return;
    const labelNames = labels ? Object.keys(labels) : [];
    this.ensureGauge(name, labelNames).set(labels ?? {}, value);
  }

  observeHistogram(name: string, value: number, labels?: MetricLabels): void {
    if (!this.enabled) return;
    const labelNames = labels ? Object.keys(labels) : [];
    this.ensureHistogram(name, labelNames).observe(labels ?? {}, value);
  }

  async getPrometheusMetrics(): Promise<string> {
    if (!this.enabled) return '';
    return register.metrics();
  }

  private ensureCounter(name: string, labelNames: string[]): Counter<string> {
    const existing = register.getSingleMetric(name) as
      Counter<string> | undefined;
    if (!existing) {
      return new Counter({
        name,
        help: `${name} counter`,
        labelNames,
        registers: [register],
      });
    }
    return existing;
  }

  private ensureGauge(name: string, labelNames: string[]): Gauge<string> {
    const existing = register.getSingleMetric(name) as
      Gauge<string> | undefined;
    if (!existing) {
      return new Gauge({
        name,
        help: `${name} gauge`,
        labelNames,
        registers: [register],
      });
    }
    return existing;
  }

  private ensureHistogram(
    name: string,
    labelNames: string[],
  ): Histogram<string> {
    const existing = register.getSingleMetric(name) as
      Histogram<string> | undefined;
    if (!existing) {
      return new Histogram({
        name,
        help: `${name} histogram`,
        labelNames,
        buckets: METRIC_HISTOGRAM_BUCKETS[name] ?? DEFAULT_HISTOGRAM_BUCKETS,
        registers: [register],
      });
    }
    return existing;
  }
}

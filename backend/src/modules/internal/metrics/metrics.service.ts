import { Injectable } from '@nestjs/common';
import promClient from 'prom-client';
import {
  IMetricsRecorder,
  MetricLabels,
} from '@common/domain/metrics-recorder.interface';
import { METRIC_HISTOGRAM_BUCKETS } from '@common/domain/metrics-catalog';

export type { MetricLabels };

const register = new promClient.Registry();

const DEFAULT_HISTOGRAM_BUCKETS = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000,
];

@Injectable()
export class MetricsService implements IMetricsRecorder {
  constructor(private readonly enabled = true) {
    if (this.enabled) {
      promClient.collectDefaultMetrics({ register });
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

  private ensureCounter(
    name: string,
    labelNames: string[],
  ): promClient.Counter {
    const existing = register.getSingleMetric(name) as
      promClient.Counter | undefined;
    if (!existing) {
      return new promClient.Counter({
        name,
        help: `${name} counter`,
        labelNames,
        registers: [register],
      });
    }
    return existing;
  }

  private ensureGauge(name: string, labelNames: string[]): promClient.Gauge {
    const existing = register.getSingleMetric(name) as
      promClient.Gauge | undefined;
    if (!existing) {
      return new promClient.Gauge({
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
  ): promClient.Histogram {
    const existing = register.getSingleMetric(name) as
      promClient.Histogram | undefined;
    if (!existing) {
      return new promClient.Histogram({
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

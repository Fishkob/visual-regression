import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import {
  emitObservabilityEvent,
  EVENT_COUNTER,
} from '@common/domain/observability-event.emitter';
import type { ObservabilityEvent } from '@common/domain/observability-event.type';
import type { AppLoggerService } from '@common/logging/app-logger.service';
import type { IMetricsRecorder } from '@common/domain/metrics-recorder.interface';
import { createMock } from '@test/utils/create-mock';

describe('emitObservabilityEvent', () => {
  let logger: Mocked<Pick<AppLoggerService, 'log' | 'warn' | 'error'>>;
  let metrics: Mocked<
    Pick<IMetricsRecorder, 'incrementCounter' | 'observeHistogram'>
  >;

  beforeEach(() => {
    logger = createMock<Pick<AppLoggerService, 'log' | 'warn' | 'error'>>();
    metrics =
      createMock<
        Pick<IMetricsRecorder, 'incrementCounter' | 'observeHistogram'>
      >();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs and counts a screenshot upload', () => {
    const event: ObservabilityEvent = {
      kind: 'screenshot_uploaded',
      visualTestId: 'test-1',
      type: 'BASELINE',
    };

    emitObservabilityEvent(event, { logger, metrics });

    expect(logger.log).toHaveBeenCalledWith('Screenshot uploaded', {
      visualTestId: 'test-1',
      type: 'BASELINE',
    });
    expect(metrics.incrementCounter).toHaveBeenCalledWith(EVENT_COUNTER, {
      event: 'screenshot_uploaded',
      type: 'BASELINE',
      status: '',
    });
  });

  it('logs a completed comparison and records the diff histogram', () => {
    const event: ObservabilityEvent = {
      kind: 'comparison_completed',
      testKind: 'image',
      visualTestId: 'test-1',
      comparisonId: 'comp-1',
      outcome: 'changed',
      diffMetric: 42,
    };

    emitObservabilityEvent(event, { logger, metrics });

    expect(logger.warn).toHaveBeenCalledWith(
      'Difference detected — pending review',
      expect.objectContaining({ comparisonId: 'comp-1' }),
    );
    expect(metrics.observeHistogram).toHaveBeenCalledWith(
      'comparison_pixel_diff',
      42,
    );
  });

  it('uses the pdf histogram for pdf comparisons', () => {
    const event: ObservabilityEvent = {
      kind: 'comparison_completed',
      testKind: 'pdf',
      visualTestId: 'test-1',
      outcome: 'unchanged',
      diffMetric: 0,
    };

    emitObservabilityEvent(event, { logger, metrics });

    expect(metrics.observeHistogram).toHaveBeenCalledWith(
      'comparison_pdf_page_diff',
      0,
    );
  });

  it('does not warn when a completed comparison is unchanged', () => {
    const event: ObservabilityEvent = {
      kind: 'comparison_completed',
      testKind: 'image',
      visualTestId: 'test-1',
      outcome: 'unchanged',
      diffMetric: 0,
    };

    emitObservabilityEvent(event, { logger, metrics });

    expect(logger.warn).not.toHaveBeenCalled();
    expect(metrics.incrementCounter).toHaveBeenCalledWith(EVENT_COUNTER, {
      event: 'comparison_completed',
      type: '',
      status: 'UNCHANGED',
    });
  });

  it('counts a within-threshold diff as unchanged and logs the outcome', () => {
    const event: ObservabilityEvent = {
      kind: 'comparison_completed',
      testKind: 'image',
      visualTestId: 'test-1',
      outcome: 'within_threshold',
      diffMetric: 15,
    };

    emitObservabilityEvent(event, { logger, metrics });

    expect(logger.log).toHaveBeenCalledWith('Comparison completed', {
      testKind: 'image',
      visualTestId: 'test-1',
      comparisonId: undefined,
      outcome: 'within_threshold',
      status: 'UNCHANGED',
      diffMetric: 15,
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(metrics.incrementCounter).toHaveBeenCalledWith(EVENT_COUNTER, {
      event: 'comparison_completed',
      type: '',
      status: 'UNCHANGED',
    });
  });

  it('logs and counts an approval', () => {
    const event: ObservabilityEvent = {
      kind: 'comparison_approved',
      baselineId: 'baseline-1',
      visualTestId: 'test-1',
    };

    emitObservabilityEvent(event, { logger, metrics });

    expect(logger.log).toHaveBeenCalledWith('Comparison approved', {
      baselineId: 'baseline-1',
      visualTestId: 'test-1',
    });
    expect(metrics.incrementCounter).toHaveBeenCalledWith(EVENT_COUNTER, {
      event: 'comparison_approved',
      type: '',
      status: '',
    });
  });

  it('logs and counts a baseline update', () => {
    const event: ObservabilityEvent = {
      kind: 'baseline_updated',
      visualTestId: 'test-1',
      baselineId: 'baseline-1',
    };

    emitObservabilityEvent(event, { logger, metrics });

    expect(logger.log).toHaveBeenCalledWith('Baseline updated', {
      visualTestId: 'test-1',
      baselineId: 'baseline-1',
    });
    expect(metrics.incrementCounter).toHaveBeenCalledWith(EVENT_COUNTER, {
      event: 'baseline_updated',
      type: '',
      status: '',
    });
  });
});

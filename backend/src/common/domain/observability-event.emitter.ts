import { ComparisonStatus } from '@/prisma/client';
import { assertNever } from '@common/utils/assert-never';
import { METRICS } from '@common/domain/metrics-catalog';
import type { AppLoggerService } from '@common/logging/app-logger.service';
import type { IMetricsRecorder } from '@common/domain/metrics-recorder.interface';
import type { ObservabilityEvent } from '@common/domain/observability-event.type';

// The log + metric shape for each observability event kind, living beside the
// type that declares the kinds. The StateChangeWorkflow delegates emission here
// so adding a new kind edits one directory (the type + this emitter) instead of
// growing the transaction orchestrator's switch.
export const EVENT_COUNTER = METRICS.domainEventsTotal;

export interface EmitObservabilityDeps {
  logger: Pick<AppLoggerService, 'log' | 'warn' | 'error'>;
  metrics: Pick<IMetricsRecorder, 'incrementCounter' | 'observeHistogram'>;
}

export function emitObservabilityEvent(
  event: ObservabilityEvent,
  deps: EmitObservabilityDeps,
): void {
  const { logger, metrics } = deps;
  switch (event.kind) {
    case 'screenshot_uploaded':
      logger.log('Screenshot uploaded', {
        visualTestId: event.visualTestId,
        type: event.type,
      });
      metrics.incrementCounter(EVENT_COUNTER, {
        event: 'screenshot_uploaded',
        type: event.type,
        status: '',
      });
      break;
    case 'comparison_completed':
      logger.log('Comparison completed', {
        testKind: event.testKind,
        visualTestId: event.visualTestId,
        comparisonId: event.comparisonId,
        status: event.newStatus,
        diffMetric: event.diffMetric,
      });
      if (event.newStatus === ComparisonStatus.PENDING_APPROVAL) {
        logger.warn('Difference detected — pending review', {
          testKind: event.testKind,
          visualTestId: event.visualTestId,
          comparisonId: event.comparisonId,
          diffMetric: event.diffMetric,
        });
      }
      metrics.incrementCounter(EVENT_COUNTER, {
        event: 'comparison_completed',
        type: '',
        status: event.newStatus,
      });
      metrics.observeHistogram(
        event.testKind === 'pdf'
          ? METRICS.comparisonPdfPageDiff
          : METRICS.comparisonPixelDiff,
        event.diffMetric,
      );
      break;
    case 'comparison_approved':
      logger.log('Comparison approved', {
        baselineId: event.baselineId,
        visualTestId: event.visualTestId,
      });
      metrics.incrementCounter(EVENT_COUNTER, {
        event: 'comparison_approved',
        type: '',
        status: '',
      });
      break;
    case 'baseline_updated':
      logger.log('Baseline updated', {
        visualTestId: event.visualTestId,
        baselineId: event.baselineId,
      });
      metrics.incrementCounter(EVENT_COUNTER, {
        event: 'baseline_updated',
        type: '',
        status: '',
      });
      break;
    default:
      assertNever(event);
  }
}

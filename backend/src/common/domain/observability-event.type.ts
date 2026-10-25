import type { ScreenshotType } from '@/prisma/client';
import type { TestKind } from '@common/domain/test-kind';

// A completed comparison has exactly two outcomes, and neither is a persisted
// ComparisonStatus: a zero-diff run retires its candidate without storing a
// row, and a real diff stores PENDING_APPROVAL. Carrying the outcome on the
// event keeps observability from borrowing a status value no row can hold.
export type ComparisonCompletionOutcome = 'unchanged' | 'changed';

// Post-commit observability records returned by state-change mutations. The
// StateChangeWorkflow emits them directly to the logger + metrics after commit
// (no event bus — see ADR-004): both consumers are observability-only and the
// workflow already has the logger and metrics recorder injected.
export type ObservabilityEvent =
  | { kind: 'screenshot_uploaded'; visualTestId: string; type: ScreenshotType }
  | {
      kind: 'comparison_completed';
      testKind: TestKind;
      visualTestId: string;
      comparisonId?: string;
      outcome: ComparisonCompletionOutcome;
      diffMetric: number;
    }
  | { kind: 'comparison_approved'; baselineId: string; visualTestId: string }
  | { kind: 'baseline_updated'; visualTestId: string; baselineId: string };

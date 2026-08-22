import { ComparisonOutcome } from '@common/domain/upload-outcome';

export interface BaselineInfo {
  id: string;
  contentHash: string;
  fileUrl: string;
}

export interface BaselineCreatedUploadDecision {
  status: ComparisonOutcome.BASELINE_CREATED;
  testId: string;
  contentHash: string;
}

export interface IdenticalUploadDecision {
  status: ComparisonOutcome.IDENTICAL;
  testId: string;
}

export interface ComparisonQueuedUploadDecision {
  status: ComparisonOutcome.COMPARISON_QUEUED;
  testId: string;
  baseline: BaselineInfo;
  contentHash: string;
}

export type UploadDecision =
  | BaselineCreatedUploadDecision
  | IdenticalUploadDecision
  | ComparisonQueuedUploadDecision;

export function decideOutcome(
  testId: string,
  contentHash: string,
  baseline: BaselineInfo | null,
): UploadDecision {
  if (!baseline) {
    return { status: ComparisonOutcome.BASELINE_CREATED, testId, contentHash };
  }
  if (baseline.contentHash === contentHash) {
    return { status: ComparisonOutcome.IDENTICAL, testId };
  }
  return {
    status: ComparisonOutcome.COMPARISON_QUEUED,
    testId,
    baseline: {
      id: baseline.id,
      contentHash: baseline.contentHash,
      fileUrl: baseline.fileUrl,
    },
    contentHash,
  };
}

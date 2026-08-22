import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@common/domain/upload-outcome';

export interface IdenticalResult {
  status: ComparisonOutcome.IDENTICAL;
  mismatchPixelCount: number;
}

export interface BaselineCreatedResult {
  status: ComparisonOutcome.BASELINE_CREATED;
  testId: string;
  fileUrl: string;
}

export interface ComparisonQueuedResult {
  status: ComparisonOutcome.COMPARISON_QUEUED;
  error: ComparisonErrorCode;
  message: string;
}

export type AnyUploadResult =
  IdenticalResult | BaselineCreatedResult | ComparisonQueuedResult;

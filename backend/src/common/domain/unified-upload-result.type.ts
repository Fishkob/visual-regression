import {
  ComparisonErrorCode,
  ComparisonOutcome,
} from '@common/domain/upload-outcome';

// Every result names the branch it landed on: a client that omitted `branch`
// knows it hit the project default, and one that asked for a new branch can
// confirm the name instead of trusting a 201.
export interface IdenticalResult {
  status: ComparisonOutcome.IDENTICAL;
  mismatchPixelCount: number;
  branch: string;
}

export interface BaselineCreatedResult {
  status: ComparisonOutcome.BASELINE_CREATED;
  testId: string;
  fileUrl: string;
  signedFileUrl: string;
  branch: string;
}

export interface ComparisonQueuedResult {
  status: ComparisonOutcome.COMPARISON_QUEUED;
  error: ComparisonErrorCode;
  message: string;
  branch: string;
  jobId: string;
}

export type AnyUploadResult =
  IdenticalResult | BaselineCreatedResult | ComparisonQueuedResult;

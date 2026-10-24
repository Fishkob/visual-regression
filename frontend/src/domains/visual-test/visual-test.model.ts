export interface Screenshot {
  imageUrl: string;
  pixelDiffThreshold?: number;
  viewport?: string;
  browser?: string;
  environment?: string;
}

import type { VisualTestStatus } from "@/domains/test-status";
import type { BranchOrigin } from "@/domains/branches/branch-origin";

export interface Comparison {
  id: string;
  diffImageUrl: string;
  mismatchPixelCount?: number;
  status: VisualTestStatus;
  thresholdExceeded: boolean;
  createdAt?: string;
  baseline?: Screenshot;
  candidate?: Screenshot;
}

export interface VisualTestDetails {
  name?: string;
  baseline?: Screenshot;
  comparison?: Comparison;
  origin?: BranchOrigin;
  inheritedFrom?: string | null;
  // Whether the BASELINE is still an inherited clone that follows the target
  // branch, and which branch it follows. Distinct from `origin`, which is about
  // the test row.
  baselineInherited?: boolean;
  inheritTarget?: string | null;
}

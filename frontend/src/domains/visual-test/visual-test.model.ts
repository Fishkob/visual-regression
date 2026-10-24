export interface Screenshot {
  imageUrl: string;
  pixelDiffThreshold?: number;
  viewport?: string;
  browser?: string;
  environment?: string;
}

import type { TestStatusValue, VisualTestStatus } from "@/domains/test-status";
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

// One tile of the variant gallery: a single configuration of the same test
// (viewport/browser/environment) with the image that represents its current
// state — the candidate while a change is pending, otherwise the baseline.
export interface VariantSummary {
  viewport: string;
  browser: string;
  environment: string;
  status: TestStatusValue;
  baselineUrl?: string;
  candidateUrl?: string;
  mismatchPixelCount?: number;
  baselineInherited: boolean;
}

export interface TestVariants {
  name?: string;
  kind?: string;
  variants: VariantSummary[];
}

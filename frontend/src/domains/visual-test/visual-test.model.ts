export interface Screenshot {
  imageUrl: string;
  pixelDiffThreshold?: number;
  viewport?: string;
  browser?: string;
  environment?: string;
}

import type { VisualTestStatus } from "@/domains/test-status";

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
}

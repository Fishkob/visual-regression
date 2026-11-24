import type { TestKind } from "@/domains/test-kind";

export interface ReviewInboxItem {
  comparisonId: string;
  projectName: string;
  // The owner of the item's project: the inbox sections by it (ADR-084), and
  // the flag marks the blocks that everybody may read (ADR-083).
  teamId: string;
  teamName: string;
  isShared: boolean;
  testName: string;
  kind?: TestKind;
  branchName: string;
  // Present when the upload carried a run key; the inbox filters and badges by
  // it. Null keeps uploads without a run grouped exactly as before.
  runKey?: string | null;
  isDefaultBranch: boolean;
  viewport?: string;
  browser?: string;
  environment?: string;
  mismatchPixelCount: number;
  mismatchPageCount?: number | null;
  createdAt: string;
  // Pending comparisons in the item's project on its branch, across all tests —
  // the set the project's review pass walks, independent of inbox filters.
  projectPendingCount?: number;
  projectBranchCount?: number;
}

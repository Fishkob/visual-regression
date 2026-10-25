import type { TestKind } from "@/domains/test-kind";

export interface ReviewInboxItem {
  comparisonId: string;
  projectName: string;
  groupId?: string | null;
  groupName?: string | null;
  testName: string;
  kind?: TestKind;
  branchName: string;
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

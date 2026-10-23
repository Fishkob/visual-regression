import type { TestKind } from "@/domains/test-kind";

export interface ReviewInboxItem {
  comparisonId: string;
  projectName: string;
  groupId?: string | null;
  groupName?: string | null;
  testName: string;
  kind?: TestKind;
  viewport?: string;
  browser?: string;
  environment?: string;
  mismatchPixelCount: number;
  mismatchPageCount?: number | null;
  createdAt: string;
}

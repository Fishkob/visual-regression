import type { TestKind } from "@/domains/test-kind";
import type { ApprovalReason } from "./approval-reason";
import type { VariantParams } from "@/lib/variant-key";

// One row of the durable approval trail, as the review header consumes it. The
// comparison an approval refers to may already be deleted, so the trail keeps
// the identifiers it captured at approval time instead of pointing at rows that
// can disappear.
export interface Approval {
  id: string;
  approvedBy: string;
  approvedAt: Date;
  comparisonId: string;
  testKind: TestKind;
  branchName?: string;
  variant: VariantParams;
  reason?: ApprovalReason;
  note?: string;
  candidateHash: string;
  baselineHash?: string;
  mismatchPixelCount?: number;
  mismatchPageCount?: number;
  pageCount?: number;
}

import { describe, expect, it } from "vitest";
import type { ApprovalDto } from "@sdk";
import { mapApproval } from "@/domains/approvals/approval.mapper";
import { isApprovalReason } from "@/domains/approvals/approval-reason";

const dto = (overrides: Partial<ApprovalDto> = {}): ApprovalDto => ({
  id: "ap-1",
  approvedBy: "alice",
  approvedAt: "2026-10-01T10:00:00.000Z",
  comparisonId: "cmp-1",
  testKind: "image",
  reason: "INTENDED_CHANGE",
  note: "Redesign approved by design",
  branchName: "main",
  variant: { viewport: "1920x1080", browser: "chrome", environment: "prod" },
  candidateHash: "abc",
  baselineHash: null,
  mismatchPixelCount: 12,
  mismatchPageCount: null,
  pageCount: null,
  ...overrides,
});

describe("approval reasons", () => {
  it("maps the reason and note onto the approval", () => {
    const approval = mapApproval(dto());
    expect(approval.reason).toBe("INTENDED_CHANGE");
    expect(approval.note).toBe("Redesign approved by design");
  });

  it("omits an unknown reason and empty note", () => {
    const approval = mapApproval(dto({ reason: "OTHER" as never, note: "" }));
    expect(approval.reason).toBeUndefined();
    expect(approval.note).toBeUndefined();
  });

  it("guards the reason vocabulary", () => {
    expect(isApprovalReason("INTENDED_CHANGE")).toBe(true);
    expect(isApprovalReason("FLAKE")).toBe(true);
    expect(isApprovalReason("OTHER")).toBe(false);
  });
});

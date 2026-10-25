import { describe, expect, it } from "vitest";
import type { ApprovalDto } from "@sdk";
import { mapApproval, mapApprovals } from "../approval.mapper";

const fullDto: ApprovalDto = {
  id: "ap-1",
  approvedBy: "jane.doe",
  approvedAt: "2024-05-01T10:30:00.000Z",
  comparisonId: "cmp-1",
  testKind: "image",
  branchName: "feature/login",
  variant: {
    viewport: "1920x1080",
    browser: "Chrome",
    environment: "staging",
  },
  candidateHash: "candidate-hash",
  baselineHash: "baseline-hash",
  mismatchPixelCount: 42,
  mismatchPageCount: null,
  pageCount: null,
};

describe("mapApproval", () => {
  it("narrows a full DTO and converts approvedAt to a Date", () => {
    const approval = mapApproval(fullDto);

    expect(approval).toEqual({
      id: "ap-1",
      approvedBy: "jane.doe",
      approvedAt: new Date("2024-05-01T10:30:00.000Z"),
      comparisonId: "cmp-1",
      testKind: "image",
      branchName: "feature/login",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
      candidateHash: "candidate-hash",
      baselineHash: "baseline-hash",
      mismatchPixelCount: 42,
    });
    expect(approval.approvedAt).toBeInstanceOf(Date);
    expect(approval.approvedAt.toISOString()).toBe("2024-05-01T10:30:00.000Z");
  });

  it("drops null optionals instead of carrying them through", () => {
    const approval = mapApproval(fullDto);

    expect(approval).not.toHaveProperty("mismatchPageCount");
    expect(approval).not.toHaveProperty("pageCount");
  });

  it("drops missing optionals", () => {
    const approval = mapApproval({
      id: "ap-1",
      approvedBy: "jane.doe",
      approvedAt: "2024-05-01T10:30:00.000Z",
      comparisonId: "cmp-1",
      testKind: "image",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
      candidateHash: "candidate-hash",
    });

    expect(approval).not.toHaveProperty("branchName");
    expect(approval).not.toHaveProperty("baselineHash");
    expect(approval).not.toHaveProperty("mismatchPixelCount");
  });

  it("keeps the PDF kind's page counts", () => {
    const approval = mapApproval({
      ...fullDto,
      testKind: "pdf",
      baselineHash: null,
      mismatchPixelCount: null,
      mismatchPageCount: 3,
      pageCount: 12,
    });

    expect(approval.testKind).toBe("pdf");
    expect(approval.mismatchPageCount).toBe(3);
    expect(approval.pageCount).toBe(12);
    expect(approval).not.toHaveProperty("mismatchPixelCount");
  });
});

describe("mapApprovals", () => {
  it("maps a list in the order the API returned it", () => {
    const approvals = mapApprovals([
      fullDto,
      { ...fullDto, id: "ap-2", approvedBy: "john.doe" },
    ]);

    expect(approvals.map((approval) => approval.id)).toEqual(["ap-1", "ap-2"]);
    expect(approvals[1].approvedBy).toBe("john.doe");
  });

  it("maps a missing list to an empty array", () => {
    expect(mapApprovals(undefined)).toEqual([]);
    expect(mapApprovals(null)).toEqual([]);
    expect(mapApprovals([])).toEqual([]);
  });
});

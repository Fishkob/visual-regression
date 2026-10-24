import { describe, expect, it } from "vitest";
import type { BranchSummaryDto } from "@sdk";
import { mapBranch, mapBranches } from "../branch.mapper";

const dto = (overrides: Partial<BranchSummaryDto> = {}): BranchSummaryDto => ({
  name: "feature/x",
  isDefault: false,
  isArchived: false,
  targetBranchName: "main",
  testCount: 3,
  pendingCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("branch mapper", () => {
  it("maps branch DTOs", () => {
    expect(mapBranch(dto())).toEqual({
      name: "feature/x",
      isDefault: false,
      isArchived: false,
      targetBranchName: "main",
      testCount: 3,
      pendingCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(mapBranches()).toEqual([]);
  });

  it("normalizes a missing target branch to null", () => {
    expect(
      mapBranch(dto({ targetBranchName: null })).targetBranchName,
    ).toBeNull();
  });

  it("maps a list of branches", () => {
    expect(
      mapBranches([dto(), dto({ name: "main", isDefault: true })]).map(
        (branch) => branch.name,
      ),
    ).toEqual(["feature/x", "main"]);
  });
});

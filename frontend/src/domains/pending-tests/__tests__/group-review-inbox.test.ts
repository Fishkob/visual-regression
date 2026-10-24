import { describe, expect, it } from "vitest";
import { groupReviewInbox } from "../group-review-inbox";
import type { ReviewInboxItem } from "../review-inbox.model";

const item = (overrides: Partial<ReviewInboxItem>): ReviewInboxItem => ({
  comparisonId: "c",
  projectName: "p",
  testName: "t",
  kind: "image",
  branchName: "main",
  isDefaultBranch: true,
  mismatchPixelCount: 1,
  createdAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

describe("groupReviewInbox", () => {
  it("groups by group then project, Unassigned last", () => {
    const sections = groupReviewInbox([
      item({
        comparisonId: "1",
        projectName: "z",
        groupId: "g1",
        groupName: "Alpha",
      }),
      item({
        comparisonId: "2",
        projectName: "u",
        groupId: null,
        groupName: null,
      }),
      item({
        comparisonId: "3",
        projectName: "a",
        groupId: "g1",
        groupName: "Alpha",
      }),
    ]);

    expect(sections.map((s) => s.name)).toEqual(["Alpha", "Unassigned"]);
    expect(sections[0].items.map((p) => p.projectName)).toEqual(["a", "z"]);
  });

  it("sorts reviews oldest first", () => {
    const sections = groupReviewInbox([
      item({ comparisonId: "new", createdAt: "2026-10-22T10:00:00.000Z" }),
      item({ comparisonId: "old", createdAt: "2026-10-20T10:00:00.000Z" }),
    ]);
    expect(sections[0].items[0].items.map((i) => i.comparisonId)).toEqual([
      "old",
      "new",
    ]);
  });

  it("sorts projects by their oldest review", () => {
    const sections = groupReviewInbox([
      item({
        comparisonId: "a1",
        projectName: "a",
        groupId: "g1",
        groupName: "Alpha",
        createdAt: "2026-10-21T10:00:00.000Z",
      }),
      item({
        comparisonId: "z1",
        projectName: "z",
        groupId: "g1",
        groupName: "Alpha",
        createdAt: "2026-10-20T10:00:00.000Z",
      }),
      item({
        comparisonId: "z2",
        projectName: "z",
        groupId: "g1",
        groupName: "Alpha",
        createdAt: "2026-10-23T10:00:00.000Z",
      }),
    ]);

    expect(sections[0].items.map((p) => p.projectName)).toEqual(["z", "a"]);
    expect(sections[0].items[0].items.map((i) => i.comparisonId)).toEqual([
      "z1",
      "z2",
    ]);
  });

  it("sorts assigned groups alphabetically and Unassigned last", () => {
    const sections = groupReviewInbox([
      item({
        comparisonId: "1",
        projectName: "p1",
        groupId: "g2",
        groupName: "Zeta",
      }),
      item({
        comparisonId: "2",
        projectName: "p2",
        groupId: null,
        groupName: null,
      }),
      item({
        comparisonId: "3",
        projectName: "p3",
        groupId: "g1",
        groupName: "Alpha",
      }),
    ]);

    expect(sections.map((s) => s.name)).toEqual([
      "Alpha",
      "Zeta",
      "Unassigned",
    ]);
  });
});

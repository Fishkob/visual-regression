import { describe, expect, it } from "vitest";
import { groupReviewInbox } from "../inbox-sections";
import type { ReviewInboxItem } from "../review-inbox.model";

const item = (
  overrides: Partial<ReviewInboxItem> & { comparisonId: string },
): ReviewInboxItem => ({
  projectName: "checkout-ui",
  teamId: "t-1",
  teamName: "Checkout",
  isShared: false,
  testName: "login",
  branchName: "main",
  isDefaultBranch: true,
  mismatchPixelCount: 1,
  createdAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

describe("groupReviewInbox", () => {
  // The header states the owner, so two projects of one team form one block:
  // that is the whole point of sectioning by team instead of by project label.
  it("puts the projects of one team under one section", () => {
    const sections = groupReviewInbox([
      item({ comparisonId: "c1", projectName: "checkout-ui" }),
      item({ comparisonId: "c2", projectName: "cart-ui" }),
      item({
        comparisonId: "c3",
        projectName: "admin-ui",
        teamId: "t-2",
        teamName: "Platform",
        isShared: true,
      }),
    ]);

    expect(sections.map((section) => section.name)).toEqual([
      "Checkout",
      "Platform",
    ]);
    expect(sections[0].items.map((project) => project.projectName)).toEqual([
      "cart-ui",
      "checkout-ui",
    ]);
    // The project block keeps the team identity it was grouped by, so the row
    // can show the "visible to everyone" badge without a second read.
    expect(sections[1].items[0]).toMatchObject({
      projectName: "admin-ui",
      teamId: "t-2",
      isShared: true,
    });
  });

  it("orders the items of a project oldest first, then by id", () => {
    const sections = groupReviewInbox([
      item({
        comparisonId: "c2",
        createdAt: "2026-10-20T10:00:00.000Z",
        testName: "later",
      }),
      item({
        comparisonId: "c1",
        createdAt: "2026-10-19T10:00:00.000Z",
        testName: "earlier",
      }),
      item({
        comparisonId: "c0",
        createdAt: "2026-10-19T10:00:00.000Z",
        testName: "tie",
      }),
    ]);

    expect(sections[0].items[0].items.map((row) => row.comparisonId)).toEqual([
      "c0",
      "c1",
      "c2",
    ]);
  });

  it("orders the project blocks by their earliest review, then by name", () => {
    const sections = groupReviewInbox([
      item({
        comparisonId: "c1",
        projectName: "b-ui",
        createdAt: "2026-10-21T10:00:00.000Z",
      }),
      item({
        comparisonId: "c2",
        projectName: "a-ui",
        createdAt: "2026-10-19T10:00:00.000Z",
      }),
      item({
        comparisonId: "c3",
        projectName: "c-ui",
        createdAt: "2026-10-21T10:00:00.000Z",
      }),
    ]);

    expect(sections[0].items.map((project) => project.projectName)).toEqual([
      "a-ui",
      "b-ui",
      "c-ui",
    ]);
  });

  it("names an unnamed team instead of rendering an empty header", () => {
    const sections = groupReviewInbox([
      item({ comparisonId: "c1", teamName: "" }),
    ]);

    expect(sections[0].name).toBe("Unknown team");
  });

  it("answers no sections for no items", () => {
    expect(groupReviewInbox([])).toEqual([]);
  });
});

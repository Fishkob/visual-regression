import { describe, expect, it } from "vitest";
import type { PendingReviewDto } from "@sdk";
import { mapReviewInbox, mapReviewInboxItem } from "../review-inbox.mapper";

const dto = (overrides: Partial<PendingReviewDto> = {}): PendingReviewDto => ({
  comparisonId: "c1",
  projectName: "Checkout",
  teamId: "t1",
  teamName: "Storefront",
  isShared: true,
  testName: "cart",
  kind: "image",
  branchName: "main",
  runKey: "ci-42",
  isDefaultBranch: true,
  variant: {
    viewport: "1280x720",
    browser: "chromium",
    environment: "staging",
  },
  mismatchPixelCount: 42,
  mismatchPageCount: 2,
  createdAt: "2026-10-20T10:00:00.000Z",
  projectPendingCount: 3,
  projectBranchCount: 1,
  ...overrides,
});

describe("mapReviewInboxItem", () => {
  it("maps all fields and the variant", () => {
    expect(mapReviewInboxItem(dto())).toEqual({
      comparisonId: "c1",
      projectName: "Checkout",
      teamId: "t1",
      teamName: "Storefront",
      isShared: true,
      testName: "cart",
      kind: "image",
      branchName: "main",
      runKey: "ci-42",
      isDefaultBranch: true,
      viewport: "1280x720",
      browser: "chromium",
      environment: "staging",
      mismatchPixelCount: 42,
      mismatchPageCount: 2,
      createdAt: "2026-10-20T10:00:00.000Z",
      projectPendingCount: 3,
      projectBranchCount: 1,
    });
  });

  it("maps the branch of a pending review", () => {
    const item = mapReviewInboxItem(
      dto({ branchName: "feature/x", isDefaultBranch: false }),
    );

    expect(item.branchName).toBe("feature/x");
    expect(item.isDefaultBranch).toBe(false);
  });

  it("maps an unknown kind to undefined", () => {
    expect(mapReviewInboxItem(dto({ kind: "video" })).kind).toBeUndefined();
  });

  // The owner and the flag decide which block the row lands in, so a wire that
  // leaves them out must not render "undefined" as a section header.
  it("defaults the owner and the page count", () => {
    const item = mapReviewInboxItem(
      dto({
        teamId: undefined,
        teamName: undefined,
        isShared: undefined,
        mismatchPageCount: undefined,
      }),
    );
    expect(item.teamId).toBe("");
    expect(item.teamName).toBe("");
    expect(item.isShared).toBe(false);
    expect(item.mismatchPageCount).toBeNull();
  });

  it("maps the run key of a grouped upload", () => {
    expect(mapReviewInboxItem(dto({ runKey: "ci-7" })).runKey).toBe("ci-7");
  });

  it("defaults a missing run key to null", () => {
    expect(mapReviewInboxItem(dto({ runKey: undefined })).runKey).toBeNull();
    expect(mapReviewInboxItem(dto({ runKey: null })).runKey).toBeNull();
  });
});

describe("mapReviewInbox", () => {
  it("maps an undefined list to an empty list", () => {
    expect(mapReviewInbox(undefined)).toEqual([]);
  });
});

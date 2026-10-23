import { describe, expect, it } from "vitest";
import type { PendingReviewDto } from "@sdk";
import { mapReviewInbox, mapReviewInboxItem } from "../review-inbox.mapper";

const dto = (overrides: Partial<PendingReviewDto> = {}): PendingReviewDto => ({
  comparisonId: "c1",
  projectName: "Checkout",
  groupId: "g1",
  groupName: "Shop",
  testName: "cart",
  kind: "image",
  variant: {
    viewport: "1280x720",
    browser: "chromium",
    environment: "staging",
  },
  mismatchPixelCount: 42,
  mismatchPageCount: 2,
  createdAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

describe("mapReviewInboxItem", () => {
  it("maps all fields and the variant", () => {
    expect(mapReviewInboxItem(dto())).toEqual({
      comparisonId: "c1",
      projectName: "Checkout",
      groupId: "g1",
      groupName: "Shop",
      testName: "cart",
      kind: "image",
      viewport: "1280x720",
      browser: "chromium",
      environment: "staging",
      mismatchPixelCount: 42,
      mismatchPageCount: 2,
      createdAt: "2026-10-20T10:00:00.000Z",
    });
  });

  it("maps an unknown kind to undefined", () => {
    expect(mapReviewInboxItem(dto({ kind: "video" })).kind).toBeUndefined();
  });

  it("defaults group fields and page count to null", () => {
    const item = mapReviewInboxItem(
      dto({
        groupId: undefined,
        groupName: undefined,
        mismatchPageCount: undefined,
      }),
    );
    expect(item.groupId).toBeNull();
    expect(item.groupName).toBeNull();
    expect(item.mismatchPageCount).toBeNull();
  });
});

describe("mapReviewInbox", () => {
  it("maps an undefined list to an empty list", () => {
    expect(mapReviewInbox(undefined)).toEqual([]);
  });
});

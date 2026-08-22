import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  REVIEW_LOOP_NAV_STATE,
  resetReviewSeen,
  markSeen,
  isSeen,
  isFromReviewLoopNavigation,
  beginPassForProject,
} from "@/lib/review-pass";

describe("review-pass", () => {
  const historyState = vi.fn();

  beforeEach(() => {
    resetReviewSeen();
    Object.defineProperty(window, "history", {
      get: () => ({ state: historyState() }),
      configurable: true,
    });
  });

  afterEach(() => {
    resetReviewSeen();
    vi.restoreAllMocks();
  });

  it("scopes skip-memory per project", () => {
    markSeen("project-a", "login-form__1920x1080__chrome__prod");
    expect(isSeen("project-a", "login-form__1920x1080__chrome__prod")).toBe(
      true,
    );
    expect(isSeen("project-b", "login-form__1920x1080__chrome__prod")).toBe(
      false,
    );
  });

  it("forgets skip-memory for one project on reset", () => {
    markSeen("project-a", "key");
    resetReviewSeen("project-a");
    expect(isSeen("project-a", "key")).toBe(false);
  });

  it("forgets all skip-memory on a full reset", () => {
    markSeen("project-a", "key-a");
    markSeen("project-b", "key-b");
    resetReviewSeen();
    expect(isSeen("project-a", "key-a")).toBe(false);
    expect(isSeen("project-b", "key-b")).toBe(false);
  });

  it("REVIEW_LOOP_NAV_STATE marks a review-loop navigation", () => {
    expect(REVIEW_LOOP_NAV_STATE).toEqual({ fromReviewLoop: true });
  });

  it("isFromReviewLoopNavigation reads the history state mark", () => {
    historyState.mockReturnValueOnce({ fromReviewLoop: true });
    expect(isFromReviewLoopNavigation()).toBe(true);

    historyState.mockReturnValueOnce(null);
    expect(isFromReviewLoopNavigation()).toBe(false);
  });

  it("beginPassForProject keeps skip-memory on a continued pass", () => {
    historyState.mockReturnValueOnce({ fromReviewLoop: true });
    markSeen("project-a", "key");
    beginPassForProject("project-a");
    expect(isSeen("project-a", "key")).toBe(true);
  });

  it("beginPassForProject resets skip-memory on a direct entry", () => {
    historyState.mockReturnValueOnce(null);
    markSeen("project-a", "key");
    beginPassForProject("project-a");
    expect(isSeen("project-a", "key")).toBe(false);
  });
});

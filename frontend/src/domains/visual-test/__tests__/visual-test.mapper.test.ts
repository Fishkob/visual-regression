import { describe, it, expect } from "vitest";
import type { VisualTestDetailsDto } from "@sdk";
import { mapVisualTestDetails } from "../visual-test.mapper";

const baseDto: VisualTestDetailsDto = {};

describe("mapVisualTestDetails", () => {
  it("returns null for undefined dto", () => {
    expect(mapVisualTestDetails(undefined)).toBeNull();
  });

  it("returns null for null dto", () => {
    expect(mapVisualTestDetails(null)).toBeNull();
  });

  it("round-trips a full details payload", () => {
    const dto: VisualTestDetailsDto = {
      name: "login-form",
      baseline: {
        id: "b1",
        imageUrl: "/baseline.png",
        pixelDiffThreshold: 0,
        variant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
      },
      comparison: {
        id: "cmp-1",
        diffImageUrl: "/diff.png",
        mismatchPixelCount: 4,
        status: "PENDING_APPROVAL",
        thresholdExceeded: true,
        baseline: {
          id: "b1",
          imageUrl: "/baseline.png",
          pixelDiffThreshold: 0,
          variant: {
            viewport: "1920x1080",
            browser: "chrome",
            environment: "prod",
          },
        },
        candidate: {
          id: "c1",
          imageUrl: "/candidate.png",
          variant: {
            viewport: "1920x1080",
            browser: "chrome",
            environment: "prod",
          },
        },
      },
    };

    expect(mapVisualTestDetails(dto)).toEqual({
      name: "login-form",
      baseline: {
        imageUrl: "/baseline.png",
        pixelDiffThreshold: 0,
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
      comparison: {
        id: "cmp-1",
        diffImageUrl: "/diff.png",
        mismatchPixelCount: 4,
        status: "PENDING_APPROVAL",
        thresholdExceeded: true,
        baseline: {
          imageUrl: "/baseline.png",
          pixelDiffThreshold: 0,
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        candidate: {
          imageUrl: "/candidate.png",
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
      },
    });
  });

  it("defaults empty image URLs so the model stays non-null", () => {
    const dto: VisualTestDetailsDto = {
      name: "login-form",
      baseline: {
        id: "b1",
        imageUrl: undefined,
        variant: undefined,
      },
    };

    const result = mapVisualTestDetails(dto);

    expect(result?.baseline?.imageUrl).toBe("");
  });

  it("maps null baseline and comparison to undefined", () => {
    const result = mapVisualTestDetails(baseDto);

    expect(result?.baseline).toBeUndefined();
    expect(result?.comparison).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import type { TestVariantsDto, VisualTestDetailsDto } from "@sdk";
import { mapTestVariants, mapVisualTestDetails } from "../visual-test.mapper";

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

  it("maps inherited origin metadata", () => {
    const result = mapVisualTestDetails({
      name: "login-form",
      origin: "inherited",
      inheritedFrom: "main",
    });

    expect(result?.origin).toBe("inherited");
    expect(result?.inheritedFrom).toBe("main");
  });
});

describe("mapTestVariants", () => {
  const dto: TestVariantsDto = {
    name: "login-form",
    kind: "image",
    variants: [
      {
        viewport: "1920x1080",
        browser: "chrome",
        environment: "staging",
        status: "UNCHANGED",
        baselineUrl: "/baseline.png",
        signedBaselineUrl: "/baseline.png",
        candidateUrl: null,
        signedCandidateUrl: null,
        mismatchPixelCount: null,
        baselineInherited: false,
      },
      {
        viewport: "375x667",
        browser: "webkit",
        environment: "staging",
        status: "PENDING_APPROVAL",
        baselineUrl: "/mobile-baseline.png",
        signedBaselineUrl: "/mobile-baseline.png",
        candidateUrl: "/mobile-candidate.png",
        signedCandidateUrl: "/mobile-candidate.png",
        mismatchPixelCount: 42,
        baselineInherited: true,
      },
    ],
  };

  it("returns null for a missing dto", () => {
    expect(mapTestVariants(undefined)).toBeNull();
    expect(mapTestVariants(null)).toBeNull();
  });

  it("maps the test identity and every variant", () => {
    const result = mapTestVariants(dto);

    expect(result?.name).toBe("login-form");
    expect(result?.kind).toBe("image");
    expect(result?.variants).toHaveLength(2);
    expect(result?.variants[1]).toEqual({
      viewport: "375x667",
      browser: "webkit",
      environment: "staging",
      status: "PENDING_APPROVAL",
      baselineUrl: "/mobile-baseline.png",
      candidateUrl: "/mobile-candidate.png",
      mismatchPixelCount: 42,
      baselineInherited: true,
    });
  });

  it("prefers the presigned url over the canonical one", () => {
    const result = mapTestVariants({
      ...dto,
      variants: [
        {
          ...dto.variants[1],
          signedBaselineUrl: "/signed-baseline.png",
          signedCandidateUrl: "/signed-candidate.png",
        },
      ],
    });

    expect(result?.variants[0].baselineUrl).toBe("/signed-baseline.png");
    expect(result?.variants[0].candidateUrl).toBe("/signed-candidate.png");
  });

  it("omits null URLs and counts instead of mapping them to undefined keys", () => {
    const result = mapTestVariants(dto);

    expect(result?.variants[0]).toEqual({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: "/baseline.png",
      baselineInherited: false,
    });
  });
});

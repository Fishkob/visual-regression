import { ONE_PIXEL_PNG_DATA_URL } from "./projects.mocks";

export const PROJECT_TEST_DETAILS_ONLY_BASELINE_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    name: "checkout-flow",
    baseline: {
      id: "b1",
      imageUrl: ONE_PIXEL_PNG_DATA_URL,
      imageHash: "hash",
      createdAt: "2025-11-25T18:28:51.145Z",
      pixelDiffThreshold: 0,
      type: "BASELINE",
      variant: {
        viewport: "1366x768",
        browser: "Safari",
        environment: "staging",
      },
    },
    comparison: null,
  }),
};

type FulfillResponse = {
  status: number;
  contentType: string;
  body: string;
};

function jsonResponse(data: unknown, status = 200): FulfillResponse {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

export const VISUAL_TEST_DETAILS_PENDING = jsonResponse({
  name: "checkout-flow",
  baseline: {
    id: "baseline-1",
    imageUrl: "http://localhost:9000/vrt/baseline.png",
    imageHash: "hash-baseline",
    createdAt: "2026-01-23T14:48:36.276Z",
    pixelDiffThreshold: 0,
    type: "BASELINE",
    variant: {
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
    },
  },
  comparison: {
    id: "cmp-1",
    diffImageUrl: "http://localhost:9000/vrt/diff.png",
    mismatchPixelCount: 157,
    status: "PENDING_APPROVAL",
    thresholdExceeded: true,
    candidate: {
      id: "candidate-1",
      imageUrl: "http://localhost:9000/vrt/current.png",
      imageHash: "hash-current",
      createdAt: "2026-01-23T14:48:36.352Z",
      type: "CURRENT",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
    },
    baseline: {
      id: "baseline-1",
      imageUrl: "http://localhost:9000/vrt/baseline.png",
      imageHash: "hash-baseline",
      createdAt: "2026-01-23T14:48:36.276Z",
      pixelDiffThreshold: 0,
      type: "BASELINE",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
    },
    createdAt: "2026-01-23T14:48:36.352Z",
  },
});

export const VISUAL_TEST_PENDING_META = jsonResponse({
  data: [
    {
      name: "login-form",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
      latestStatus: "PENDING_APPROVAL",
    },
    {
      name: "checkout-flow",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
      latestStatus: "PENDING_APPROVAL",
    },
  ],
  meta: { total: 2 },
});

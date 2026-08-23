import { ONE_PIXEL_PNG_DATA_URL } from "./projects.mocks";

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

const VARIANT = {
  viewport: "1920x1080",
  browser: "Chrome",
  environment: "staging",
};

export function makeReviewableDetails(name: string): FulfillResponse {
  return jsonResponse({
    name,
    baseline: {
      id: "baseline-1",
      imageUrl: ONE_PIXEL_PNG_DATA_URL,
      imageHash: "hash-baseline",
      createdAt: "2026-01-23T14:48:36.276Z",
      pixelDiffThreshold: 0,
      type: "BASELINE",
      variant: VARIANT,
    },
    comparison: {
      id: `cmp-${name}`,
      diffImageUrl: ONE_PIXEL_PNG_DATA_URL,
      mismatchPixelCount: 157,
      status: "PENDING_APPROVAL",
      thresholdExceeded: true,
      candidate: {
        id: `candidate-${name}`,
        imageUrl: ONE_PIXEL_PNG_DATA_URL,
        imageHash: "hash-current",
        createdAt: "2026-01-23T14:48:36.352Z",
        type: "CURRENT",
        variant: VARIANT,
      },
      baseline: {
        id: "baseline-1",
        imageUrl: ONE_PIXEL_PNG_DATA_URL,
        imageHash: "hash-baseline",
        createdAt: "2026-01-23T14:48:36.276Z",
        pixelDiffThreshold: 0,
        type: "BASELINE",
        variant: VARIANT,
      },
      createdAt: "2026-01-23T14:48:36.352Z",
    },
  });
}

export function makeImageKind(): FulfillResponse {
  return jsonResponse({ kind: "image" });
}

export function makePendingItem(name: string) {
  return {
    name,
    variant: VARIANT,
    latestStatus: "PENDING_APPROVAL",
  };
}

export function makeApproveResult(): FulfillResponse {
  return jsonResponse(
    {
      approved: true,
      newBaselineUrl: "http://localhost:9000/vrt/new-baseline.png",
    },
    201,
  );
}

export function makeConflictError(): FulfillResponse {
  return jsonResponse(
    {
      statusCode: 409,
      code: "APPROVAL_CONFLICT",
      message: "Comparison was superseded",
    },
    409,
  );
}

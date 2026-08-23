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

export function makePdfKind(): FulfillResponse {
  return jsonResponse({ kind: "pdf" });
}

// A pending PDF comparison's details payload: baseline + comparison with a
// diff PDF and a candidate, mirroring the DTO the pdf-details endpoint returns.
export function makePdfReviewableDetails(name: string): FulfillResponse {
  return jsonResponse({
    id: `pdf-${name}`,
    name,
    status: "PENDING",
    kind: "pdf",
    createdAt: "2026-01-23T14:48:36.276Z",
    baseline: {
      id: `pdf-baseline-${name}`,
      pdfUrl: `http://localhost:9000/vrt/${name}-baseline.pdf`,
      imageHash: "hash-baseline",
      pageCount: 3,
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
    },
    comparison: {
      id: `cmp-${name}`,
      baselineId: `pdf-baseline-${name}`,
      diffPdfUrl: `http://localhost:9000/vrt/${name}-diff.pdf`,
      pageCount: 3,
      mismatchPageCount: 1,
      status: "PENDING_APPROVAL",
      createdAt: "2026-01-23T14:48:36.352Z",
      candidate: {
        id: `pdf-candidate-${name}`,
        pdfUrl: `http://localhost:9000/vrt/${name}-candidate.pdf`,
        imageHash: "hash-current",
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
    },
  });
}

export function makePendingItem(name: string) {
  return {
    name,
    variant: VARIANT,
    latestStatus: "PENDING_APPROVAL",
  };
}

export function makeConflictError(): FulfillResponse {
  return jsonResponse(
    {
      statusCode: 409,
      message:
        "The comparison you reviewed is no longer pending — it may have been superseded by a newer upload. Refresh to review the latest.",
      timestamp: "2026-01-23T14:48:36.352Z",
      path: "/api/v1/projects/checkout-ui/tests/login-form/approval",
      traceId: "ct-trace",
    },
    409,
  );
}

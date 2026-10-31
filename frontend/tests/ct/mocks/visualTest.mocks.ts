import { ONE_PIXEL_PNG_DATA_URL } from "./projects.mocks";
import { DEMO_BASELINE, DEMO_CANDIDATE } from "./demoImages.mocks";

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

function pendingDetailsBody(
  changedRegions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    pixelCount: number;
  }>,
) {
  return {
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
      ...(changedRegions ? { changedRegions } : {}),
    },
  };
}

export const VISUAL_TEST_DETAILS_PENDING = jsonResponse(pendingDetailsBody());

// A comparison that knows where its changes are: the review page opens on the
// marked diff and lists the areas beside it.
export const VISUAL_TEST_DETAILS_WITH_REGIONS = jsonResponse(
  pendingDetailsBody([
    { x: 40, y: 60, width: 320, height: 120, pixelCount: 157 },
    { x: 40, y: 400, width: 160, height: 80, pixelCount: 64 },
  ]),
);

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

const galleryDesktop = {
  viewport: "1920x1080",
  browser: "Chrome",
  environment: "staging",
  status: "PENDING_APPROVAL",
  baselineUrl: "http://localhost:9000/vrt/baseline.png",
  candidateUrl: "http://localhost:9000/vrt/current.png",
  mismatchPixelCount: 157,
  baselineInherited: false,
};

// The same UI in two configurations: the gallery renders both tiles and the CT
// suite switches the shown variant between them.
export const VISUAL_TEST_VARIANTS = jsonResponse({
  name: "checkout-flow",
  kind: "image",
  variants: [
    galleryDesktop,
    {
      viewport: "768x1024",
      browser: "Chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: "http://localhost:9000/vrt/baseline-tablet.png",
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
    {
      viewport: "375x667",
      browser: "Chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: "http://localhost:9000/vrt/baseline-mobile.png",
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
  ],
});

// The overview's actual job: one resolution captured in three browsers, plus a
// second resolution with a single browser (a section without anything to
// compare). Distinct image URLs make the layered stages assertable — the CT spec
// can tell which browser is the ground and which one is the layer.
export const VISUAL_TEST_VARIANTS_BROWSERS = jsonResponse({
  name: "checkout-flow",
  kind: "image",
  variants: [
    {
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: "http://localhost:9000/vrt/baseline-chrome.png",
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
    {
      viewport: "1920x1080",
      browser: "Firefox",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: "http://localhost:9000/vrt/baseline-firefox.png",
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
    {
      viewport: "1920x1080",
      browser: "Safari",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: "http://localhost:9000/vrt/baseline-safari.png",
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
    {
      viewport: "1366x768",
      browser: "Chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: "http://localhost:9000/vrt/baseline-laptop.png",
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
  ],
});

// The single-variant read the comparison page needs for its bulk-approve
// state; the variant tiles themselves live on the overview page.
export const VISUAL_TEST_VARIANTS_SINGLE = jsonResponse({
  name: "checkout-flow",
  kind: "image",
  variants: [galleryDesktop],
});

// The strip under the comparison needs thumbnails that actually render, so this
// set uses the demo screenshot instead of an unreachable storage URL.
export const VISUAL_TEST_VARIANTS_DEMO = jsonResponse({
  name: "checkout-flow",
  kind: "image",
  variants: [
    {
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
      status: "PENDING_APPROVAL",
      baselineUrl: DEMO_BASELINE,
      candidateUrl: DEMO_CANDIDATE,
      mismatchPixelCount: 157,
      baselineInherited: false,
    },
    {
      viewport: "1366x768",
      browser: "Chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: DEMO_CANDIDATE,
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
    {
      viewport: "375x667",
      browser: "Chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: DEMO_BASELINE,
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
  ],
});

// The overview as a screenshot target: one resolution captured in three
// browsers (with the demo screenshots, so the panes actually render) plus a
// second resolution captured in a single browser. The Firefox baseline is the
// changed demo image, which is the difference a reader is meant to spot.
export const VISUAL_TEST_VARIANTS_BROWSERS_DEMO = jsonResponse({
  name: "checkout-flow",
  kind: "image",
  variants: [
    {
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: DEMO_BASELINE,
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
    {
      viewport: "1920x1080",
      browser: "Firefox",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: DEMO_CANDIDATE,
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
    {
      viewport: "1920x1080",
      browser: "Safari",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: DEMO_CANDIDATE,
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
    {
      viewport: "1366x768",
      browser: "Chrome",
      environment: "staging",
      status: "UNCHANGED",
      baselineUrl: DEMO_BASELINE,
      candidateUrl: null,
      mismatchPixelCount: null,
      baselineInherited: false,
    },
  ],
});

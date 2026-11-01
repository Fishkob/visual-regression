import type { BaselineRevisionSource } from "@/domains/baseline-history/baseline-history.mapper";

import { ONE_PIXEL_PNG_DATA_URL } from "./projects.mocks";

function jsonResponse(data: unknown, status = 200) {
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

// Two replaced baselines of the variant makeReviewableDetails() describes: the
// older row is the baseline currently in place (`hash-baseline`), so its restore
// is disabled and it carries the "current" badge — the state a restore leaves
// behind.
export const VISUAL_BASELINE_HISTORY = jsonResponse([
  {
    id: "rev-1",
    ...VARIANT,
    imageUrl: ONE_PIXEL_PNG_DATA_URL,
    signedImageUrl: ONE_PIXEL_PNG_DATA_URL,
    imageHash: "hash-replaced",
    pageCount: null,
    pixelDiffThreshold: 0,
    reason: "approval",
    createdBy: "jane.doe",
    createdAt: "2026-10-20T09:00:00.000Z",
  },
  {
    id: "rev-2",
    ...VARIANT,
    imageUrl: ONE_PIXEL_PNG_DATA_URL,
    signedImageUrl: ONE_PIXEL_PNG_DATA_URL,
    imageHash: "hash-baseline",
    pageCount: null,
    pixelDiffThreshold: 4,
    reason: "restore",
    createdBy: null,
    createdAt: "2026-10-19T09:00:00.000Z",
  },
] satisfies BaselineRevisionSource[]);

// A PDF baseline revision carries a page count and has no thumbnail to render.
export const PDF_BASELINE_HISTORY = jsonResponse([
  {
    id: "rev-pdf-1",
    ...VARIANT,
    imageUrl: "http://localhost:9000/vrt/invoice-old.pdf",
    signedImageUrl: "http://localhost:9000/vrt/invoice-old.pdf?signature=abc",
    imageHash: "hash-replaced",
    pageCount: 3,
    pixelDiffThreshold: 0,
    reason: "approval",
    createdBy: "jane.doe",
    createdAt: "2026-10-20T09:00:00.000Z",
  },
  {
    id: "rev-pdf-2",
    ...VARIANT,
    imageUrl: "http://localhost:9000/vrt/invoice-older.pdf",
    signedImageUrl: "http://localhost:9000/vrt/invoice-older.pdf?signature=abc",
    imageHash: "hash-baseline",
    pageCount: null,
    pixelDiffThreshold: 4,
    reason: "import",
    createdBy: null,
    createdAt: "2026-10-19T09:00:00.000Z",
  },
] satisfies BaselineRevisionSource[]);

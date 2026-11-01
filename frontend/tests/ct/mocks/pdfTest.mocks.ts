import type { PdfControllerGetPdfTestDetailsResponses } from "@sdk/models/PdfControllerGetPdfTestDetailsResponses.gen";

function jsonResponse(data: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

export const PDF_TEST_DETAILS_EMPTY = jsonResponse({
  id: "pdf-1",
  name: "invoice",
  status: "PENDING",
  kind: "pdf",
  createdAt: "2026-01-23T14:48:36.276Z",
  origin: "branch",
  inheritedFrom: null,
  baselineInherited: false,
  inheritTarget: null,
  baseline: null,
  comparison: null,
} satisfies PdfControllerGetPdfTestDetailsResponses[200]);

export const PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT = jsonResponse({
  id: "pdf-1",
  name: "invoice",
  status: "PENDING",
  kind: "pdf",
  createdAt: "2026-01-23T14:48:36.276Z",
  origin: "branch",
  inheritedFrom: null,
  baselineInherited: false,
  inheritTarget: null,
  baseline: {
    id: "b1",
    pdfUrl: "http://localhost:9000/vrt/invoice.pdf",
    imageHash: "hash-baseline",
    pageCount: null,
    viewport: "1920x1080",
    browser: "Chrome",
    environment: "staging",
  },
  comparison: null,
} satisfies PdfControllerGetPdfTestDetailsResponses[200]);

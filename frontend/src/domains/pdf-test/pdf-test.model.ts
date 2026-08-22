import type { TestStatusValue, VisualTestStatus } from "@/domains/test-status";

export interface PdfScreenshot {
  pdfUrl: string;
  imageHash: string;
  pageCount?: number;
  viewport?: string;
  browser?: string;
  environment?: string;
}

export interface PdfComparison {
  id: string;
  diffPdfUrl: string;
  pageCount: number;
  mismatchPageCount: number;
  status: VisualTestStatus;
  createdAt: string;
  candidate?: PdfScreenshot;
}

export interface PdfTestDetails {
  id: string;
  name: string;
  status: TestStatusValue;
  createdAt: string;
  baseline?: PdfScreenshot;
  comparison?: PdfComparison;
}

// A PDF test as shown in a project's directory. Derived from the project
// payload's per-variant rows: status is the test-level aggregate, and the
// variant fields carry the row used for navigation into the test-detail page.
export interface PdfProjectTest {
  name: string;
  status: TestStatusValue;
  viewport?: string;
  browser?: string;
  environment?: string;
}

export interface PdfRenderResult {
  imageUrl: string;
  pageCount: number;
}

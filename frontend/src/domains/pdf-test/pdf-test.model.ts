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

export interface PdfRenderResult {
  imageUrl: string;
  pageCount: number;
}

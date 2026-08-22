import { describe, it, expect } from "vitest";
import type { PdfTestDetailsDto } from "@sdk";
import { mapPdfTestDetails } from "../pdf-test.mapper";

const baseDto: PdfTestDetailsDto = {
  id: "pdf-1",
  name: "login-pdf",
  status: "PENDING_APPROVAL",
  kind: "pdf",
  createdAt: "2024-01-01T00:00:00Z",
  baseline: null,
  comparison: null,
};

describe("mapPdfTestDetails", () => {
  it("returns null for undefined dto", () => {
    expect(mapPdfTestDetails(undefined)).toBeNull();
  });

  it("returns null for null dto", () => {
    expect(mapPdfTestDetails(null)).toBeNull();
  });

  it("round-trips non-null page counts and mismatch counts", () => {
    const dto: PdfTestDetailsDto = {
      ...baseDto,
      baseline: {
        id: "b1",
        pdfUrl: "/baseline.pdf",
        imageHash: "abc",
        pageCount: 7,
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
      comparison: {
        id: "cmp-1",
        baselineId: "b1",
        diffPdfUrl: "/diff.pdf",
        pageCount: 7,
        mismatchPageCount: 2,
        status: "PENDING_APPROVAL",
        createdAt: "2024-01-01T00:00:00Z",
        candidate: {
          id: "c1",
          pdfUrl: "/candidate.pdf",
          imageHash: "def",
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
      },
    };

    expect(mapPdfTestDetails(dto)).toEqual({
      id: "pdf-1",
      name: "login-pdf",
      status: "PENDING_APPROVAL",
      createdAt: "2024-01-01T00:00:00Z",
      baseline: {
        pdfUrl: "/baseline.pdf",
        imageHash: "abc",
        pageCount: 7,
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
      comparison: {
        id: "cmp-1",
        diffPdfUrl: "/diff.pdf",
        pageCount: 7,
        mismatchPageCount: 2,
        status: "PENDING_APPROVAL",
        createdAt: "2024-01-01T00:00:00Z",
        candidate: {
          pdfUrl: "/candidate.pdf",
          imageHash: "def",
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
      },
    });
  });

  it("normalizes a null baseline pageCount to 0 so the model stays non-null", () => {
    const dto: PdfTestDetailsDto = {
      ...baseDto,
      status: "PENDING",
      baseline: {
        id: "b1",
        pdfUrl: "/baseline.pdf",
        imageHash: "abc",
        pageCount: null,
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
    };

    const result = mapPdfTestDetails(dto);

    expect(result?.baseline?.pageCount).toBe(0);
  });

  it("normalizes null comparison fields so PdfComparisonView stays type-safe", () => {
    const dto: PdfTestDetailsDto = {
      ...baseDto,
      comparison: {
        id: "cmp-1",
        baselineId: "b1",
        diffPdfUrl: null,
        pageCount: null,
        mismatchPageCount: null,
        status: "PENDING_APPROVAL",
        createdAt: "2024-01-01T00:00:00Z",
        candidate: null,
      },
    };

    const result = mapPdfTestDetails(dto);

    expect(result?.comparison?.pageCount).toBe(0);
    expect(result?.comparison?.mismatchPageCount).toBe(0);
    expect(result?.comparison?.diffPdfUrl).toBe("");
    expect(result?.comparison?.candidate).toBeUndefined();
  });

  it("maps null baseline and comparison to undefined", () => {
    const result = mapPdfTestDetails(baseDto);

    expect(result?.baseline).toBeUndefined();
    expect(result?.comparison).toBeUndefined();
  });
});

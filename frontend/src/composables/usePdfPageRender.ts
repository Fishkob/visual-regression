import { keepPreviousData } from "@tanstack/vue-query";
import { pdfControllerRenderPdfPage } from "@sdk";
import type { PdfRenderResult } from "@/domains/pdf-test/pdf-test.model";
import { pdfTestQueryKeys } from "@/domains/pdf-test/query-keys";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";

// The render URL identifies the source PDF (already branch-specific), so the
// branch is a query argument rather than a key part — but it still scopes the
// request server-side.
export function usePdfPageRenderQuery(
  projectName: MaybeRef<string>,
  testName: MaybeRef<string>,
  pdfUrl: MaybeRef<string | undefined>,
  page: MaybeRef<number>,
  branchName: MaybeRef<string | undefined> = undefined,
) {
  return useSdkQuery({
    args: { projectName, testName, pdfUrl, page, branchName },
    required: ["projectName", "testName", "pdfUrl"],
    keyOf: ({ projectName, testName, pdfUrl, page }) =>
      pdfTestQueryKeys.renderPage(projectName, testName, pdfUrl, page),
    sdkFn: ({ projectName, testName, pdfUrl, page, branchName }) =>
      pdfControllerRenderPdfPage({
        path: { projectName, testName },
        query: { pdfUrl, page, ...(branchName ? { branch: branchName } : {}) },
      }),
    map: (data: PdfRenderResult | undefined) => data ?? null,
    placeholderData: keepPreviousData,
  });
}

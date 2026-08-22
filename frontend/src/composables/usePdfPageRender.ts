import { keepPreviousData } from "@tanstack/vue-query";
import { pdfControllerRenderPdfPage } from "@sdk";
import type { PdfRenderResult } from "@/domains/pdf-test/pdf-test.model";
import { pdfTestQueryKeys } from "@/domains/pdf-test/query-keys";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";

export function usePdfPageRenderQuery(
  projectName: MaybeRef<string>,
  testName: MaybeRef<string>,
  pdfUrl: MaybeRef<string | undefined>,
  page: MaybeRef<number>,
) {
  return useSdkQuery<
    {
      projectName: string;
      testName: string;
      pdfUrl: string | undefined;
      page: number;
    },
    PdfRenderResult,
    PdfRenderResult | null
  >({
    args: { projectName, testName, pdfUrl, page },
    keyOf: ({ projectName, testName, pdfUrl, page }) =>
      pdfUrl && projectName && testName
        ? pdfTestQueryKeys.renderPage(projectName, testName, pdfUrl, page)
        : [],
    sdkFn: ({ projectName, testName, pdfUrl, page }) =>
      pdfControllerRenderPdfPage({
        path: { projectName, testName },
        query: { pdfUrl: pdfUrl!, page },
      }),
    map: (data) => data ?? null,
    placeholderData: keepPreviousData,
  });
}

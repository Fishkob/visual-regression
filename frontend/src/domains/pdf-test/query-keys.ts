import { variantKeyParts, type VariantParams } from "@/lib/variant-key";

export const pdfTestQueryKeys = {
  all: () => ["pdf-tests"] as const,
  details: (projectName: string, testName: string, filters?: VariantParams) =>
    [
      ...pdfTestQueryKeys.all(),
      "details",
      projectName,
      testName,
      ...variantKeyParts(filters),
    ] as const,
  renderPage: (
    projectName: string,
    testName: string,
    pdfUrl: string,
    page: number,
  ) =>
    [
      ...pdfTestQueryKeys.all(),
      "render",
      projectName,
      testName,
      pdfUrl,
      page,
    ] as const,
};

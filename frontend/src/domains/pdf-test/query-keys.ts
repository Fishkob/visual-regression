import { variantKeyParts, type VariantParams } from "@/lib/variant-key";

export const pdfTestQueryKeys = {
  all: () => ["pdf-tests"] as const,
  details: (
    args: {
      projectName: string;
      testName: string;
      branch?: string;
    } & VariantParams,
  ) =>
    [
      ...pdfTestQueryKeys.all(),
      "details",
      args.projectName,
      args.branch ?? "",
      args.testName,
      ...variantKeyParts(args),
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

import { variantKeyParts, type VariantParams } from "@/lib/variant-key";

export const visualTestQueryKeys = {
  all: () => ["visual-tests"] as const,
  variantsAll: () => [...visualTestQueryKeys.all(), "variants"] as const,
  // The gallery is variant-agnostic by design: switching the shown variant must
  // not refetch the list that renders every variant.
  variants: (args: {
    projectName: string;
    testName: string;
    branch?: string;
  }) =>
    [
      ...visualTestQueryKeys.variantsAll(),
      args.projectName,
      args.branch ?? "",
      args.testName,
    ] as const,
  details: (
    args: {
      projectName: string;
      testName: string;
      branch?: string;
    } & VariantParams,
  ) =>
    [
      ...visualTestQueryKeys.all(),
      "details",
      args.projectName,
      args.branch ?? "",
      args.testName,
      ...variantKeyParts(args),
    ] as const,
} as const;

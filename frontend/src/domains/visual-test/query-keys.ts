import { variantKeyParts, type VariantParams } from "@/lib/variant-key";

export const visualTestQueryKeys = {
  all: () => ["visual-tests"] as const,
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

import { variantKeyParts, type VariantParams } from "@/lib/variant-key";

export const baselineHistoryQueryKeys = {
  all: () => ["baseline-history"] as const,
  // The read is branch- and variant-scoped: another branch (or another variant
  // of the same test) has its own history, and all() stays a prefix that
  // invalidates every history entry after a restore.
  forVariant: (
    args: {
      projectName: string;
      testName: string;
      branch?: string;
    } & VariantParams,
  ) =>
    [
      ...baselineHistoryQueryKeys.all(),
      args.projectName,
      args.branch ?? "",
      args.testName,
      ...variantKeyParts(args),
    ] as const,
} as const;

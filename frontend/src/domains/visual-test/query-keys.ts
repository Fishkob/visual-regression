import type { KeyParams } from "@/lib/variant-key";
import { variantKeyParts } from "@/lib/variant-key";

export const visualTestQueryKeys = {
  all: () => ["visual-tests"] as const,
  details: (args: { projectName: string; testName: string } & KeyParams) =>
    [
      ...visualTestQueryKeys.all(),
      "details",
      args.projectName,
      args.testName,
      ...variantKeyParts(args),
    ] as const,
} as const;

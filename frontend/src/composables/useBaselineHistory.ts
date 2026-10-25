import { baselineHistoryControllerList } from "@sdk";
import { mapBaselineHistory } from "@/domains/baseline-history/baseline-history.mapper";
import { baselineHistoryQueryKeys } from "@/domains/baseline-history/query-keys";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import type { VariantParams } from "@/lib/variant-key";

// The replaced baselines of one variant, newest first and bounded by the
// server's BASELINE_HISTORY_LIMIT. Read-only: restoring is its own command.
// Enabled only once the project and test names are known — the history is
// test-scoped, so an unresolved test would read another test's cache entry.
export function useBaselineHistory(args: {
  projectName: MaybeRef<string | undefined>;
  testName: MaybeRef<string | undefined>;
  branchName?: MaybeRef<string | undefined>;
  variant: MaybeRef<VariantParams>;
}) {
  return useSdkQuery({
    args: {
      projectName: args.projectName,
      testName: args.testName,
      branchName: args.branchName,
      variant: args.variant,
    },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, branchName, variant }) =>
      baselineHistoryQueryKeys.forVariant({
        projectName,
        testName,
        branch: branchName,
        ...variant,
      }),
    sdkFn: ({ projectName, testName, branchName, variant }) =>
      baselineHistoryControllerList({
        path: { projectName, testName },
        query: {
          ...variant,
          ...(branchName ? { branch: branchName } : {}),
        },
      }),
    map: mapBaselineHistory,
  });
}

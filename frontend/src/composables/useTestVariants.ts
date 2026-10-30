import { testsQueriesControllerGetVariants } from "@sdk";
import { mapTestVariants } from "@/domains/visual-test/visual-test.mapper";
import { visualTestQueryKeys } from "@/domains/visual-test/query-keys";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";

// Every variant of one image test: the overview builds its viewport groups from
// it, the comparison page counts the pending ones for the bulk approve. Not
// keyed by the shown variant — the read is the whole test.
export function useTestVariantsQuery(
  projectName: MaybeRef<string | undefined>,
  testName: MaybeRef<string | undefined>,
  branchName?: MaybeRef<string | undefined>,
  enabled?: MaybeRef<boolean>,
) {
  return useSdkQuery({
    args: { projectName, testName, branchName },
    required: ["projectName", "testName"],
    enabled,
    keyOf: ({ projectName, testName, branchName }) =>
      visualTestQueryKeys.variants({
        projectName,
        testName,
        branch: branchName,
      }),
    sdkFn: ({ projectName, testName, branchName }) =>
      testsQueriesControllerGetVariants({
        path: { projectName, testName },
        ...(branchName ? { query: { branch: branchName } } : {}),
      }),
    map: mapTestVariants,
  });
}

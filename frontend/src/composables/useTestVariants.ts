import { testsQueriesControllerGetVariants } from "@sdk";
import { mapTestVariants } from "@/domains/visual-test/visual-test.mapper";
import { visualTestQueryKeys } from "@/domains/visual-test/query-keys";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";

// The variant gallery read: every variant of one image test. Deliberately not
// keyed by the shown variant — switching variants is a pure view change.
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

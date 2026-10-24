import { computed } from "vue";
import { testsQueriesControllerGetKind } from "@sdk";
import { testKindQueryKeys } from "@/domains/test-kind/query-keys";
import { isTestKind, type TestKind } from "@/domains/test-kind";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";

// The test-kind fetch crosses the domain seam: the SDK types `kind` as a plain
// string, so this composable narrows it to the domain TestKind before any caller
// sees it. Callers branch on the domain type; the guard the domain owns is not
// re-applied downstream.
export function useTestKind(
  projectName: MaybeRef<string | undefined>,
  testName: MaybeRef<string | undefined>,
  branchName: MaybeRef<string | undefined> = undefined,
) {
  const { data, isLoading, error, refetch } = useSdkQuery({
    args: { projectName, testName, branchName },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, branchName }) =>
      testKindQueryKeys.kind(projectName, testName, branchName),
    sdkFn: ({ projectName, testName, branchName }) =>
      testsQueriesControllerGetKind({
        path: { projectName, testName },
        ...(branchName ? { query: { branch: branchName } } : {}),
      }),
    map: (data: { kind: string } | undefined) => {
      const kind = data?.kind ?? null;
      return { kind: isTestKind(kind) ? kind : null };
    },
    retry: 2,
  });

  const kind = computed<TestKind | null>(() => data.value?.kind ?? null);

  return { kind, isLoading, error, refetch };
}

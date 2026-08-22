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
) {
  const { data, isLoading, error, refetch } = useSdkQuery<
    { projectName: string | undefined; testName: string | undefined },
    { kind: string },
    { kind: TestKind | null }
  >({
    args: { projectName, testName },
    keyOf: ({ projectName, testName }) =>
      projectName && testName
        ? testKindQueryKeys.kind(projectName, testName)
        : [],
    sdkFn: ({ projectName, testName }) =>
      testsQueriesControllerGetKind({
        path: { projectName: projectName!, testName: testName! },
      }),
    map: (data) => {
      const kind = data?.kind ?? null;
      return { kind: isTestKind(kind) ? kind : null };
    },
    retry: 2,
  });

  const kind = computed<TestKind | null>(() => data.value?.kind ?? null);

  return { kind, isLoading, error, refetch };
}

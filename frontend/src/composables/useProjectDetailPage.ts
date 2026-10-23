import { computed, reactive } from "vue";
import { countPending } from "@/domains/test-status";
import type { VisualTestItem } from "@/domains/projects/project.model";
import { useProjectDetailQuery } from "@/composables/useProjects";
import type { MaybeRef } from "@/composables/useDomainQuery";

export function useProjectDetailPage(
  projectName: MaybeRef<string | undefined>,
) {
  const projectQuery = useProjectDetailQuery(projectName);
  const project = projectQuery.data;
  const tests = computed<VisualTestItem[]>(
    () => project.value?.visualTests ?? [],
  );
  const pendingCount = computed(() =>
    countPending(tests.value, (t) => t.latestStatus),
  );
  const testCount = computed(
    () => new Set(tests.value.map((t) => t.name ?? "")).size,
  );

  return {
    project,
    tests,
    pendingCount,
    testCount,
    activeTabState: reactive({
      isLoading: projectQuery.isLoading,
      error: projectQuery.error,
      refetch: projectQuery.refetch,
    }),
  };
}

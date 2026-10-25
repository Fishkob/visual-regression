import { computed, reactive, unref } from "vue";
import type { VisualTestItem } from "@/domains/projects/project.model";
import type { ProjectDetailQuery } from "@/domains/projects/query-keys";
import { useProjectDetailQuery } from "@/composables/useProjects";
import type { MaybeRef } from "@/composables/useDomainQuery";

export type ProjectDetailFilters = Omit<ProjectDetailQuery, "page">;

export function useProjectDetailPage(
  projectName: MaybeRef<string | undefined>,
  branchName?: MaybeRef<string | undefined>,
  filters?: MaybeRef<ProjectDetailFilters>,
  page: MaybeRef<number> = 1,
) {
  const queryRef = computed<ProjectDetailQuery>(() => ({
    page: Math.max(1, Math.floor(Number(unref(page)) || 1)),
    ...withoutEmptyFilters(unref(filters) ?? {}),
  }));

  const projectQuery = useProjectDetailQuery(projectName, branchName, queryRef);
  const project = projectQuery.data;
  const tests = computed<VisualTestItem[]>(
    () => project.value?.visualTests ?? [],
  );
  // The header counts describe the whole branch; the server computes them from
  // the unfiltered effective set, so pagination and filters cannot shrink them.
  const pendingCount = computed(() => project.value?.pendingCount ?? 0);
  const testCount = computed(() => project.value?.testCount ?? 0);
  const meta = computed(() => project.value?.meta);
  const filterOptions = computed(() => project.value?.filterOptions);

  return {
    project,
    tests,
    pendingCount,
    testCount,
    meta,
    filterOptions,
    activeTabState: reactive({
      isLoading: projectQuery.isLoading,
      error: projectQuery.error,
      refetch: projectQuery.refetch,
    }),
  };
}

function withoutEmptyFilters(
  filters: ProjectDetailFilters,
): ProjectDetailFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  ) as ProjectDetailFilters;
}

import { computed, unref } from "vue";
import { keepPreviousData } from "@tanstack/vue-query";
import {
  projectsControllerGetProjectsWithPendingFlag,
  projectsControllerGetOneProject,
  type ProjectDto,
} from "@sdk";
import type { Project } from "@/domains/projects/project.model";
import { mapProjects, mapProject } from "@/domains/projects/project.mapper";
import {
  projectQueryKeys,
  type ProjectDetailQuery,
  type ProjectsListQuery,
} from "@/domains/projects/query-keys";
import { PROJECT_DETAIL_PAGE_SIZE, PROJECTS_PAGE_SIZE } from "@/lib/pagination";
import {
  usePagedListQuery,
  usePaginatedListQuery,
  useSdkQuery,
  type MaybeRef,
} from "@/composables/useDomainQuery";

// One server page of projects. The search and group filters are query
// arguments, not a post-filter: the list only holds the current page.
export function useProjectsWithPendingQuery(
  query: MaybeRef<ProjectsListQuery> = { page: 1 },
) {
  const queryRef = computed(() => unref(query));
  return usePagedListQuery<ProjectDto, Project>({
    queryKey: computed(() => projectQueryKeys.withPending(queryRef.value)),
    page: computed(() => queryRef.value.page ?? 1),
    pageSize: PROJECTS_PAGE_SIZE,
    placeholderData: keepPreviousData,
    fetchPage: (skip, take) =>
      projectsControllerGetProjectsWithPendingFlag({
        query: {
          skip,
          take,
          ...(queryRef.value.q ? { q: queryRef.value.q } : {}),
          ...(queryRef.value.groupId
            ? { groupId: queryRef.value.groupId }
            : {}),
        },
      }),
    map: mapProjects,
  });
}

// Branch-scoped project read: the branch is optional (the backend defaults to
// the project's default branch), but it is always part of the cache key so the
// switcher never shows another branch's tests while a new read is in flight.
// The page/filter object is part of the key for the same reason: a new page or
// filter is a distinct server read. Deliberately no keepPreviousData: these rows
// are review decisions, so rendering the previous branch's (or filter's) rows
// under the new heading would misattribute them. The list keeps it — there the
// page is a position, not an identity.
export function useProjectDetailQuery(
  projectName: MaybeRef<string | undefined>,
  branchName?: MaybeRef<string | undefined>,
  query?: MaybeRef<ProjectDetailQuery>,
) {
  const queryRef = computed<ProjectDetailQuery>(
    () => unref(query) ?? { page: 1 },
  );
  return useSdkQuery({
    args: { projectName, branchName, query: queryRef },
    required: ["projectName"],
    keyOf: ({ projectName, branchName, query }) =>
      projectQueryKeys.detail(projectName, branchName, query),
    sdkFn: ({ projectName, branchName, query }) => {
      const { page = 1, ...filters } = query;
      return projectsControllerGetOneProject({
        path: { projectName },
        query: {
          skip: (page - 1) * PROJECT_DETAIL_PAGE_SIZE,
          take: PROJECT_DETAIL_PAGE_SIZE,
          ...(branchName ? { branch: branchName } : {}),
          ...filters,
        },
      });
    },
    map: (data: ProjectDto | undefined) => {
      if (!data) throw new Error("Project not found");
      return mapProject(data);
    },
  });
}

// Every project, for pickers that cannot paginate — an API key's project
// allowlist must offer all of them, not just the first page. The project list is
// small, so one fetch-all read is acceptable here.
export function useAllProjectsQuery(enabled: MaybeRef<boolean> = true) {
  return usePaginatedListQuery<ProjectDto, Project>({
    queryKey: projectQueryKeys.allProjects(),
    enabled,
    fetchPage: (skip, take) =>
      projectsControllerGetProjectsWithPendingFlag({ query: { skip, take } }),
    map: (dtos) => mapProjects(dtos),
  });
}

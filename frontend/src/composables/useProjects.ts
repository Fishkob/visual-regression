import {
  projectsControllerGetProjectsWithPendingFlag,
  projectsControllerGetOneProject,
  type ProjectDto,
} from "@sdk";
import type { Project } from "@/domains/projects/project.model";
import { mapProjects, mapProject } from "@/domains/projects/project.mapper";
import { projectQueryKeys } from "@/domains/projects/query-keys";
import {
  usePaginatedListQuery,
  useSdkQuery,
  type MaybeRef,
} from "@/composables/useDomainQuery";

export function useProjectsWithPendingQuery() {
  return usePaginatedListQuery<ProjectDto, Project>({
    queryKey: projectQueryKeys.withPending(),
    fetchPage: (skip, take) =>
      projectsControllerGetProjectsWithPendingFlag({ query: { skip, take } }),
    map: mapProjects,
  });
}

// Branch-scoped project read: the branch is optional (the backend defaults to
// the project's default branch), but it is always part of the cache key so the
// switcher never shows another branch's tests while a new read is in flight.
export function useProjectDetailQuery(
  projectName: MaybeRef<string | undefined>,
  branchName?: MaybeRef<string | undefined>,
) {
  return useSdkQuery({
    args: { projectName, branchName },
    required: ["projectName"],
    keyOf: ({ projectName, branchName }) =>
      projectQueryKeys.detail(projectName, branchName),
    sdkFn: ({ projectName, branchName }) =>
      projectsControllerGetOneProject({
        path: { projectName },
        ...(branchName ? { query: { branch: branchName } } : {}),
      }),
    map: (data: ProjectDto | undefined) => {
      if (!data) throw new Error("Project not found");
      return mapProject(data);
    },
  });
}

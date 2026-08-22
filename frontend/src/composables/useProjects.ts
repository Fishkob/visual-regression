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

export function useProjectDetailQuery(
  projectName: MaybeRef<string | undefined>,
) {
  return useSdkQuery<{ projectName: string | undefined }, ProjectDto, Project>({
    args: { projectName },
    keyOf: ({ projectName }) =>
      projectName ? projectQueryKeys.detail(projectName) : [],
    sdkFn: ({ projectName }) =>
      projectsControllerGetOneProject({ path: { projectName: projectName! } }),
    map: (data) => {
      if (!data) throw new Error("Project not found");
      return mapProject(data);
    },
  });
}

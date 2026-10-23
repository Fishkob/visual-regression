import { projectsControllerUpdateProject, type ProjectDto } from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { invalidateProjectsForGroupChange } from "@/lib/invalidation";

export function useProjectGroupAssignment() {
  return useSdkMutation<
    ProjectDto,
    { projectName: string; groupId: string | null }
  >({
    mutationFn: ({ projectName, groupId }) =>
      projectsControllerUpdateProject({
        path: { projectName },
        body: { groupId },
      }),
    successMessage: "Project moved",
    errorMessage: "Could not move project",
    invalidate: (client) => invalidateProjectsForGroupChange(client),
  });
}

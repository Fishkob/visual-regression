import { translateMessage as tm } from "@/lib/i18n-messages";
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
    successMessage: tm("toast.projectMoved"),
    errorMessage: tm("toast.projectMoveError"),
    invalidate: (client) => invalidateProjectsForGroupChange(client),
  });
}

import { translateMessage as tm } from "@/lib/i18n-messages";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { invalidateProjectsForAssignmentChange } from "@/lib/invalidation";
import { projectsControllerCreate, type ProjectDto } from "@sdk";

export function useCreateProject() {
  return useSdkMutation<ProjectDto, { name: string; teamId: string }>({
    mutationFn: (body) => projectsControllerCreate({ body }),
    successMessage: tm("toast.projectCreated"),
    errorMessage: tm("toast.projectCreateError"),
    invalidate: (client) => invalidateProjectsForAssignmentChange(client),
  });
}

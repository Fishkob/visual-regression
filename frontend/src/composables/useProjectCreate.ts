import { useSdkMutation } from "@/composables/useSdkMutation";
import { invalidateProjectsForGroupChange } from "@/lib/invalidation";
import { projectsControllerCreate, type ProjectDto } from "@sdk";

export function useCreateProject() {
  return useSdkMutation<ProjectDto, { name: string; groupId?: string }>({
    mutationFn: (body) => projectsControllerCreate({ body }),
    successMessage: "Project created",
    errorMessage: "Could not create project",
    invalidate: (client) => invalidateProjectsForGroupChange(client),
  });
}

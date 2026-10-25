import { translateMessage as tm } from "@/lib/i18n-messages";
import {
  projectGroupsControllerCreate,
  projectGroupsControllerFindAll,
  projectGroupsControllerRemove,
  projectGroupsControllerRename,
  type ProjectGroupDto,
} from "@sdk";
import { groupQueryKeys } from "@/domains/groups/query-keys";
import { mapProjectGroups } from "@/domains/groups/group.mapper";
import { useSdkQuery } from "@/composables/useDomainQuery";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { invalidateProjectsForGroupChange } from "@/lib/invalidation";

export function useGroupsQuery() {
  return useSdkQuery({
    args: {},
    required: [],
    keyOf: () => groupQueryKeys.list(),
    sdkFn: () => projectGroupsControllerFindAll(),
    map: (data: ProjectGroupDto[] | undefined) => mapProjectGroups(data),
  });
}

export function useCreateGroup() {
  return useSdkMutation<ProjectGroupDto, { name: string }>({
    mutationFn: (body) => projectGroupsControllerCreate({ body }),
    successMessage: tm("toast.groupCreated"),
    errorMessage: tm("toast.groupCreateError"),
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: groupQueryKeys.all() });
    },
  });
}

export function useRenameGroup() {
  return useSdkMutation<ProjectGroupDto, { id: string; name: string }>({
    mutationFn: ({ id, name }) =>
      projectGroupsControllerRename({ path: { id }, body: { name } }),
    successMessage: tm("toast.groupRenamed"),
    errorMessage: tm("toast.groupRenameError"),
    invalidate: (client) => invalidateProjectsForGroupChange(client),
  });
}

export function useDeleteGroup() {
  return useSdkMutation<unknown, string>({
    mutationFn: (id) => projectGroupsControllerRemove({ path: { id } }),
    successMessage: tm("toast.groupDeleted"),
    errorMessage: tm("toast.groupDeleteError"),
    invalidate: (client) => invalidateProjectsForGroupChange(client),
  });
}

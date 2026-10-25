import { unref } from "vue";
import type { StorageUsageDto } from "@sdk";
import { storageControllerGet, storageControllerUpdate } from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { mapStorage } from "@/domains/storage/storage.mapper";
import type { UpdateProjectStorageInput } from "@/domains/storage/storage.model";
import { storageQueryKeys } from "@/domains/storage/query-keys";
import { invalidateProjectStorage } from "@/lib/invalidation";

export function useProjectStorage(projectName: MaybeRef<string>) {
  return useSdkQuery({
    args: { projectName },
    required: ["projectName"],
    keyOf: ({ projectName }) => storageQueryKeys.detail(projectName),
    sdkFn: ({ projectName }) => storageControllerGet({ path: { projectName } }),
    map: (dto: StorageUsageDto | undefined) => mapStorage(dto),
  });
}

export function useUpdateProjectStorage(projectName: MaybeRef<string>) {
  return useSdkMutation<StorageUsageDto, UpdateProjectStorageInput>({
    mutationFn: (body) =>
      storageControllerUpdate({
        path: { projectName: unref(projectName) },
        body,
      }),
    successMessage: "Storage settings saved",
    errorMessage: "Could not save the storage settings",
    invalidate: (client) =>
      invalidateProjectStorage(client, unref(projectName)),
  });
}

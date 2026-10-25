import { translateMessage as tm } from "@/lib/i18n-messages";
import { unref } from "vue";
import type { StorageUsageDto } from "@sdk";
import {
  storageControllerGet,
  storageControllerPreviewRetention,
  storageControllerUpdate,
} from "@sdk";
import type { RetentionPreviewDto } from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import {
  mapRetentionPreview,
  mapStorage,
} from "@/domains/storage/storage.mapper";
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
    successMessage: tm("toast.storageSaved"),
    errorMessage: tm("toast.storageSaveError"),
    invalidate: (client) =>
      invalidateProjectStorage(client, unref(projectName)),
  });
}

// The dry-run is gated on the dialog being open: the panel mounts with the page,
// but no preview request is made until the operator clicks "Preview cleanup".
export function useRetentionPreview(
  projectName: MaybeRef<string>,
  enabled: MaybeRef<boolean>,
) {
  return useSdkQuery({
    args: { projectName },
    required: ["projectName"],
    enabled,
    keyOf: ({ projectName }) => storageQueryKeys.preview(projectName),
    sdkFn: ({ projectName }) =>
      storageControllerPreviewRetention({ path: { projectName } }),
    map: (dto: RetentionPreviewDto | undefined) => mapRetentionPreview(dto),
  });
}

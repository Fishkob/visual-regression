import { translateMessage as tm } from "@/lib/i18n-messages";
import {
  apiKeysControllerCreate,
  apiKeysControllerFindAll,
  apiKeysControllerRemove,
  apiKeysControllerRevoke,
  apiKeysControllerRotate,
  type ApiKeyDto,
  type CreatedApiKeyDto,
} from "@sdk";
import { apiKeyQueryKeys } from "@/domains/api-keys/query-keys";
import { mapApiKeys } from "@/domains/api-keys/api-key.mapper";
import type { CreateApiKeyInput } from "@/domains/api-keys/api-key.model";
import { useSdkQuery } from "@/composables/useDomainQuery";
import { useSdkMutation } from "@/composables/useSdkMutation";

export function useApiKeysQuery() {
  return useSdkQuery({
    args: {},
    required: [],
    keyOf: () => apiKeyQueryKeys.list(),
    sdkFn: () => apiKeysControllerFindAll(),
    map: (data: ApiKeyDto[] | undefined) => mapApiKeys(data),
  });
}

// The generated OpenAPI spec double-nests projectNames (Array<Array<string>>)
// while the backend sends a flat string[]; the wire body keeps the flat shape and
// the cast bridges the generator quirk. Only explicit fields are sent so the
// backend defaults stay authoritative.
function toCreateApiKeyBody(input: CreateApiKeyInput) {
  return {
    name: input.name,
    ...(input.expiresInDays === undefined
      ? {}
      : { expiresInDays: input.expiresInDays }),
    ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
    ...(input.projectNames === undefined
      ? {}
      : { projectNames: input.projectNames }),
  };
}

// Creating answers with the raw key exactly once, so it hands the mapped issued
// key back to the caller instead of only toasting: the view shows it in a reveal
// dialog that cannot be reopened.
export function useCreateApiKey() {
  return useSdkMutation<CreatedApiKeyDto, CreateApiKeyInput>({
    mutationFn: (body) =>
      apiKeysControllerCreate({ body: toCreateApiKeyBody(body) }),
    successMessage: tm("toast.apiKeyCreated"),
    errorMessage: tm("toast.apiKeyCreateError"),
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: apiKeyQueryKeys.all() });
    },
  });
}

export function useDeleteApiKey() {
  return useSdkMutation<unknown, string>({
    mutationFn: (id) => apiKeysControllerRemove({ path: { id } }),
    successMessage: tm("toast.apiKeyDeleted"),
    errorMessage: tm("toast.apiKeyDeleteError"),
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: apiKeyQueryKeys.all() });
    },
  });
}

export interface RotateApiKeyInput {
  id: string;
  graceMinutes: number;
}

// Rotation returns the new key exactly once, like creation: the caller hands it
// to the same reveal dialog, because the raw key cannot be read again.
export function useRotateApiKey() {
  return useSdkMutation<CreatedApiKeyDto, RotateApiKeyInput>({
    mutationFn: ({ id, graceMinutes }) =>
      apiKeysControllerRotate({ path: { id }, body: { graceMinutes } }),
    successMessage: tm("toast.apiKeyRotated"),
    errorMessage: tm("toast.apiKeyRotateError"),
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: apiKeyQueryKeys.all() });
    },
  });
}

export interface RevokeApiKeyInput {
  id: string;
  reason?: string;
}

// Revoking keeps the row and the audit trail; only Delete is the hard removal.
export function useRevokeApiKey() {
  return useSdkMutation<ApiKeyDto, RevokeApiKeyInput>({
    mutationFn: ({ id, reason }) =>
      apiKeysControllerRevoke({
        path: { id },
        body: reason ? { reason } : {},
      }),
    successMessage: tm("toast.apiKeyRevoked"),
    errorMessage: tm("toast.apiKeyRevokeError"),
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: apiKeyQueryKeys.all() });
    },
  });
}

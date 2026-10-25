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
import type { RotateApiKeyInput } from "@/domains/api-keys/api-key.model";

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

// Create and rotate both answer with the raw key exactly once, so they hand the
// mapped issued key back to the caller instead of only toasting: the view shows
// it in a reveal dialog that cannot be reopened.
export function useCreateApiKey() {
  return useSdkMutation<CreatedApiKeyDto, CreateApiKeyInput>({
    mutationFn: (body) =>
      apiKeysControllerCreate({ body: toCreateApiKeyBody(body) }),
    successMessage: "API key created",
    errorMessage: "Could not create API key",
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: apiKeyQueryKeys.all() });
    },
  });
}

export function useRotateApiKey() {
  return useSdkMutation<
    CreatedApiKeyDto,
    { id: string; rotation: RotateApiKeyInput }
  >({
    mutationFn: ({ id, rotation }) =>
      apiKeysControllerRotate({ path: { id }, body: rotation }),
    successMessage: "API key rotated",
    errorMessage: "Could not rotate API key",
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: apiKeyQueryKeys.all() });
    },
  });
}

export function useRevokeApiKey() {
  return useSdkMutation<ApiKeyDto, { id: string; reason?: string }>({
    mutationFn: ({ id, reason }) =>
      apiKeysControllerRevoke({
        path: { id },
        body: reason ? { reason } : {},
      }),
    successMessage: "API key revoked",
    errorMessage: "Could not revoke API key",
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: apiKeyQueryKeys.all() });
    },
  });
}

export function useDeleteApiKey() {
  return useSdkMutation<unknown, string>({
    mutationFn: (id) => apiKeysControllerRemove({ path: { id } }),
    successMessage: "API key deleted",
    errorMessage: "Could not delete API key",
    invalidate: (client) => {
      client.invalidateQueries({ queryKey: apiKeyQueryKeys.all() });
    },
  });
}

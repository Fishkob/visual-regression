import { translateMessage as tm } from "@/lib/i18n-messages";
import { unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import {
  webhooksControllerCreate,
  webhooksControllerDeliveries,
  webhooksControllerList,
  webhooksControllerRemove,
  webhooksControllerReplay,
  webhooksControllerTest,
  webhooksControllerUpdate,
  type CreatedWebhookEndpointDto,
  type WebhookEndpointDto,
  type WebhookReplayResultDto,
  type WebhookTestResultDto,
} from "@sdk";
import {
  mapWebhookDeliveries,
  mapWebhookEndpoints,
} from "@/domains/webhooks/webhook.mapper";
import { webhookQueryKeys } from "@/domains/webhooks/query-keys";
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
} from "@/domains/webhooks/webhook.model";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { useSdkMutation } from "@/composables/useSdkMutation";
import {
  invalidateWebhookDeliveries,
  invalidateWebhooks,
} from "@/lib/invalidation";

export function useWebhooks(projectName: MaybeRef<string>) {
  return useSdkQuery({
    args: { projectName },
    required: ["projectName"],
    keyOf: ({ projectName }) => webhookQueryKeys.list(projectName),
    sdkFn: ({ projectName }) =>
      webhooksControllerList({ path: { projectName } }),
    map: (data: WebhookEndpointDto[] | undefined) => mapWebhookEndpoints(data),
  });
}

// Create, update and delete share the endpoint list as their read; the test
// command also moves the delivery log (it queues a synthetic delivery), so all
// four refresh both keys.
export function useWebhookMutations(projectName: MaybeRef<string>) {
  const invalidate = (client: QueryClient) =>
    invalidateWebhooks(client, unref(projectName));

  const create = useSdkMutation<CreatedWebhookEndpointDto, CreateWebhookInput>({
    mutationFn: ({ url, events, format, secret }) =>
      webhooksControllerCreate({
        path: { projectName: unref(projectName) },
        body: {
          url,
          events,
          ...(format ? { format } : {}),
          ...(secret ? { secret } : {}),
        },
      }),
    successMessage: tm("toast.webhookCreated"),
    errorMessage: tm("toast.webhookCreateError"),
    invalidate,
  });

  const update = useSdkMutation<
    WebhookEndpointDto | CreatedWebhookEndpointDto,
    UpdateWebhookInput
  >({
    mutationFn: ({ id, url, events, format, active, secret }) =>
      webhooksControllerUpdate({
        path: { projectName: unref(projectName), id },
        body: {
          ...(url ? { url } : {}),
          ...(events ? { events } : {}),
          ...(format ? { format } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(secret ? { secret } : {}),
        },
      }),
    successMessage: tm("toast.webhookUpdated"),
    errorMessage: tm("toast.webhookUpdateError"),
    invalidate,
  });

  const remove = useSdkMutation<unknown, string>({
    mutationFn: (id) =>
      webhooksControllerRemove({
        path: { projectName: unref(projectName), id },
      }),
    successMessage: tm("toast.webhookDeleted"),
    errorMessage: tm("toast.webhookDeleteError"),
    invalidate,
  });

  const test = useSdkMutation<WebhookTestResultDto, string>({
    mutationFn: (id) =>
      webhooksControllerTest({
        path: { projectName: unref(projectName), id },
      }),
    successMessage: tm("toast.webhookTestQueued"),
    errorMessage: tm("toast.webhookTestError"),
    invalidate,
  });

  return { create, update, remove, test };
}

// The delivery log of one endpoint. Gated on `enabled` because a collapsed
// panel must not fetch; the key stays per endpoint so opening a second one
// reuses its cached log instead of refetching the first.
export function useWebhookDeliveries(
  projectName: MaybeRef<string>,
  endpointId: MaybeRef<string>,
  enabled: MaybeRef<boolean>,
) {
  const query = useSdkQuery({
    args: { projectName, endpointId },
    required: ["projectName", "endpointId"],
    enabled,
    keyOf: ({ projectName, endpointId }) =>
      webhookQueryKeys.deliveries(projectName, endpointId),
    sdkFn: ({ projectName, endpointId }) =>
      webhooksControllerDeliveries({
        path: { projectName, id: endpointId },
      }),
    map: mapWebhookDeliveries,
  });

  const replay = useSdkMutation<WebhookReplayResultDto, string>({
    mutationFn: (deliveryId) =>
      webhooksControllerReplay({
        path: {
          projectName: unref(projectName),
          id: unref(endpointId),
          deliveryId,
        },
      }),
    successMessage: tm("toast.webhookReplayed"),
    errorMessage: tm("toast.webhookReplayError"),
    invalidate: (client) =>
      invalidateWebhookDeliveries(
        client,
        unref(projectName),
        unref(endpointId),
      ),
  });

  return {
    ...query,
    replay: replay.mutate,
    isReplaying: replay.isPending,
  };
}

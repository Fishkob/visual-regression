import { unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import {
  shareLinkRevokeControllerRevoke,
  shareLinksControllerCreate,
  shareLinksControllerList,
  type CreatedShareLinkDto,
  type ShareLinkDto,
} from "@sdk";
import { translateMessage as tm } from "@/lib/i18n-messages";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import {
  mapCreatedShareLink,
  mapShareLinks,
} from "@/domains/share-links/share-link.mapper";
import {
  type CreateShareLinkInput,
  type CreatedShareLink,
} from "@/domains/share-links/share-link.model";
import { shareLinkQueryKeys } from "@/domains/share-links/query-keys";

function invalidateList(client: QueryClient, projectName: string) {
  client.invalidateQueries({
    queryKey: shareLinkQueryKeys.list(projectName),
  });
}

export function useShareLinks(projectName: MaybeRef<string>) {
  return useSdkQuery({
    args: { projectName },
    required: ["projectName"],
    keyOf: ({ projectName }) => shareLinkQueryKeys.list(projectName),
    sdkFn: ({ projectName }) =>
      shareLinksControllerList({ path: { projectName } }),
    map: (dtos: ShareLinkDto[] | undefined) => mapShareLinks(dtos),
  });
}

export function useCreateShareLink(projectName: MaybeRef<string>) {
  return useSdkMutation<CreatedShareLinkDto, CreateShareLinkInput>({
    mutationFn: (body) =>
      shareLinksControllerCreate({
        path: { projectName: unref(projectName) },
        body,
      }),
    successMessage: tm("share.created"),
    errorMessage: tm("share.createError"),
    invalidate: (client) => invalidateList(client, unref(projectName)),
  });
}

export function mapCreated(
  dto: CreatedShareLinkDto,
): CreatedShareLink | undefined {
  return mapCreatedShareLink(dto);
}

export function useRevokeShareLink(projectName: MaybeRef<string>) {
  return useSdkMutation<ShareLinkDto, string>({
    mutationFn: (id) => shareLinkRevokeControllerRevoke({ path: { id } }),
    successMessage: tm("share.revoked"),
    errorMessage: tm("share.revokeError"),
    invalidate: (client) => invalidateList(client, unref(projectName)),
  });
}

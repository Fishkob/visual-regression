import { translateMessage as tm } from "@/lib/i18n-messages";
import type { QueryClient } from "@tanstack/vue-query";
import {
  authControllerListSessions,
  authControllerRevokeAllSessions,
  authControllerRevokeSession,
  type SessionDto,
} from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useSdkQuery } from "@/composables/useDomainQuery";
import {
  mapRevokeAllResult,
  mapSessions,
} from "@/domains/security/security.mapper";
import { securityQueryKeys } from "@/domains/security/query-keys";

const invalidateSessions = (client: QueryClient) => {
  void client.invalidateQueries({ queryKey: securityQueryKeys.sessions() });
};

export function useSessionsQuery() {
  return useSdkQuery({
    args: {},
    required: [],
    keyOf: () => securityQueryKeys.sessions(),
    sdkFn: () => authControllerListSessions(),
    map: (data: SessionDto[] | undefined) => mapSessions(data),
  });
}

export function useRevokeSession() {
  return useSdkMutation<void, string>({
    allowEmptyResponse: true,
    mutationFn: (id) => authControllerRevokeSession({ path: { id } }),
    successMessage: tm("toast.sessionRevoked"),
    errorMessage: tm("toast.sessionRevokeError"),
    invalidate: invalidateSessions,
  });
}

export function useRevokeAllSessions() {
  return useSdkMutation<unknown, void>({
    mutationFn: () => authControllerRevokeAllSessions(),
    successMessage: (result) => {
      const revoked = mapRevokeAllResult(result);
      if (revoked === 0) return tm("toast.noOtherSessions");
      return tm("toast.sessionsRevoked", { count: revoked });
    },
    errorMessage: tm("toast.revokeOthersError"),
    invalidate: invalidateSessions,
  });
}

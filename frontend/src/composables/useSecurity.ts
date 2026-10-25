import type { QueryClient } from "@tanstack/vue-query";
import {
  authControllerDisableTwoFactor,
  authControllerEnableTwoFactor,
  authControllerListSessions,
  authControllerRevokeAllSessions,
  authControllerRevokeSession,
  authControllerSetupTwoFactor,
  type RecoveryCodesDto,
  type SessionDto,
  type TwoFactorSetupDto,
} from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useSdkQuery } from "@/composables/useDomainQuery";
import { authQueryKeys } from "@/domains/auth/query-keys";
import {
  mapRevokeAllResult,
  mapSessions,
} from "@/domains/security/security.mapper";
import { securityQueryKeys } from "@/domains/security/query-keys";

const invalidateMe = (client: QueryClient) => {
  void client.invalidateQueries({ queryKey: authQueryKeys.me() });
};

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

// The setup answer is a one-shot mutation result: it is shown once and must not
// be cached, so it is deliberately not a query.
export function useTwoFactorSetup() {
  return useSdkMutation<TwoFactorSetupDto, void>({
    mutationFn: () => authControllerSetupTwoFactor(),
    errorMessage: "Could not start two-factor setup",
  });
}

export function useEnableTwoFactor() {
  return useSdkMutation<RecoveryCodesDto, string>({
    mutationFn: (code) => authControllerEnableTwoFactor({ body: { code } }),
    successMessage: "Two-factor authentication enabled",
    errorMessage: "Could not enable two-factor authentication",
    invalidate: invalidateMe,
  });
}

export function useDisableTwoFactor() {
  return useSdkMutation<void, string>({
    // Disabling answers 204: there is no payload to unwrap, but the empty body
    // is the success case here.
    allowEmptyResponse: true,
    mutationFn: (password) =>
      authControllerDisableTwoFactor({ body: { password } }),
    successMessage: "Two-factor authentication disabled",
    errorMessage: "Could not disable two-factor authentication",
    invalidate: invalidateMe,
  });
}

export function useRevokeSession() {
  return useSdkMutation<void, string>({
    allowEmptyResponse: true,
    mutationFn: (id) => authControllerRevokeSession({ path: { id } }),
    successMessage: "Session revoked",
    errorMessage: "Could not revoke the session",
    invalidate: invalidateSessions,
  });
}

export function useRevokeAllSessions() {
  return useSdkMutation<unknown, void>({
    mutationFn: () => authControllerRevokeAllSessions(),
    successMessage: (result) => {
      const revoked = mapRevokeAllResult(result);
      if (revoked === 0) return "No other sessions were signed out";
      return `Signed out ${revoked} other session${revoked === 1 ? "" : "s"}`;
    },
    errorMessage: "Could not sign out the other sessions",
    invalidate: invalidateSessions,
  });
}

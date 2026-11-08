import { translateMessage as tm } from "@/lib/i18n-messages";
import { computed } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  authControllerChangePassword,
  authControllerMe,
  authControllerLogin,
  authControllerLogout,
} from "@sdk";
import type { MeDto } from "@sdk";
import { useRouter } from "vue-router";
import { useDomainQuery } from "@/composables/useDomainQuery";
import { unwrapSdkData } from "@/lib/sdk";
import { authQueryKeys } from "@/domains/auth/query-keys";
import { mapMe } from "@/domains/auth/auth.mapper";
import {
  DEFAULT_ROLE,
  canWriteRole,
  isAdminRole,
  type CurrentUser,
} from "@/domains/auth/auth.model";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Single home of the "what is the current session" read. Both the router guard
// (via the query cache) and App.vue's useMeQuery resolve the same key, so one
// /me request serves navigation and the header.
export async function fetchMe(): Promise<CurrentUser | null> {
  const response = await authControllerMe();
  return mapMe(unwrapSdkData<MeDto>(response));
}

export function useMeQuery() {
  return useDomainQuery<CurrentUser | null>({
    queryKey: authQueryKeys.me(),
    queryFn: fetchMe,
  });
}

// The one place components ask "what may this user do": every other check reads
// the computed helpers, so the role string is parsed once.
export function useCurrentRole() {
  const { data: me } = useMeQuery();
  const role = computed(() => me.value?.role ?? DEFAULT_ROLE);
  const isAdmin = computed(() => isAdminRole(role.value));
  const canWrite = computed(() => canWriteRole(role.value));
  return { role, isAdmin, canWrite };
}

// Login ends here: cache the fresh session so the guard can release the next
// navigation, then route past the forced password change when the backend
// demands one.
function useSessionEntry() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async (user: CurrentUser) => {
    queryClient.setQueryData(authQueryKeys.me(), user);
    await queryClient.invalidateQueries({ queryKey: authQueryKeys.me() });
    router.push(
      user.mustChangePassword
        ? { name: "change-password" }
        : { name: "review-inbox" },
    );
  };
}

export function useLogin() {
  const enterSession = useSessionEntry();

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await authControllerLogin({ body: credentials });
      const user = mapMe(
        unwrapSdkData<MeDto>(response, tm("toast.invalidCredentials")),
      );
      if (!user) throw new Error(tm("toast.invalidCredentials"));
      return user;
    },
    onSuccess: enterSession,
  });
}

// The change-password answer carries the new MeDto (mustChangePassword now
// false) and reissues the session cookie, so caching it lets the guard release
// the next navigation without waiting for a /me round-trip.
export function useChangePassword() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ChangePasswordInput) => {
      const response = await authControllerChangePassword({ body: input });
      return unwrapSdkData<MeDto>(response, tm("changePassword.errorFallback"));
    },
    onSuccess: async (me) => {
      const user = mapMe(me);
      if (user) queryClient.setQueryData(authQueryKeys.me(), user);
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.me() });
      toast.success(tm("toast.passwordChanged"));
      router.push({ name: "review-inbox" });
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      unwrapSdkData(await authControllerLogout(), tm("toast.logoutFailed"));
    },
    onSuccess: () => {
      queryClient.clear();
      router.push({ name: "login" });
    },
  });
}

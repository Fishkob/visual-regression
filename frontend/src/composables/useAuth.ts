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

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await authControllerLogin({ body: credentials });
      return unwrapSdkData<MeDto>(response, "Invalid username or password");
    },
    onSuccess: async (me) => {
      const user = mapMe(me);
      if (user) queryClient.setQueryData(authQueryKeys.me(), user);
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.me() });
      // A forced first-login change comes before every other destination: the
      // backend rejects every non-auth route until it is done.
      router.push(
        me?.mustChangePassword
          ? { name: "change-password" }
          : { name: "review-inbox" },
      );
    },
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
      return unwrapSdkData<MeDto>(response, "Could not change the password");
    },
    onSuccess: async (me) => {
      const user = mapMe(me);
      if (user) queryClient.setQueryData(authQueryKeys.me(), user);
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.me() });
      toast.success("Password changed");
      router.push({ name: "review-inbox" });
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      unwrapSdkData(await authControllerLogout(), "Logout failed");
    },
    onSuccess: () => {
      queryClient.clear();
      router.push({ name: "login" });
    },
  });
}

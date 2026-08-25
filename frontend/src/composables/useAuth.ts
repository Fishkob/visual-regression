import { useMutation, useQueryClient } from "@tanstack/vue-query";
import {
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
import type { CurrentUser } from "@/domains/auth/auth.model";

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

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await authControllerLogin({ body: credentials });
      return unwrapSdkData<MeDto>(response, "Invalid username or password");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.me() });
      router.push({ name: "project-list" });
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

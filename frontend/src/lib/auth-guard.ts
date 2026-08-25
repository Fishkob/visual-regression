import type { RouteLocationNormalized } from "vue-router";
import { queryClient } from "@/lib/query-client";
import { authQueryKeys } from "@/domains/auth/query-keys";
import { fetchMe } from "@/composables/useAuth";

export async function authGuard(
  to: RouteLocationNormalized,
): Promise<true | { name: string }> {
  if (to.meta.requiresAuth === false) return true;
  try {
    // Resolve /me through the shared me query so App.vue's useMeQuery reads the
    // same cache entry instead of firing a second request per navigation.
    const me = await queryClient.fetchQuery({
      queryKey: authQueryKeys.me(),
      queryFn: fetchMe,
      retry: false,
    });
    if (me) return true;
  } catch {
    /* fall through to login */
  }
  return { name: "login" };
}

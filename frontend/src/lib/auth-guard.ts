import type { RouteLocationNormalized } from "vue-router";
import { queryClient } from "@/lib/query-client";
import { authQueryKeys } from "@/domains/auth/query-keys";
import { fetchMe } from "@/composables/useAuth";
import type { UserRole } from "@/domains/auth/auth.model";

// Route metadata is the single declaration of "who may open this page"; the
// guard below reads it, the router records it, and no component re-derives it.
declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiresRole?: UserRole;
    // i18n key for the browser tab title (see lib/document-title).
    titleKey?: string;
  }
}

// Pages a forced password change still allows: the change form itself and the
// login page (so the user can switch accounts or sign out).
const PASSWORD_CHANGE_EXEMPT = new Set(["change-password", "login"]);

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
    if (!me) return { name: "login" };

    // A forced change comes first: the backend answers 403 on every non-auth
    // route until it is done, so try to render nothing that cannot load.
    if (me.mustChangePassword && !PASSWORD_CHANGE_EXEMPT.has(String(to.name))) {
      return { name: "change-password" };
    }

    // Admin-only pages are declared in the route meta; a member/viewer gets the
    // 403 page instead of an empty page full of failed requests.
    if (to.meta.requiresRole && me.role !== to.meta.requiresRole) {
      return { name: "forbidden" };
    }

    return true;
  } catch {
    /* fall through to login */
  }
  return { name: "login" };
}

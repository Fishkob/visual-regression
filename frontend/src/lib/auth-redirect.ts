import router from "@/router/index";
import { queryClient } from "@/lib/query-client";

let redirecting = false;

// Single home of "the session is dead" — any 401 from the SDK redirects to
// login. Guarded so concurrent 401s don't queue multiple navigations.
export function handleUnauthorized(): void {
  if (router.currentRoute.value.name === "login") return;
  if (redirecting) return;
  redirecting = true;
  queryClient.clear();
  router
    .push({ name: "login" })
    .catch(() => undefined)
    .finally(() => {
      redirecting = false;
    });
}

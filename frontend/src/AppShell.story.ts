import { defineComponent, h } from "vue";
import { RouterView, useRouter } from "vue-router";

import { Toaster } from "@/components/ui/sonner";

// Mirrors the real app shell for navigation-dependent stories. The review loop
// navigates between test-detail routes and finally to approval-done, so the
// story must follow the router (RouterView) instead of pinning one view.
export const AppShell = defineComponent(
  (props: { initialRoute?: string }) => {
    const router = useRouter();
    if (props.initialRoute) {
      void router.push(props.initialRoute);
    }
    return () => h("div", null, [h(RouterView), h(Toaster)]);
  },
  { props: ["initialRoute"] },
);

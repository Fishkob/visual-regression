import { defineComponent, h } from "vue";
import { useRouter } from "vue-router";

import AppShellComponent from "@/components/AppShell.vue";

// Mounts the full shell at an optional starting route so quality and component
// tests can exercise navigation-dependent views.
export const AppShell = defineComponent(
  (props: { initialRoute?: string }) => {
    const router = useRouter();
    if (props.initialRoute) {
      void router.push(props.initialRoute);
    }
    return () => h(AppShellComponent);
  },
  { props: ["initialRoute"] },
);

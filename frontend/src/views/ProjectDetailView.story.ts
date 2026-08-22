import { defineComponent, h } from "vue";
import { useRouter } from "vue-router";

import ProjectDetailView from "./ProjectDetailView.vue";

export const Routed = defineComponent(
  (props: { initialRoute?: string }) => {
    const router = useRouter();
    if (props.initialRoute) {
      void router.push(props.initialRoute);
    }
    return () => h(ProjectDetailView);
  },
  { props: ["initialRoute"] },
);

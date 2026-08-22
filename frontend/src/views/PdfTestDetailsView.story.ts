import { defineComponent, h } from "vue";
import { useRouter } from "vue-router";

import PdfTestDetailsView from "./PdfTestDetailsView.vue";

export const Routed = defineComponent(
  (props: { initialRoute?: string }) => {
    const router = useRouter();
    if (props.initialRoute) {
      void router.push(props.initialRoute);
    }
    return () => h(PdfTestDetailsView);
  },
  { props: ["initialRoute"] },
);

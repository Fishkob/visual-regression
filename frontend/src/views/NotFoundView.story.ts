import { defineComponent, h } from "vue";

import NotFoundView from "./NotFoundView.vue";

export const NotFound = defineComponent(() => () => h(NotFoundView));

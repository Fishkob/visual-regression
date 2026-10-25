import { defineComponent, h } from "vue";

import ApiKeysView from "./ApiKeysView.vue";

export const ApiKeys = defineComponent(() => () => h(ApiKeysView));

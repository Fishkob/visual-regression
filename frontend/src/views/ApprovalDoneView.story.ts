import { defineComponent, h } from "vue";

import ApprovalDoneView from "./ApprovalDoneView.vue";

export const ApprovalDone = defineComponent(() => () => h(ApprovalDoneView));

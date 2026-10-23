import { defineComponent, h } from "vue";

import InboxView from "./InboxView.vue";

export const Inbox = defineComponent(() => () => h(InboxView));

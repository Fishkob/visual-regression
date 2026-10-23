import { defineComponent, h } from "vue";

import GroupsView from "./GroupsView.vue";

export const Groups = defineComponent(() => () => h(GroupsView));

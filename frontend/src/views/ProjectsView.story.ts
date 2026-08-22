import { defineComponent, h } from "vue";

import ProjectsView from "./ProjectsView.vue";

export const Projects = defineComponent(() => () => h(ProjectsView));

import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

import ProjectsView from "@/views/ProjectsView.vue";
import ProjectDetailView from "@/views/ProjectDetailView.vue";
import ApprovalDoneView from "@/views/ApprovalDoneView.vue";
import TestDetailDispatcher from "@/components/TestDetailDispatcher.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "project-list",
    component: ProjectsView,
  },
  {
    path: "/projects/:projectName",
    name: "project-detail",
    component: ProjectDetailView,
  },
  {
    path: "/projects/:projectName/tests/:testName",
    name: "test-detail",
    component: TestDetailDispatcher,
  },
  {
    path: "/projects/:projectName/done",
    name: "approval-done",
    component: ApprovalDoneView,
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@/views/NotFoundView.vue"),
  },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});

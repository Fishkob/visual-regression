import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

import { focusRouteContent } from "@/lib/route-focus";
import InboxView from "@/views/InboxView.vue";
import ProjectsView from "@/views/ProjectsView.vue";
import GroupsView from "@/views/GroupsView.vue";
import ProjectDetailView from "@/views/ProjectDetailView.vue";
import ApprovalDoneView from "@/views/ApprovalDoneView.vue";
import TestDetailDispatcher from "@/components/TestDetailDispatcher.vue";
import LoginView from "@/views/LoginView.vue";
import { authGuard } from "@/lib/auth-guard";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { requiresAuth: false },
  },
  {
    path: "/",
    name: "review-inbox",
    component: InboxView,
    meta: { requiresAuth: true },
  },
  {
    path: "/projects",
    name: "project-list",
    component: ProjectsView,
    meta: { requiresAuth: true },
  },
  {
    path: "/groups",
    name: "groups",
    component: GroupsView,
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName",
    name: "project-detail",
    component: ProjectDetailView,
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName/tests/:testName",
    name: "test-detail",
    component: TestDetailDispatcher,
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName/done",
    name: "approval-done",
    component: ApprovalDoneView,
    meta: { requiresAuth: true },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@/views/NotFoundView.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(authGuard);

router.afterEach(async (to, from) => {
  const samePath = from.matched.length > 0 && to.path === from.path;
  await focusRouteContent(samePath);
});

export default router;

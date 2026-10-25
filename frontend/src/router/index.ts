import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

import { focusRouteContent } from "@/lib/route-focus";
import { authGuard } from "@/lib/auth-guard";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/LoginView.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/",
    name: "review-inbox",
    component: () => import("@/views/InboxView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/projects",
    name: "project-list",
    component: () => import("@/views/ProjectsView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/groups",
    name: "groups",
    component: () => import("@/views/GroupsView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/api-keys",
    name: "api-keys",
    component: () => import("@/views/ApiKeysView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName",
    name: "project-detail",
    component: () => import("@/views/ProjectDetailView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName/tests/:testName",
    name: "test-detail",
    component: () => import("@/components/TestDetailDispatcher.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName/tests/:testName/overview",
    name: "test-overview",
    component: () => import("@/views/TestOverviewView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/projects/:projectName/done",
    name: "approval-done",
    component: () => import("@/views/ApprovalDoneView.vue"),
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

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
    meta: { requiresAuth: false, titleKey: "login.signIn" },
  },
  {
    path: "/",
    name: "review-inbox",
    component: () => import("@/views/InboxView.vue"),
    meta: { requiresAuth: true, titleKey: "inbox.title" },
  },
  {
    path: "/projects",
    name: "project-list",
    component: () => import("@/views/ProjectsView.vue"),
    meta: { requiresAuth: true, titleKey: "projects.title" },
  },
  {
    path: "/groups",
    name: "groups",
    component: () => import("@/views/GroupsView.vue"),
    meta: { requiresAuth: true, titleKey: "groups.title" },
  },
  {
    path: "/change-password",
    name: "change-password",
    component: () => import("@/views/ChangePasswordView.vue"),
    meta: { requiresAuth: true, titleKey: "changePassword.title" },
  },
  {
    path: "/users",
    name: "users",
    component: () => import("@/views/UsersView.vue"),
    meta: {
      requiresAuth: true,
      requiresRole: "ADMIN",
      titleKey: "users.title",
    },
  },
  {
    path: "/forbidden",
    name: "forbidden",
    component: () => import("@/views/ForbiddenView.vue"),
    meta: { requiresAuth: true, titleKey: "forbidden.title" },
  },
  {
    path: "/settings/security",
    name: "security",
    component: () => import("@/views/SecurityView.vue"),
    meta: { requiresAuth: true, titleKey: "security.title" },
  },
  {
    path: "/api-keys",
    name: "api-keys",
    component: () => import("@/views/ApiKeysView.vue"),
    meta: {
      requiresAuth: true,
      requiresRole: "ADMIN",
      titleKey: "apiKeys.title",
    },
  },
  {
    path: "/audit",
    name: "audit",
    component: () => import("@/views/AuditView.vue"),
    meta: {
      requiresAuth: true,
      requiresRole: "ADMIN",
      titleKey: "audit.title",
    },
  },
  {
    path: "/share/:token",
    name: "share",
    component: () => import("@/views/ShareView.vue"),
    meta: { requiresAuth: false, titleKey: "share.pageTitle" },
  },
  {
    path: "/projects/:projectName",
    name: "project-detail",
    component: () => import("@/views/ProjectDetailView.vue"),
    meta: { requiresAuth: true, titleKey: "nav.project" },
  },
  {
    path: "/projects/:projectName/webhooks",
    name: "project-webhooks",
    component: () => import("@/views/WebhooksView.vue"),
    meta: {
      requiresAuth: true,
      requiresRole: "ADMIN",
      titleKey: "webhooks.title",
    },
  },
  {
    path: "/projects/:projectName/runs",
    name: "project-runs",
    component: () => import("@/views/RunsView.vue"),
    meta: { requiresAuth: true, titleKey: "runs.title" },
  },
  {
    path: "/projects/:projectName/runs/:runKey",
    name: "run-detail",
    component: () => import("@/views/RunDetailView.vue"),
    meta: { requiresAuth: true, titleKey: "nav.run" },
  },
  {
    path: "/projects/:projectName/trends",
    name: "project-trends",
    component: () => import("@/views/TrendsView.vue"),
    meta: { requiresAuth: true, titleKey: "trends.title" },
  },
  {
    path: "/projects/:projectName/tests/:testName",
    name: "test-detail",
    component: () => import("@/components/TestDetailDispatcher.vue"),
    meta: { requiresAuth: true, titleKey: "nav.test" },
  },
  {
    path: "/projects/:projectName/tests/:testName/overview",
    name: "test-overview",
    component: () => import("@/views/TestOverviewView.vue"),
    meta: { requiresAuth: true, titleKey: "nav.test" },
  },
  {
    path: "/projects/:projectName/done",
    name: "approval-done",
    component: () => import("@/views/ApprovalDoneView.vue"),
    meta: { requiresAuth: true, titleKey: "approvalDone.heading" },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@/views/NotFoundView.vue"),
    meta: { titleKey: "notFound.title" },
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

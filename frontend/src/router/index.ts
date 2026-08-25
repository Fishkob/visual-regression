import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

import ProjectsView from "@/views/ProjectsView.vue";
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
    name: "project-list",
    component: ProjectsView,
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

export default router;

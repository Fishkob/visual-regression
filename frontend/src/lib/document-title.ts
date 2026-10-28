import type { RouteLocationNormalized } from "vue-router";

const APP_NAME = "Visual Regression";

// Pages that are about one entity resolve `entity · page · app` so a tab title
// names the project/test/run first; list and settings pages are just their own
// label. The set is explicit because the route params alone cannot tell a
// detail page from a page that merely carries a project param.
const ENTITY_FIRST_ROUTES = new Set([
  "project-detail",
  "project-webhooks",
  "project-runs",
  "run-detail",
  "project-trends",
  "test-detail",
  "test-overview",
]);

function routeParam(
  route: RouteLocationNormalized,
  key: string,
): string | undefined {
  const value = route.params[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function documentTitle(
  route: RouteLocationNormalized,
  t: (key: string) => string,
): string {
  const titleKey = route.meta.titleKey;
  const page = typeof titleKey === "string" ? t(titleKey) : "";

  if (ENTITY_FIRST_ROUTES.has(String(route.name))) {
    const entity =
      routeParam(route, "testName") ??
      routeParam(route, "runKey") ??
      routeParam(route, "projectName");
    if (entity) return `${entity} · ${page} · ${APP_NAME}`;
  }

  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}

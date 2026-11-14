import { describe, expect, it } from "vitest";

import router from "@/router/index";
import en from "@/i18n/messages/en.json";
import de from "@/i18n/messages/de.json";

// Route-table invariants. `authGuard` and the role guard have their own tests,
// and `gallery-coverage.test.ts` ties every route to a quality case — but the
// table itself was unguarded: nothing failed when a route shipped without a
// title, with a title key that does not exist, or (the dangerous one) as a
// public page. Every gap here is silent at runtime, which is why each assertion
// below names the failure it prevents.
//
// The view⇒spec half keeps the claim that justifies the coverage exclusion in
// `vite.config.ts` honest: views are allowed out of the Vitest denominator
// because a browser spec covers them, so every view must have one — or say here
// why not.

interface RouteMeta {
  requiresAuth?: boolean;
  requiresRole?: string;
  titleKey?: string;
}

const routes = router.getRoutes().map((route) => ({
  name: typeof route.name === "string" ? route.name : "",
  path: route.path,
  meta: (route.meta ?? {}) as RouteMeta,
}));

// Pages a signed-out visitor may reach. Listed with the reason so a new
// `requiresAuth: false` is a review decision, not a default that quietly ships.
const PUBLIC_ROUTES: Record<string, string> = {
  login: "the sign-in form itself",
  share: "a share link is what authenticates it; the visitor has no session",
  invite: "a one-time account link; the recipient has no credentials yet",
};

// The catch-all has no auth meta on purpose: the guard treats an absent flag as
// private, and the 404 is rendered inside the shell for a signed-in visitor.
const WITHOUT_AUTH_META = new Set(["not-found"]);

// Admin surfaces. `requiresRole` fails open when it is forgotten — the guard
// only checks the role *if* the meta declares one — so the set is pinned in
// both directions: declaring a role here, or declaring one without being here,
// both fail.
const ADMIN_ROUTES: Record<string, string> = {
  users: "user administration",
  "api-keys": "API-key issue and revocation",
  audit: "the audit trail and its export",
  "project-webhooks": "webhook endpoints and their signing secrets",
};

function lookup(messages: unknown, path: string): unknown {
  let node = messages;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const viewFiles = Object.keys(
  import.meta.glob(["../views/*.vue", "../views/**/*.vue"]),
);

const unitSpecFiles = Object.keys(import.meta.glob("./*.test.ts")).map(
  (file) => file.split("/").pop() ?? "",
);

const ctSources = Object.values(
  import.meta.glob("../../tests/ct/**/*.spec.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
);

// Views with neither a browser spec nor their own unit spec, each with the
// reason. Keep it accurate: the exclusion comment in `vite.config.ts` leans on
// this list staying short.
const WITHOUT_OWN_SPEC: Record<string, string> = {
  ForbiddenView:
    "A static 403 panel: it renders one message and a link back. The role and " +
    "auth-token branches that reach it are asserted in router-auth-guard.test.ts, " +
    "and its own quality case scans and photographs it in both themes.",
};

const viewNames = viewFiles.map((file) =>
  (file.split("/").pop() ?? "").replace(/\.vue$/, ""),
);

describe("route table", () => {
  it("declares a title key on every route", () => {
    const missing = routes
      .filter((route) => !route.meta.titleKey)
      .map((route) => route.name);

    expect(missing).toEqual([]);
  });

  it("points every title key at a message that exists in both locales", () => {
    const broken = routes
      .filter((route) => route.meta.titleKey)
      .flatMap((route) => {
        const key = route.meta.titleKey as string;
        const found = [en, de].map((messages) => lookup(messages, key));
        const ok = found.every(
          (value) => typeof value === "string" && value.trim() !== "",
        );
        return ok ? [] : [`${route.name} -> ${key}`];
      });

    expect(broken).toEqual([]);
  });

  it("only marks the documented routes public", () => {
    const declaredPublic = routes
      .filter((route) => route.meta.requiresAuth === false)
      .map((route) => route.name)
      .sort();

    expect(declaredPublic).toEqual(Object.keys(PUBLIC_ROUTES).sort());
  });

  it("requires a session on every route that is not public", () => {
    const unpinned = routes
      .filter(
        (route) =>
          !(route.name in PUBLIC_ROUTES) &&
          !WITHOUT_AUTH_META.has(route.name) &&
          route.meta.requiresAuth !== true,
      )
      .map((route) => route.name);

    expect(unpinned).toEqual([]);
  });

  it("guards exactly the documented admin routes with the ADMIN role", () => {
    const declaredAdmin = routes
      .filter((route) => route.meta.requiresRole !== undefined)
      .map((route) => route.name)
      .sort();

    expect(declaredAdmin).toEqual(Object.keys(ADMIN_ROUTES).sort());
    for (const route of routes) {
      if (route.meta.requiresRole === undefined) continue;
      expect(route.meta.requiresRole, route.name).toBe("ADMIN");
    }
  });

  it("names every route uniquely", () => {
    const names = routes.map((route) => route.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("");
  });
});

describe("view coverage", () => {
  it("gives every view either a browser spec or its own unit spec", () => {
    const uncovered = viewNames.filter(
      (view) =>
        !ctSources.some((source) => source.includes(`views/${view}/`)) &&
        !unitSpecFiles.some((file) => file.includes(view)) &&
        !(view in WITHOUT_OWN_SPEC),
    );

    expect(uncovered).toEqual([]);
  });

  it("does not excuse a view that no longer exists", () => {
    const stale = Object.keys(WITHOUT_OWN_SPEC).filter(
      (view) => !viewNames.includes(view),
    );

    expect(stale).toEqual([]);
  });

  it("states why each excused view has no spec of its own", () => {
    for (const [view, reason] of Object.entries(WITHOUT_OWN_SPEC)) {
      expect(reason.length, view).toBeGreaterThan(20);
    }
  });

  it("keeps the browser specs readable as a coverage source", () => {
    // A `mount("views/<View>/<Export>")` string is what the check above greps
    // for; if the CT suite ever mounts views another way, this fails instead of
    // silently reporting every view as uncovered.
    const mountsAView = ctSources.some((source) =>
      /mount\("views\//.test(source),
    );

    expect(mountsAView).toBe(true);
  });
});

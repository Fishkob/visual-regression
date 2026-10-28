import { describe, expect, it } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import { documentTitle } from "@/lib/document-title";

const messages: Record<string, string> = {
  "inbox.title": "Review inbox",
  "projects.title": "Projects",
  "nav.project": "Project",
  "nav.test": "Test",
  "nav.run": "Run",
  "runs.title": "Runs",
};

const t = (key: string): string => messages[key] ?? key;

function route(
  name: string,
  params: Record<string, string> = {},
  titleKey?: string,
): RouteLocationNormalized {
  return {
    name,
    params,
    meta: titleKey ? { titleKey } : {},
  } as unknown as RouteLocationNormalized;
}

describe("documentTitle", () => {
  it("prefixes a list page with its translated label", () => {
    expect(documentTitle(route("review-inbox", {}, "inbox.title"), t)).toBe(
      "Review inbox · Visual Regression",
    );
  });

  it("names the entity first on a project detail page", () => {
    expect(
      documentTitle(
        route("project-detail", { projectName: "checkout-ui" }, "nav.project"),
        t,
      ),
    ).toBe("checkout-ui · Project · Visual Regression");
  });

  it("prefers the test name over the project name", () => {
    expect(
      documentTitle(
        route(
          "test-detail",
          { projectName: "checkout-ui", testName: "login-form" },
          "nav.test",
        ),
        t,
      ),
    ).toBe("login-form · Test · Visual Regression");
  });

  it("falls back to the project when a detail route has no test name", () => {
    expect(
      documentTitle(
        route("project-runs", { projectName: "checkout-ui" }, "runs.title"),
        t,
      ),
    ).toBe("checkout-ui · Runs · Visual Regression");
  });

  it("uses the run key on a run detail page", () => {
    expect(
      documentTitle(
        route(
          "run-detail",
          { projectName: "checkout-ui", runKey: "ci-4821" },
          "nav.run",
        ),
        t,
      ),
    ).toBe("ci-4821 · Run · Visual Regression");
  });

  it("uses the app name when a route declares no title", () => {
    expect(documentTitle(route("mystery"), t)).toBe("Visual Regression");
  });

  it("stays on the page label when an entity-first route names no entity", () => {
    expect(documentTitle(route("test-detail", {}, "nav.test"), t)).toBe(
      "Test · Visual Regression",
    );
  });
});

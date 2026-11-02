import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRouteParams } from "@/composables/useRouteParams";

const mockRoute = {
  params: {} as Record<string, unknown>,
  query: {},
};

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
}));

describe("useRouteParams", () => {
  beforeEach(() => {
    mockRoute.params = {};
    mockRoute.query = {};
  });

  it("returns projectName from route params", () => {
    mockRoute.params = { projectName: "my-project" };

    const { projectName } = useRouteParams();

    expect(projectName.value).toBe("my-project");
  });

  it("returns testName from route params", () => {
    mockRoute.params = { testName: "login-form" };

    const { testName } = useRouteParams();

    expect(testName.value).toBe("login-form");
  });

  it("returns undefined for missing params", () => {
    mockRoute.params = {};

    const { projectName, testName } = useRouteParams();

    expect(projectName.value).toBeUndefined();
    expect(testName.value).toBeUndefined();
  });

  it("updates when route params change", () => {
    mockRoute.params = { projectName: "first-project" };
    const { projectName } = useRouteParams();
    expect(projectName.value).toBe("first-project");
  });

  it("handles non-string param values", () => {
    mockRoute.params = { projectName: 123 };

    const { projectName } = useRouteParams();

    expect(projectName.value).toBe(123);
  });

  it("maps the inbox scope keys to pending filters", () => {
    mockRoute.query = {
      inboxKind: "pdf",
      inboxQ: "cart",
      inboxRunKey: "ci-1",
      inboxTag: "smoke",
    };

    expect(useRouteParams().inboxFilters.value).toEqual({
      kind: "pdf",
      q: "cart",
      runKey: "ci-1",
      tag: "smoke",
    });
  });

  it("drops an unknown inbox kind and non-string filter values", () => {
    mockRoute.query = {
      inboxKind: "video",
      inboxQ: ["a", "b"],
      inboxTag: 42,
    };

    expect(useRouteParams().inboxFilters.value).toEqual({});
  });

  it("returns filters as a variant triple from query params", () => {
    mockRoute.query = {
      viewport: "1920x1080",
      browser: "chrome",
      environment: "staging",
    };

    const { filters } = useRouteParams();

    expect(filters.value).toEqual({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "staging",
    });
  });

  it("returns filters with undefined variant fields when query is empty", () => {
    const { filters } = useRouteParams();

    expect(filters.value).toEqual({
      viewport: undefined,
      browser: undefined,
      environment: undefined,
    });
  });

  it("narrows repeated query values to undefined", () => {
    mockRoute.query = {
      viewport: ["1920x1080", "1280x720"],
      browser: ["chrome"],
      environment: ["staging"],
    };

    const { filters } = useRouteParams();

    expect(filters.value).toEqual({
      viewport: undefined,
      browser: undefined,
      environment: undefined,
    });
  });

  it("narrows null query values to undefined", () => {
    mockRoute.query = { viewport: null, browser: null, environment: null };

    const { filters } = useRouteParams();

    expect(filters.value).toEqual({
      viewport: undefined,
      browser: undefined,
      environment: undefined,
    });
  });

  it("exposes fromInbox when the review was opened from the inbox", () => {
    mockRoute.query = { from: "inbox" };

    const { fromInbox } = useRouteParams();

    expect(fromInbox.value).toBe(true);
  });

  it("returns false when the review was not opened from the inbox", () => {
    const { fromInbox } = useRouteParams();

    expect(fromInbox.value).toBe(false);
  });

  it("exposes the branch from the query string", () => {
    mockRoute.query = { branch: "feature/x" };

    const { branch } = useRouteParams();

    expect(branch.value).toBe("feature/x");
  });

  it("returns undefined when the query carries no branch", () => {
    mockRoute.query = { branch: ["a", "b"] };

    const { branch } = useRouteParams();

    expect(branch.value).toBeUndefined();
  });

  it("exposes the my-reviews scope from the query string", () => {
    mockRoute.query = { assignedToMe: "1" };

    const { assignedToMe } = useRouteParams();

    expect(assignedToMe.value).toBe(true);
  });

  it("treats any other my-reviews spelling as off", () => {
    mockRoute.query = { assignedToMe: "true" };

    const { assignedToMe } = useRouteParams();

    expect(assignedToMe.value).toBe(false);
  });
});

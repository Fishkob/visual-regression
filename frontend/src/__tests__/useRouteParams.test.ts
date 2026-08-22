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
});

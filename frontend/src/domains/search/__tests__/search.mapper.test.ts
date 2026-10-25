import { describe, expect, it } from "vitest";
import type { SearchResultsDto } from "@sdk";
import {
  mapSearchBranch,
  mapSearchProject,
  mapSearchResults,
  mapSearchTest,
} from "../search.mapper";
import {
  branchSearchPath,
  isFavorite,
  isSearchResultItem,
  projectSearchPath,
  rememberRecent,
  searchResultItems,
  testSearchPath,
  toggleFavorite,
  type SearchResultItem,
} from "../search.model";

const resultsDto = (
  overrides: Partial<SearchResultsDto> = {},
): SearchResultsDto => ({
  query: "check",
  projects: [{ name: "checkout" }],
  tests: [
    {
      projectName: "checkout",
      branchName: "main",
      testName: "checkout-flow",
      kind: "image",
      status: "PENDING_APPROVAL",
    },
  ],
  branches: [
    { projectName: "checkout", branchName: "release", isDefault: false },
  ],
  ...overrides,
});

const item = (overrides: Partial<SearchResultItem> = {}): SearchResultItem => ({
  id: "/projects/checkout",
  kind: "project",
  label: "checkout",
  path: "/projects/checkout",
  ...overrides,
});

describe("mapSearchProject", () => {
  it("maps the name and tolerates a missing one", () => {
    expect(mapSearchProject({ name: "checkout" })).toEqual({
      name: "checkout",
    });
    expect(mapSearchProject({} as never)).toEqual({ name: "" });
  });
});

describe("mapSearchTest", () => {
  it("maps the test identity and kind", () => {
    expect(
      mapSearchTest({
        projectName: "checkout",
        branchName: "main",
        testName: "login",
        kind: "pdf",
        status: "APPROVED",
      }),
    ).toEqual({
      projectName: "checkout",
      branchName: "main",
      testName: "login",
      kind: "pdf",
      status: "APPROVED",
    });
  });

  it("drops an unknown kind", () => {
    const mapped = mapSearchTest({
      projectName: "checkout",
      branchName: "main",
      testName: "login",
      kind: "video" as never,
      status: "PENDING_APPROVAL",
    });

    expect(mapped.kind).toBeUndefined();
  });
});

describe("mapSearchBranch", () => {
  it("maps the default flag", () => {
    expect(
      mapSearchBranch({
        projectName: "checkout",
        branchName: "main",
        isDefault: true,
      }),
    ).toEqual({
      projectName: "checkout",
      branchName: "main",
      isDefault: true,
    });
    expect(
      mapSearchBranch({
        projectName: "checkout",
        branchName: "main",
      } as never).isDefault,
    ).toBe(false);
  });
});

describe("mapSearchResults", () => {
  it("maps the grouped payload and filters unnamed projects", () => {
    const results = mapSearchResults(
      resultsDto({
        projects: [{ name: "checkout" }, { name: "" }],
      }),
    );

    expect(results.query).toBe("check");
    expect(results.projects).toEqual([{ name: "checkout" }]);
    expect(results.tests).toHaveLength(1);
    expect(results.branches).toHaveLength(1);
  });

  it("maps a missing payload to empty groups", () => {
    expect(mapSearchResults(undefined)).toEqual({
      query: "",
      projects: [],
      tests: [],
      branches: [],
    });
  });
});

describe("search paths", () => {
  it("builds project, test and branch routes with encoded names", () => {
    expect(projectSearchPath("checkout ui")).toBe("/projects/checkout%20ui");
    expect(testSearchPath("checkout", "login flow", "feature/x")).toBe(
      "/projects/checkout/tests/login%20flow?branch=feature%2Fx",
    );
    expect(branchSearchPath("checkout", "feature/x")).toBe(
      "/projects/checkout?branch=feature%2Fx",
    );
  });
});

describe("searchResultItems", () => {
  it("flattens projects, tests then branches with labels and paths", () => {
    const items = searchResultItems(mapSearchResults(resultsDto()));

    expect(items.map((entry) => entry.kind)).toEqual([
      "project",
      "test",
      "branch",
    ]);
    expect(items[0]).toMatchObject({
      label: "checkout",
      path: "/projects/checkout",
    });
    expect(items[1]).toMatchObject({
      label: "checkout-flow",
      path: "/projects/checkout/tests/checkout-flow?branch=main",
    });
    expect(items[1].description).toContain("checkout · main");
    expect(items[1].description).toContain("Image");
    expect(items[2]).toMatchObject({
      label: "checkout · release",
      description: "Branch",
      path: "/projects/checkout?branch=release",
    });
  });
});

describe("recents and favorites", () => {
  it("remembers the newest five unique items", () => {
    const first = item({ id: "a", path: "/a", label: "a" });
    const second = item({ id: "b", path: "/b", label: "b" });
    const third = item({ id: "c", path: "/c", label: "c" });
    let recents: SearchResultItem[] = [];
    recents = rememberRecent(recents, first);
    recents = rememberRecent(recents, second);
    recents = rememberRecent(recents, third);
    recents = rememberRecent(recents, first);

    expect(recents.map((entry) => entry.id)).toEqual(["a", "c", "b"]);
  });

  it("caps the recent list", () => {
    let recents: SearchResultItem[] = [];
    for (let index = 0; index < 7; index += 1) {
      recents = rememberRecent(
        recents,
        item({ id: `id-${index}`, path: `/p/${index}`, label: `${index}` }),
      );
    }
    expect(recents).toHaveLength(5);
    expect(recents[0]?.id).toBe("id-6");
  });

  it("toggles a favorite on and off", () => {
    const favorite = item();
    expect(isFavorite([], favorite.id)).toBe(false);

    const favorites = toggleFavorite([], favorite);
    expect(isFavorite(favorites, favorite.id)).toBe(true);
    expect(toggleFavorite(favorites, favorite)).toEqual([]);
  });
});

describe("isSearchResultItem", () => {
  it("accepts a well-formed stored entry", () => {
    expect(isSearchResultItem(item())).toBe(true);
    expect(isSearchResultItem({ ...item(), description: "project" })).toBe(
      true,
    );
  });

  it("rejects corrupt or incomplete entries", () => {
    expect(isSearchResultItem(null)).toBe(false);
    expect(isSearchResultItem("checkout")).toBe(false);
    expect(isSearchResultItem({ ...item(), kind: "runs" })).toBe(false);
    expect(isSearchResultItem({ ...item(), path: "" })).toBe(false);
    expect(isSearchResultItem({ ...item(), label: 7 })).toBe(false);
  });
});

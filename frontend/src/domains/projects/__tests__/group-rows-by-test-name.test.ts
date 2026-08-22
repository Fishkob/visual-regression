import { describe, it, expect } from "vitest";
import {
  groupRowsByTestName,
  UNNAMED_TEST_LABEL,
} from "@/domains/projects/group-rows-by-test-name";
import type { VisualTestItem } from "@/domains/projects/project.model";

function row(overrides: Partial<VisualTestItem> = {}): VisualTestItem {
  return {
    name: "login-form",
    latestStatus: "UNCHANGED",
    ...overrides,
  };
}

describe("groupRowsByTestName", () => {
  it("reduces per-variant rows into distinct tests by name", () => {
    const groups = groupRowsByTestName([
      row(),
      row({ viewport: "1280x720" }),
      row({ name: "signup-form" }),
    ]);

    expect([...groups.keys()]).toEqual(["login-form", "signup-form"]);
    expect(groups.get("login-form")).toHaveLength(2);
    expect(groups.get("signup-form")).toHaveLength(1);
  });

  it("keeps insertion order of first occurrence", () => {
    const groups = groupRowsByTestName([
      row({ name: "b" }),
      row({ name: "a" }),
      row({ name: "b" }),
    ]);

    expect([...groups.keys()]).toEqual(["b", "a"]);
  });

  it("groups rows without a name under the unnamed label", () => {
    const groups = groupRowsByTestName([
      row({ name: undefined }),
      row({ name: undefined }),
      row(),
    ]);

    expect(groups.get(UNNAMED_TEST_LABEL)).toHaveLength(2);
    expect(groups.get("login-form")).toHaveLength(1);
  });

  it("returns an empty map for no rows", () => {
    const groups = groupRowsByTestName([]);

    expect(groups.size).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { groupProjectsByTeam } from "../group-projects-by-team";
import type { Project } from "../project.model";

// The list is sectioned by the owning team (ADR-084); within a section the
// busiest project comes first, because that is the one a reviewer opens.
const project = (overrides: Partial<Project> & { name: string }): Project => ({
  id: overrides.name,
  hasPendingTests: false,
  teamId: "t-1",
  teamName: "Checkout",
  isShared: false,
  ...overrides,
});

describe("groupProjectsByTeam", () => {
  it("sections by team name and sorts the sections alphabetically", () => {
    const sections = groupProjectsByTeam([
      project({ name: "admin-ui", teamId: "t-2", teamName: "Platform" }),
      project({ name: "checkout-ui" }),
    ]);

    expect(sections.map((section) => section.name)).toEqual([
      "Checkout",
      "Platform",
    ]);
    expect(sections[0].items.map((item) => item.name)).toEqual(["checkout-ui"]);
  });

  it("orders a section by pending count, then by name", () => {
    const sections = groupProjectsByTeam([
      project({ name: "b", pendingCount: 1 }),
      project({ name: "a", pendingCount: 3 }),
      project({ name: "c", pendingCount: 1 }),
      project({ name: "d" }),
    ]);

    expect(sections[0].items.map((item) => item.name)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("answers no sections for no projects", () => {
    expect(groupProjectsByTeam([])).toEqual([]);
  });
});

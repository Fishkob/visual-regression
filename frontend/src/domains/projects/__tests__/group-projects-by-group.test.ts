import { describe, expect, it } from "vitest";
import { groupProjectsByGroup } from "../group-projects-by-group";
import type { Project } from "../project.model";

const project = (overrides: Partial<Project>): Project => ({
  id: "p",
  name: "p",
  hasPendingTests: false,
  ...overrides,
});

describe("groupProjectsByGroup", () => {
  it("sorts groups alphabetically and puts Unassigned last", () => {
    const sections = groupProjectsByGroup([
      project({ id: "1", name: "b", groupId: "g2", groupName: "Beta" }),
      project({ id: "2", name: "u", groupId: null, groupName: null }),
      project({ id: "3", name: "a", groupId: "g1", groupName: "Alpha" }),
    ]);

    expect(sections.map((s) => s.name)).toEqual([
      "Alpha",
      "Beta",
      "Unassigned",
    ]);
  });

  it("labels projects without a group id as Unassigned even with a stale group name", () => {
    const sections = groupProjectsByGroup([
      project({ id: "1", name: "p", groupId: null, groupName: "Stale" }),
    ]);

    expect(sections[0].name).toBe("Unassigned");
  });

  it("falls back to the group id when the group name is missing", () => {
    const sections = groupProjectsByGroup([
      project({ id: "1", name: "p", groupId: "g1", groupName: null }),
    ]);

    expect(sections[0].name).toBe("g1");
  });

  it("gives the unassigned section a null id", () => {
    const sections = groupProjectsByGroup([
      project({ id: "1", name: "p", groupId: null, groupName: null }),
    ]);

    expect(sections[0].id).toBeNull();
  });

  it("sorts projects by pending count then name", () => {
    const sections = groupProjectsByGroup([
      project({
        id: "1",
        name: "z",
        groupId: "g1",
        groupName: "Alpha",
        pendingCount: 0,
      }),
      project({
        id: "2",
        name: "b",
        groupId: "g1",
        groupName: "Alpha",
        pendingCount: 2,
      }),
      project({
        id: "3",
        name: "a",
        groupId: "g1",
        groupName: "Alpha",
        pendingCount: 0,
      }),
    ]);

    expect(sections[0].items.map((p) => p.name)).toEqual(["b", "a", "z"]);
  });
});

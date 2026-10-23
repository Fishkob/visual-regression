import { describe, expect, it } from "vitest";
import type { ProjectGroupDto } from "@sdk";
import { mapProjectGroup, mapProjectGroups } from "../group.mapper";

const groupDto = (
  overrides: Partial<ProjectGroupDto> = {},
): ProjectGroupDto => ({
  id: "g1",
  name: "Checkout",
  createdAt: "2026-10-20T10:00:00.000Z",
  projectCount: 0,
  ...overrides,
});

describe("group mapper", () => {
  it("maps a group DTO", () => {
    expect(mapProjectGroup(groupDto({ projectCount: 3 }))).toEqual({
      id: "g1",
      name: "Checkout",
      createdAt: "2026-10-20T10:00:00.000Z",
      projectCount: 3,
    });
  });

  it("defaults projectCount to 0 and omits missing createdAt", () => {
    expect(
      mapProjectGroup(
        groupDto({ createdAt: undefined, projectCount: undefined }),
      ),
    ).toEqual({
      id: "g1",
      name: "Checkout",
      projectCount: 0,
    });
  });

  it("maps an undefined list to an empty list", () => {
    expect(mapProjectGroups(undefined)).toEqual([]);
  });
});

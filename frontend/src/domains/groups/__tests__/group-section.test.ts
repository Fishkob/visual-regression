import { describe, expect, it } from "vitest";
import {
  buildGroupSections,
  resolveGroupIdentity,
  UNASSIGNED_GROUP_KEY,
  UNASSIGNED_GROUP_LABEL,
} from "../group-section";

interface Item {
  name: string;
  groupId?: string | null;
  groupName?: string | null;
}

const item = (overrides: Partial<Item>): Item => ({
  name: "item",
  ...overrides,
});

describe("resolveGroupIdentity", () => {
  it("labels an unassigned item with the shared sentinel", () => {
    const identity = resolveGroupIdentity({
      groupId: null,
      groupName: "Stale",
    });

    expect(identity).toEqual({
      id: null,
      key: UNASSIGNED_GROUP_KEY,
      name: UNASSIGNED_GROUP_LABEL,
      isUnassigned: true,
    });
  });

  it("uses the group name for an assigned item", () => {
    const identity = resolveGroupIdentity({
      groupId: "g1",
      groupName: "Checkout",
    });

    expect(identity).toEqual({
      id: "g1",
      key: "g1",
      name: "Checkout",
      isUnassigned: false,
    });
  });

  it("falls back to the group id when the name is missing", () => {
    const identity = resolveGroupIdentity({ groupId: "g1", groupName: null });

    expect(identity.name).toBe("g1");
  });
});

describe("buildGroupSections", () => {
  const groupOf = (value: Item) => value;

  it("sorts assigned groups alphabetically and Unassigned last", () => {
    const sections = buildGroupSections({
      items: [
        item({ name: "b", groupId: "g2", groupName: "Beta" }),
        item({ name: "u", groupId: null }),
        item({ name: "a", groupId: "g1", groupName: "Alpha" }),
      ],
      groupOf,
    });

    expect(sections.map((section) => section.name)).toEqual([
      "Alpha",
      "Beta",
      "Unassigned",
    ]);
    expect(sections[sections.length - 1].key).toBe(UNASSIGNED_GROUP_KEY);
  });

  it("groups by id rather than display name", () => {
    const sections = buildGroupSections({
      items: [
        item({ name: "assigned", groupId: "g1", groupName: "Unassigned" }),
        item({ name: "unassigned", groupId: null }),
      ],
      groupOf,
    });

    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe("g1");
    expect(sections[1].id).toBeNull();
  });

  it("applies the per-domain item sort without mutating the input", () => {
    const input = [
      item({ name: "z", groupId: "g1", groupName: "Alpha" }),
      item({ name: "a", groupId: "g1", groupName: "Alpha" }),
    ];

    const sections = buildGroupSections({
      items: input,
      groupOf,
      sortItems: (a, b) => a.name.localeCompare(b.name),
    });

    expect(sections[0].items.map((value) => value.name)).toEqual(["a", "z"]);
    expect(input.map((value) => value.name)).toEqual(["z", "a"]);
  });
});

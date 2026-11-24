import { describe, expect, it } from "vitest";
import { buildTeamSections, resolveTeamIdentity } from "../team-section";

interface Row {
  id: string;
  teamId: string;
  teamName: string;
}

const row = (overrides: Partial<Row> & { id: string }): Row => ({
  teamId: "t-1",
  teamName: "Checkout",
  ...overrides,
});

describe("resolveTeamIdentity", () => {
  it("takes the id and the name from the row", () => {
    expect(
      resolveTeamIdentity({ teamId: "t-1", teamName: "Checkout" }),
    ).toEqual({ id: "t-1", name: "Checkout" });
  });

  // The owner is mandatory (ADR-083), so an empty name is a stale payload, not a
  // state. A section header has to render something a reader can act on.
  it("names an unnamed team instead of rendering an empty header", () => {
    expect(resolveTeamIdentity({ teamId: "t-1", teamName: "" })).toEqual({
      id: "t-1",
      name: "Unknown team",
    });
  });
});

describe("buildTeamSections", () => {
  it("groups the rows into one section per team, sorted by name", () => {
    const sections = buildTeamSections({
      items: [
        row({ id: "a", teamId: "t-2", teamName: "Platform" }),
        row({ id: "b", teamId: "t-1", teamName: "Checkout" }),
        row({ id: "c", teamId: "t-2", teamName: "Platform" }),
      ],
      teamOf: (item) => item,
    });

    expect(sections.map((section) => [section.key, section.name])).toEqual([
      ["t-1", "Checkout"],
      ["t-2", "Platform"],
    ]);
    expect(sections[1].items.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("keeps the input order when no sort is given", () => {
    const sections = buildTeamSections({
      items: [row({ id: "z" }), row({ id: "a" })],
      teamOf: (item) => item,
    });

    expect(sections[0].items.map((item) => item.id)).toEqual(["z", "a"]);
  });

  it("sorts inside a section without reordering the sections", () => {
    const sections = buildTeamSections({
      items: [
        row({ id: "b", teamId: "t-2", teamName: "Platform" }),
        row({ id: "a", teamId: "t-1", teamName: "Checkout" }),
        row({ id: "c", teamId: "t-2", teamName: "Platform" }),
      ],
      teamOf: (item) => item,
      sortItems: (left, right) => left.id.localeCompare(right.id),
    });

    expect(sections.map((section) => section.name)).toEqual([
      "Checkout",
      "Platform",
    ]);
    expect(sections[1].items.map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("answers no sections for no rows", () => {
    expect(
      buildTeamSections<Row>({ items: [], teamOf: (item) => item }),
    ).toEqual([]);
  });
});

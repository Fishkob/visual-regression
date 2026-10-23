import { describe, it, expect } from "vitest";
import { mapProject, mapProjects } from "../project.mapper";

describe("mapProject", () => {
  it("uses pending flag when visualTests is absent", () => {
    const result = mapProject({ id: "1", name: "p", pending: true });
    expect(result.hasPendingTests).toBe(true);
    expect(result.name).toBe("p");
  });

  it("returns hasPendingTests false when pending is false", () => {
    const result = mapProject({ id: "1", name: "p", pending: false });
    expect(result.hasPendingTests).toBe(false);
  });

  it("falls back to visualTests when pending is absent", () => {
    const result = mapProject({
      id: "1",
      name: "p",
      visualTests: [{ name: "t", latestStatus: "PENDING_APPROVAL" }],
    });
    expect(result.hasPendingTests).toBe(true);
  });

  it("returns hasPendingTests false when visualTests have no pending", () => {
    const result = mapProject({
      id: "1",
      name: "p",
      visualTests: [{ name: "t", latestStatus: "UNCHANGED" }],
    });
    expect(result.hasPendingTests).toBe(false);
  });

  it("handles undefined visualTests and no pending flag", () => {
    const result = mapProject({ id: "1", name: "p" });
    expect(result.hasPendingTests).toBe(false);
  });

  it("pending flag takes precedence over visualTests", () => {
    const result = mapProject({
      id: "1",
      name: "p",
      pending: false,
      visualTests: [{ name: "t", latestStatus: "PENDING_APPROVAL" }],
    });
    expect(result.hasPendingTests).toBe(false);
  });

  it("maps testCount from distinct visualTest names", () => {
    const result = mapProject({
      id: "1",
      name: "p",
      visualTests: [{ name: "t1" }, { name: "t2" }],
    });
    expect(result.testCount).toBe(2);
  });

  it("defaults testCount to 0 when visualTests is absent", () => {
    const result = mapProject({ id: "1", name: "p", pending: true });
    expect(result.testCount).toBe(0);
  });

  it("counts distinct test names rather than visualTest rows", () => {
    const result = mapProject({
      id: "1",
      name: "p",
      visualTests: [{ name: "t1" }, { name: "t1" }, { name: "t2" }],
    });
    expect(result.testCount).toBe(2);
  });

  it("uses dto.testCount over the visualTests fallback", () => {
    const result = mapProject({
      id: "1",
      name: "p",
      testCount: 7,
      visualTests: [{ name: "t1" }, { name: "t2" }],
    });
    expect(result.testCount).toBe(7);
  });

  it("counts actual pending rows when dto.pendingCount is absent", () => {
    const result = mapProject({
      id: "1",
      name: "p",
      visualTests: [
        { name: "t1", latestStatus: "PENDING_APPROVAL" },
        { name: "t2", latestStatus: "PENDING_APPROVAL" },
        { name: "t3", latestStatus: "UNCHANGED" },
      ],
    });
    expect(result.pendingCount).toBe(2);
  });

  it("falls back to 1/0 for pendingCount when visualTests is absent", () => {
    expect(mapProject({ id: "1", name: "p", pending: true }).pendingCount).toBe(
      1,
    );
    expect(
      mapProject({ id: "1", name: "p", pending: false }).pendingCount,
    ).toBe(0);
  });

  it("maps group and counts", () => {
    const result = mapProject({
      id: "1",
      name: "p",
      groupId: "g1",
      groupName: "Checkout",
      pendingCount: 2,
      testCount: 5,
    });
    expect(result).toMatchObject({
      groupId: "g1",
      groupName: "Checkout",
      pendingCount: 2,
      testCount: 5,
    });
  });
});

describe("mapProjects", () => {
  it("maps an array of projects", () => {
    const results = mapProjects([
      { id: "1", name: "a", pending: true },
      { id: "2", name: "b", pending: false },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].hasPendingTests).toBe(true);
    expect(results[1].hasPendingTests).toBe(false);
  });

  it("returns empty array for undefined input", () => {
    expect(mapProjects(undefined)).toEqual([]);
  });
});

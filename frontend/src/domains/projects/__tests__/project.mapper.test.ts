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

  it("maps inherited test metadata", () => {
    const project = mapProject({
      name: "app",
      branchName: "feature/x",
      defaultBranchName: "main",
      visualTests: [
        {
          name: "login",
          kind: "image",
          variant: {
            viewport: "1920x1080",
            browser: "chromium",
            environment: "staging",
          },
          latestStatus: "UNCHANGED",
          origin: "inherited",
          inheritedFrom: "main",
        },
      ],
    });

    expect(project.branchName).toBe("feature/x");
    expect(project.defaultBranchName).toBe("main");
    expect(project.visualTests?.[0].origin).toBe("inherited");
    expect(project.visualTests?.[0].inheritedFrom).toBe("main");
  });

  it("leaves origin off a branch-owned test", () => {
    const project = mapProject({
      id: "1",
      name: "p",
      visualTests: [{ name: "t", origin: "branch" }],
    });

    expect(project.visualTests?.[0].origin).toBe("branch");
    expect(project.visualTests?.[0].inheritedFrom).toBeUndefined();
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

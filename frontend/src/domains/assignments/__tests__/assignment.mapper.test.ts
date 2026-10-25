import { describe, expect, it } from "vitest";
import type { AssignmentDto } from "@sdk";
import {
  mapAssignment,
  mapAssignments,
  type AssignmentSource,
} from "../assignment.mapper";
import {
  isOpenAssignment,
  matchesAssignmentScope,
  type Assignment,
} from "../assignment.model";

const dto = (overrides: Partial<AssignmentSource> = {}): AssignmentSource => ({
  id: "a-1",
  projectName: "checkout",
  branchName: "main",
  testName: "login",
  testKind: "image",
  runKey: null,
  assigneeUsername: "alice",
  assignedBy: "bob",
  dueAt: "2026-10-08T10:00:00.000Z",
  completedAt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  isOverdue: false,
  ...overrides,
});

describe("mapAssignment", () => {
  it("maps every field", () => {
    expect(mapAssignment(dto())).toEqual({
      id: "a-1",
      projectName: "checkout",
      branchName: "main",
      testName: "login",
      testKind: "image",
      runKey: null,
      assigneeUsername: "alice",
      assignedBy: "bob",
      dueAt: "2026-10-08T10:00:00.000Z",
      completedAt: null,
      createdAt: "2026-10-01T10:00:00.000Z",
      isOverdue: false,
    });
  });

  it("drops an unknown kind and defaults optional fields", () => {
    const mapped = mapAssignment({
      id: "a-2",
      projectName: "checkout",
      assigneeUsername: "alice",
      assignedBy: "bob",
      testKind: "video",
      isOverdue: true,
    } as unknown as AssignmentSource);

    expect(mapped?.testKind).toBeUndefined();
    expect(mapped?.branchName).toBeNull();
    expect(mapped?.dueAt).toBeNull();
    expect(mapped?.createdAt).toBe("");
    expect(mapped?.isOverdue).toBe(true);
  });

  it("maps lists and keeps 'not loaded' distinct", () => {
    expect(mapAssignments([dto()])).toHaveLength(1);
    expect(mapAssignments(undefined)).toEqual([]);
    expect(mapAssignment(undefined)).toBeUndefined();
  });
});

describe("assignment helpers", () => {
  const assignment = mapAssignment(dto()) as Assignment;

  it("treats a completed assignment as closed", () => {
    expect(isOpenAssignment(assignment)).toBe(true);
    expect(
      isOpenAssignment(mapAssignment(dto({ completedAt: "2026-10-02" }))!),
    ).toBe(false);
  });

  it("matches the project/test/branch scope, with default branch as null", () => {
    expect(
      matchesAssignmentScope(assignment, {
        projectName: "checkout",
        testName: "login",
        branch: "main",
      }),
    ).toBe(true);
    expect(
      matchesAssignmentScope(mapAssignment(dto({ branchName: null }))!, {
        projectName: "checkout",
        testName: "login",
      }),
    ).toBe(true);
    expect(
      matchesAssignmentScope(assignment, {
        projectName: "checkout",
        testName: "other",
      }),
    ).toBe(false);
  });

  it("accepts the generated DTO shape", () => {
    expect(mapAssignment(dto())?.testKind).toBe("image");
    expect(mapAssignment({} as AssignmentDto)?.id).toBe("");
  });
});

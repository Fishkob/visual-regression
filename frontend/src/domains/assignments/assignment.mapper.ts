import type { AssignmentDto } from "@sdk";
import { isTestKind, type TestKind } from "@/domains/test-kind";
import type { Assignment } from "./assignment.model";

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function kind(value: unknown): TestKind | undefined {
  return typeof value === "string" && isTestKind(value) ? value : undefined;
}

export type AssignmentSource = Omit<AssignmentDto, "testKind"> & {
  testKind?: unknown;
};

export function mapAssignment(
  dto: AssignmentSource | undefined,
): Assignment | undefined {
  if (!dto) return undefined;
  const testKind = kind(dto.testKind);
  return {
    id: dto.id ?? "",
    projectName: dto.projectName ?? "",
    branchName: text(dto.branchName),
    testName: text(dto.testName),
    ...(testKind ? { testKind } : {}),
    runKey: text(dto.runKey),
    assigneeUsername: dto.assigneeUsername ?? "",
    assignedBy: dto.assignedBy ?? "",
    dueAt: text(dto.dueAt),
    completedAt: text(dto.completedAt),
    createdAt: text(dto.createdAt) ?? "",
    isOverdue: dto.isOverdue === true,
  };
}

export function mapAssignments(
  dtos: AssignmentSource[] | undefined,
): Assignment[] {
  return (dtos ?? [])
    .map((dto) => mapAssignment(dto))
    .filter((assignment): assignment is Assignment => assignment !== undefined);
}

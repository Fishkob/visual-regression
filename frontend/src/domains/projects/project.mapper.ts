import type { Project, VisualTestItem } from "./project.model";
import type { ProjectDto, VisualTestDto } from "@sdk";
import { isPendingApproval } from "@/domains/test-status";
import { isTestKind } from "@/domains/test-kind";

function mapVisualTest(dto: VisualTestDto): VisualTestItem {
  return {
    name: dto.name,
    kind: isTestKind(dto.kind) ? dto.kind : undefined,
    ...(dto.variant ?? {}),
    latestStatus: dto.latestStatus,
  };
}

export function mapProject(dto: ProjectDto): Project {
  const visualTests = (dto.visualTests ?? []).map(mapVisualTest);
  const hasPending =
    dto.pending ?? visualTests.some((t) => isPendingApproval(t.latestStatus));
  const testCount =
    dto.testCount ??
    (dto.visualTests
      ? new Set(dto.visualTests.map((t) => t.name ?? "")).size
      : 0);
  const pendingCount =
    dto.pendingCount ??
    (dto.visualTests
      ? visualTests.filter((t) => isPendingApproval(t.latestStatus)).length
      : hasPending
        ? 1
        : 0);

  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    hasPendingTests: hasPending,
    groupId: dto.groupId ?? null,
    groupName: dto.groupName ?? null,
    pendingCount,
    testCount,
    visualTests,
    createdAt: dto.createdAt,
  };
}

export function mapProjects(dtOs: ProjectDto[] = []): Project[] {
  return dtOs.map(mapProject);
}

import type { ProjectGroupDto } from "@sdk";
import type { ProjectGroup } from "./group.model";

export function mapProjectGroup(dto: ProjectGroupDto): ProjectGroup {
  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    ...(dto.createdAt ? { createdAt: dto.createdAt } : {}),
    projectCount: dto.projectCount ?? 0,
  };
}

export function mapProjectGroups(
  dtos: ProjectGroupDto[] | undefined = [],
): ProjectGroup[] {
  return dtos.map(mapProjectGroup);
}

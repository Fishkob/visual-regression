import type { Project } from "./project.model";
import {
  buildGroupSections,
  type GroupSection,
} from "@/domains/groups/group-section";

export type ProjectGroupSection = GroupSection<Project>;

export function groupProjectsByGroup(
  projects: readonly Project[],
): ProjectGroupSection[] {
  return buildGroupSections({
    items: projects,
    groupOf: (project) => project,
    sortItems: (a, b) =>
      (b.pendingCount ?? 0) - (a.pendingCount ?? 0) ||
      a.name.localeCompare(b.name),
  });
}

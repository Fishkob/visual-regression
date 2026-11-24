import type { Project } from "./project.model";
import {
  buildTeamSections,
  type TeamSection,
} from "@/domains/teams/team-section";

export type ProjectTeamSection = TeamSection<Project>;

// The project list is sectioned by the owning team: since ADR-083 that is the
// one axis every project has, and since ADR-084 it is the only one.
export function groupProjectsByTeam(
  projects: readonly Project[],
): ProjectTeamSection[] {
  return buildTeamSections({
    items: projects,
    teamOf: (project) => project,
    sortItems: (a, b) =>
      (b.pendingCount ?? 0) - (a.pendingCount ?? 0) ||
      a.name.localeCompare(b.name),
  });
}

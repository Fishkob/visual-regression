import type { TeamDto, TeamMemberDto, ProjectTeamDto } from "@sdk";
import type {
  ProjectTeamAssignment,
  Team,
  TeamMember,
  TeamProject,
} from "./team.model";

const ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;
type WireRole = (typeof ROLES)[number];

// An unknown role from a newer backend must not reach the permission helpers as
// an arbitrary string: it degrades to the least privileged one.
function mapRole(role: unknown): WireRole {
  return ROLES.find((candidate) => candidate === role) ?? "VIEWER";
}

function mapMember(dto: TeamMemberDto): TeamMember {
  return {
    userId: String(dto.userId ?? ""),
    username: dto.username ?? "",
    role: mapRole(dto.role),
  };
}

function mapProject(
  dto: NonNullable<TeamDto["projects"]>[number],
): TeamProject {
  return { id: String(dto.id ?? ""), name: dto.name ?? "" };
}

export function mapTeam(dto: TeamDto): Team {
  return {
    id: String(dto.id ?? ""),
    name: dto.name ?? "",
    createdBy: dto.createdBy ?? null,
    createdAt: dto.createdAt ?? null,
    members: (dto.members ?? []).map(mapMember),
    projects: (dto.projects ?? []).map(mapProject),
  };
}

export function mapTeams(dtos: TeamDto[] | undefined = []): Team[] {
  return dtos.map(mapTeam);
}

export function mapProjectTeamAssignment(
  dto: ProjectTeamDto,
): ProjectTeamAssignment {
  return {
    projectId: String(dto.projectId ?? ""),
    projectName: dto.projectName ?? "",
    teamId: dto.teamId ?? null,
    teamName: dto.teamName ?? null,
  };
}

// Which team owns a project, read from the team list the admin already loaded.
// A project appears in at most one team's `projects`, so the first match is the
// answer, and "no match" is the shared state rather than an error.
export function teamOfProject(
  teams: readonly Team[],
  projectName: string,
): Team | null {
  return (
    teams.find((team) =>
      team.projects.some((project) => project.name === projectName),
    ) ?? null
  );
}

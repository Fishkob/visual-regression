// A team owns projects (ADR-082). `null` on a project means "shared": every
// authenticated principal keeps seeing it, which is the state a project is in
// until an admin assigns it.
export interface TeamProject {
  id: string;
  name: string;
}

export interface TeamMember {
  userId: string;
  username: string;
  role: "ADMIN" | "MEMBER" | "VIEWER";
}

export interface Team {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string | null;
  members: TeamMember[];
  projects: TeamProject[];
}

export interface ProjectTeamAssignment {
  projectId: string;
  projectName: string;
  teamId: string | null;
  teamName: string | null;
}

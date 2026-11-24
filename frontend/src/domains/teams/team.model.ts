// A team owns projects (ADR-082). Every project has exactly one owner (ADR-083);
// "visible to everyone" is a flag on the project, not the absence of one.
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
  teamId: string;
  teamName: string;
}

// The shape the "new project" dialog needs: a team the caller may name as the
// owner. A MEMBER's options are its own teams, an ADMIN's are all of them.
export interface TeamChoice {
  id: string;
  name: string;
}

import type { ReviewInboxItem } from "./review-inbox.model";
import {
  buildTeamSections,
  resolveTeamIdentity,
  type TeamSection,
} from "@/domains/teams/team-section";

export interface InboxProjectSection {
  projectName: string;
  teamId: string;
  teamName: string;
  items: ReviewInboxItem[];
}

export type InboxTeamSection = TeamSection<InboxProjectSection>;

// The inbox is sectioned by the owning team (ADR-084): the header states who is
// responsible for the block, and the separate team *lens* narrows the page
// itself. Those answer different questions, which is why both exist.
export function groupReviewInbox(
  items: readonly ReviewInboxItem[],
): InboxTeamSection[] {
  const projects = new Map<string, InboxProjectSection>();

  for (const item of items) {
    const project = projects.get(item.projectName) ?? {
      projectName: item.projectName,
      teamId: item.teamId,
      teamName: resolveTeamIdentity(item).name,
      items: [],
    };
    project.items.push(item);
    projects.set(item.projectName, project);
  }

  for (const project of projects.values()) {
    project.items.sort(compareInboxItems);
  }

  return buildTeamSections({
    items: [...projects.values()],
    teamOf: (project) => project,
    sortItems: (a, b) =>
      new Date(a.items[0]?.createdAt ?? 0).getTime() -
        new Date(b.items[0]?.createdAt ?? 0).getTime() ||
      a.projectName.localeCompare(b.projectName),
  });
}

function compareInboxItems(a: ReviewInboxItem, b: ReviewInboxItem): number {
  return (
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
    a.comparisonId.localeCompare(b.comparisonId)
  );
}

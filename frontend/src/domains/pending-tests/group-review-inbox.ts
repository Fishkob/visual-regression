import type { ReviewInboxItem } from "./review-inbox.model";
import {
  buildGroupSections,
  resolveGroupIdentity,
  type GroupSection,
} from "@/domains/groups/group-section";

export interface InboxProjectSection {
  projectName: string;
  groupId: string | null;
  groupName: string;
  items: ReviewInboxItem[];
}

export type InboxGroupSection = GroupSection<InboxProjectSection>;

export function groupReviewInbox(
  items: readonly ReviewInboxItem[],
): InboxGroupSection[] {
  const projects = new Map<string, InboxProjectSection>();

  for (const item of items) {
    const project = projects.get(item.projectName) ?? {
      projectName: item.projectName,
      groupId: item.groupId ?? null,
      groupName: resolveGroupIdentity(item).name,
      items: [],
    };
    project.items.push(item);
    projects.set(item.projectName, project);
  }

  for (const project of projects.values()) {
    project.items.sort(compareInboxItems);
  }

  return buildGroupSections({
    items: [...projects.values()],
    groupOf: (project) => project,
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

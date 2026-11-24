import { translateMessage as tm } from "@/lib/i18n-messages";

// The one section builder the two lists share (ADR-084). Both the project list
// and the review inbox section by the owning team, so "which block does this
// row belong to" and "why may I see it" are the same answer. There is no
// "Unassigned" section: every project has an owner (ADR-083), so a section
// without a name would be a state the API cannot produce.
export interface TeamRef {
  teamId: string;
  teamName: string;
}

export interface TeamSection<T> {
  id: string;
  key: string;
  name: string;
  items: T[];
}

export function resolveTeamIdentity(ref: TeamRef): {
  id: string;
  name: string;
} {
  return {
    id: ref.teamId,
    name: ref.teamName || tm("teams.unknownName"),
  };
}

export function buildTeamSections<T>(input: {
  items: readonly T[];
  teamOf: (item: T) => TeamRef;
  sortItems?: (a: T, b: T) => number;
}): TeamSection<T>[] {
  const sections = new Map<string, TeamSection<T>>();

  for (const item of input.items) {
    const identity = resolveTeamIdentity(input.teamOf(item));
    const section = sections.get(identity.id) ?? {
      id: identity.id,
      key: identity.id,
      name: identity.name,
      items: [],
    };
    section.items.push(item);
    sections.set(identity.id, section);
  }

  return [...sections.values()]
    .map((section) => ({
      ...section,
      items: input.sortItems
        ? [...section.items].sort(input.sortItems)
        : section.items,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

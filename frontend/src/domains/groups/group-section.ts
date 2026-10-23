export const UNASSIGNED_GROUP_KEY = "__unassigned__";
export const UNASSIGNED_GROUP_LABEL = "Unassigned";
export const UNASSIGNED_GROUP_QUERY = "unassigned";

export interface GroupIdentity {
  id: string | null;
  key: string;
  name: string;
  isUnassigned: boolean;
}

export interface GroupSection<T> {
  id: string | null;
  key: string;
  name: string;
  items: T[];
}

export function resolveGroupIdentity(ref: {
  groupId?: string | null;
  groupName?: string | null;
}): GroupIdentity {
  const id = ref.groupId ?? null;
  if (id === null) {
    return {
      id: null,
      key: UNASSIGNED_GROUP_KEY,
      name: UNASSIGNED_GROUP_LABEL,
      isUnassigned: true,
    };
  }
  return {
    id,
    key: id,
    name: ref.groupName ?? id,
    isUnassigned: false,
  };
}

export function buildGroupSections<T>(input: {
  items: readonly T[];
  groupOf: (item: T) => { groupId?: string | null; groupName?: string | null };
  sortItems?: (a: T, b: T) => number;
}): GroupSection<T>[] {
  const sections = new Map<string, GroupSection<T>>();

  for (const item of input.items) {
    const identity = resolveGroupIdentity(input.groupOf(item));
    const section = sections.get(identity.key) ?? {
      id: identity.id,
      key: identity.key,
      name: identity.name,
      items: [],
    };
    section.items.push(item);
    sections.set(identity.key, section);
  }

  return [...sections.values()]
    .map((section) => ({
      ...section,
      items: input.sortItems
        ? [...section.items].sort(input.sortItems)
        : section.items,
    }))
    .sort(compareGroupSections);
}

function compareGroupSections(
  a: { id: string | null; name: string },
  b: { id: string | null; name: string },
): number {
  if (a.id === null) return 1;
  if (b.id === null) return -1;
  return a.name.localeCompare(b.name);
}

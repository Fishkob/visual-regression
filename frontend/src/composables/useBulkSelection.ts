import { computed, ref } from "vue";

// Selection state shared by the inbox and the project list: the two pages pick
// rows for a bulk action with the same rules (toggle one, select the page,
// clear, and prune ids that left the list). Keeping it here stops the two views
// from growing slightly different selection semantics.
export function useBulkSelection() {
  const selectedIds = ref<string[]>([]);

  const count = computed(() => selectedIds.value.length);

  function isSelected(id: string): boolean {
    return selectedIds.value.includes(id);
  }

  function toggle(id: string): void {
    selectedIds.value = isSelected(id)
      ? selectedIds.value.filter((selected) => selected !== id)
      : [...selectedIds.value, id];
  }

  function selectAll(ids: readonly string[]): void {
    selectedIds.value = [...new Set(ids)];
  }

  function clear(): void {
    selectedIds.value = [];
  }

  // A refetch, a page change or a filter can remove rows; a stale id must never
  // be submitted by a later bulk action.
  function prune(available: readonly string[]): void {
    const allowed = new Set(available);
    selectedIds.value = selectedIds.value.filter((id) => allowed.has(id));
  }

  return { selectedIds, count, isSelected, toggle, selectAll, clear, prune };
}

import { describe, expect, it } from "vitest";
import { useBulkSelection } from "@/composables/useBulkSelection";

describe("useBulkSelection", () => {
  it("toggles an id on and off", () => {
    const selection = useBulkSelection();

    selection.toggle("a");
    expect(selection.isSelected("a")).toBe(true);
    expect(selection.count.value).toBe(1);

    selection.toggle("a");
    expect(selection.isSelected("a")).toBe(false);
    expect(selection.count.value).toBe(0);
  });

  it("selects a page of ids and deduplicates them", () => {
    const selection = useBulkSelection();

    selection.selectAll(["a", "b", "a"]);

    expect(selection.selectedIds.value).toEqual(["a", "b"]);
  });

  it("clears the selection", () => {
    const selection = useBulkSelection();
    selection.selectAll(["a", "b"]);

    selection.clear();

    expect(selection.selectedIds.value).toEqual([]);
  });

  it("prunes ids that left the list", () => {
    const selection = useBulkSelection();
    selection.selectAll(["a", "b", "c"]);

    selection.prune(["a", "c", "d"]);

    expect(selection.selectedIds.value).toEqual(["a", "c"]);
  });
});

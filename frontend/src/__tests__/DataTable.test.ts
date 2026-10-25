import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import DataTable from "@/components/ui/table/DataTable.vue";

const columns = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "status", header: "Status" },
  { id: "actions", header: "", enableSorting: false },
];

const rows = [
  { id: "1", name: "Beta", status: "OK" },
  { id: "2", name: "Alpha", status: "FAIL" },
];

describe("DataTable", () => {
  it("renders skeleton rows when loading and no data", () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        data: [],
        loading: true,
      },
    });
    const skeletonRows = wrapper.findAll('[data-testid="skeleton-row"]');
    expect(skeletonRows.length).toBe(6);
  });

  it("renders real rows when not loading", () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        data: [{ id: "1", name: "Test", status: "OK" }],
        loading: false,
      },
    });
    expect(wrapper.findAll('[data-testid="table-row"]').length).toBe(1);
    expect(wrapper.findAll('[data-testid="skeleton-row"]').length).toBe(0);
  });

  it("renders real rows when loading but data exists (background refresh)", () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        data: [{ id: "1", name: "Test", status: "OK" }],
        loading: true,
      },
    });
    expect(wrapper.findAll('[data-testid="table-row"]').length).toBe(1);
    expect(wrapper.findAll('[data-testid="skeleton-row"]').length).toBe(0);
  });

  it("uses the theme-aware card background instead of a hard-coded light color", () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        data: [],
        loading: false,
      },
    });
    expect(wrapper.classes()).toContain("bg-card");
    expect(wrapper.classes()).not.toContain("bg-white");
  });

  it("renders nothing when not loading and no data", () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        data: [],
        loading: false,
      },
    });
    // Header should still render
    expect(wrapper.findAll('[data-testid="table-header-row"]').length).toBe(1);
    // No body rows
    expect(wrapper.findAll('[data-testid="skeleton-row"]').length).toBe(0);
    expect(wrapper.findAll('[data-testid="table-row"]').length).toBe(0);
  });

  it("sorts from a focusable header button and tracks the state in aria-sort", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        data: rows,
      },
    });

    const [nameHeader, , actionsHeader] = wrapper.findAll(
      '[data-testid="table-header-cell"]',
    );
    const sortButton = nameHeader.find("button");

    expect(sortButton.element.tagName).toBe("BUTTON");
    expect(sortButton.attributes("type")).toBe("button");
    expect(actionsHeader.find("button").exists()).toBe(false);
    expect(actionsHeader.attributes("aria-sort")).toBeUndefined();
    expect(nameHeader.attributes("aria-sort")).toBe("none");

    await sortButton.trigger("click");
    expect(nameHeader.attributes("aria-sort")).toBe("ascending");

    await sortButton.trigger("click");
    expect(nameHeader.attributes("aria-sort")).toBe("descending");

    await sortButton.trigger("click");
    expect(nameHeader.attributes("aria-sort")).toBe("none");
  });

  it("activates clickable rows with Enter and Space", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        data: rows,
      },
    });

    const [row] = wrapper.findAll('[data-testid="table-row"]');
    expect(row.attributes("tabindex")).toBe("0");

    await row.trigger("click");
    await row.trigger("keydown.enter");
    await row.trigger("keydown.space");

    expect(wrapper.emitted("rowClick")).toEqual([
      [rows[0]],
      [rows[0]],
      [rows[0]],
    ]);
  });

  it("ignores row activation when rows are not clickable", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columns,
        data: rows,
        clickableRows: false,
      },
    });

    const [row] = wrapper.findAll('[data-testid="table-row"]');
    expect(row.attributes("tabindex")).toBeUndefined();

    await row.trigger("click");
    await row.trigger("keydown.enter");
    await row.trigger("keydown.space");

    expect(wrapper.emitted("rowClick")).toBeUndefined();
  });

  it("does not activate the row when a nested control is keyed", async () => {
    const wrapper = mount(DataTable, {
      props: {
        columns: [
          { accessorKey: "name", header: "Name" },
          {
            id: "actions",
            header: "",
            enableSorting: false,
            cell: () =>
              h("button", { type: "button", "data-testid": "action" }, "Do"),
          },
        ],
        data: rows,
      },
    });

    const [row] = wrapper.findAll('[data-testid="table-row"]');
    await row.find('[data-testid="action"]').trigger("keydown.enter");
    await row.find('[data-testid="action"]').trigger("keydown.space");

    expect(wrapper.emitted("rowClick")).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DataTable from "@/components/ui/table/DataTable.vue";

const columns = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "status", header: "Status" },
  { id: "actions", header: "", enableSorting: false },
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
});

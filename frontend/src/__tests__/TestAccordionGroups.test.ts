import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import type { ColumnDef } from "@tanstack/vue-table";
import TestAccordionGroups from "@/components/tables/TestAccordionGroups.vue";
import type { AppTableFeatures } from "@/components/ui/table/table-features";
import type { VisualTestItem } from "@/domains/projects/project.model";
import type { TestGroup } from "@/domains/projects/test-group";
import { STATUS } from "@/domains/test-status";
import { TEST_ID } from "@/lib/test-ids";

const columns: ColumnDef<AppTableFeatures, VisualTestItem>[] = [
  { accessorKey: "name", header: "Test" },
];

function group(name: string): TestGroup {
  return {
    name,
    items: [
      {
        name,
        viewport: "1280x720",
        browser: "chromium",
        environment: "staging",
        latestStatus: STATUS.UNCHANGED,
      },
    ],
    badges: [],
  };
}

describe("TestAccordionGroups", () => {
  it("opens the group named by the default values", () => {
    const wrapper = mount(TestAccordionGroups, {
      props: {
        groups: [group("checkout")],
        columns,
        defaultAccordionValues: ["checkout"],
      },
    });

    const card = wrapper.find(`[data-testid="${TEST_ID.testResultCard}"]`);
    expect(card.attributes("data-state")).toBe("open");
  });

  // The defaults are uncontrolled and only read on mount, so a group that a
  // filter introduces would inherit "collapsed" from the previous group set.
  // The component re-keys on the group set so the new group mounts expanded,
  // matching the expand-all intent.
  it("expands a group introduced by a new group set", async () => {
    const wrapper = mount(TestAccordionGroups, {
      props: {
        groups: [group("checkout")],
        columns,
        defaultAccordionValues: ["checkout"],
      },
    });

    await wrapper.setProps({
      groups: [group("checkout"), group("search")],
      defaultAccordionValues: ["checkout", "search"],
    });

    const cards = wrapper.findAll(`[data-testid="${TEST_ID.testResultCard}"]`);
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.attributes("data-state"))).toEqual([
      "open",
      "open",
    ]);
  });

  it("still lets the user collapse and expand a group", async () => {
    const wrapper = mount(TestAccordionGroups, {
      props: {
        groups: [group("checkout")],
        columns,
        defaultAccordionValues: ["checkout"],
      },
    });

    const card = () =>
      wrapper.find(`[data-testid="${TEST_ID.testResultCard}"]`);
    const trigger = card().find("button");

    await trigger.trigger("click");
    expect(card().attributes("data-state")).toBe("closed");

    await trigger.trigger("click");
    expect(card().attributes("data-state")).toBe("open");
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import DetailActivityRail from "@/components/detail-panels/DetailActivityRail.vue";
import { TEST_ID } from "@/lib/test-ids";

const CommentsPanelStub = {
  name: "CommentsPanel",
  template: "<div />",
  emits: ["update:count", "update:hasOlder"],
  props: ["projectName", "testName", "branch", "comparisonId", "readOnly"],
};

const HistoryPanelStub = {
  name: "BaselineHistoryPanel",
  template: "<div />",
  emits: ["update:count"],
  props: [
    "projectName",
    "testName",
    "branch",
    "variant",
    "currentHash",
    "kind",
    "readOnly",
  ],
};

const ApprovalsPanelStub = {
  name: "ApprovalHistoryPanel",
  template: "<div />",
  emits: ["update:count"],
  props: ["projectName", "testName", "branch"],
};

const variant = {
  viewport: "1920x1080",
  browser: "Chrome",
  environment: "staging" as const,
};

const mounted: { unmount: () => void }[] = [];

function mountRail(props: Record<string, unknown> = {}) {
  const wrapper = mount(DetailActivityRail, {
    props: {
      projectName: "checkout",
      testName: "login",
      branch: "main",
      variant,
      ...props,
    },
    global: {
      stubs: {
        CommentsPanel: CommentsPanelStub,
        BaselineHistoryPanel: HistoryPanelStub,
        ApprovalHistoryPanel: ApprovalsPanelStub,
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

function tab(wrapper: ReturnType<typeof mountRail>, testId: string) {
  return wrapper.get(`[data-testid="${testId}"]`);
}

function visiblePanel(wrapper: ReturnType<typeof mountRail>): string {
  const panel = wrapper
    .findAll('[role="tabpanel"]')
    .find(
      (node) => !(node.attributes("style") ?? "").includes("display: none"),
    );
  return panel?.attributes("id")?.replace(/.*panel-/, "") ?? "";
}

async function reportCount(
  wrapper: ReturnType<typeof mountRail>,
  panel: "CommentsPanel" | "BaselineHistoryPanel" | "ApprovalHistoryPanel",
  count: number,
) {
  await wrapper.findComponent({ name: panel }).vm.$emit("update:count", count);
}

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("DetailActivityRail", () => {
  it("offers the three sections as tabs with their counts", () => {
    const wrapper = mountRail();

    expect(tab(wrapper, TEST_ID.activityTabComments).text()).toContain(
      "Comments",
    );
    expect(tab(wrapper, TEST_ID.activityTabHistory).text()).toContain(
      "History",
    );
    expect(tab(wrapper, TEST_ID.activityTabApprovals).text()).toContain(
      "Approvals",
    );
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.activityTabCount}"]`),
    ).toHaveLength(3);
  });

  it("opens on comments while nothing reports otherwise", () => {
    const wrapper = mountRail();

    expect(
      tab(wrapper, TEST_ID.activityTabComments).attributes("aria-selected"),
    ).toBe("true");
    expect(visiblePanel(wrapper)).toBe("comments");
  });

  it("opens the first section that has something to show", async () => {
    const wrapper = mountRail();

    await reportCount(wrapper, "BaselineHistoryPanel", 2);

    expect(
      tab(wrapper, TEST_ID.activityTabHistory).attributes("aria-selected"),
    ).toBe("true");
    expect(visiblePanel(wrapper)).toBe("history");
    expect(tab(wrapper, TEST_ID.activityTabHistory).text()).toContain("2");
  });

  it("marks a paged comment count as at least that many", async () => {
    const wrapper = mountRail();
    const comments = wrapper.findComponent({ name: "CommentsPanel" });

    await reportCount(wrapper, "CommentsPanel", 200);
    await comments.vm.$emit("update:hasOlder", true);

    expect(tab(wrapper, TEST_ID.activityTabComments).text()).toContain("200+");

    // The last page is the thread end: the tab goes back to the exact count.
    await comments.vm.$emit("update:hasOlder", false);

    expect(tab(wrapper, TEST_ID.activityTabComments).text()).toContain("200");
    expect(tab(wrapper, TEST_ID.activityTabComments).text()).not.toContain("+");
  });

  it("prefers the discussion over the history when both have content", async () => {
    const wrapper = mountRail();

    await reportCount(wrapper, "BaselineHistoryPanel", 1);
    await reportCount(wrapper, "CommentsPanel", 3);

    expect(
      tab(wrapper, TEST_ID.activityTabComments).attributes("aria-selected"),
    ).toBe("true");
  });

  it("shows the panel of a clicked tab and hides the others", async () => {
    const wrapper = mountRail();

    await tab(wrapper, TEST_ID.activityTabApprovals).trigger("click");

    expect(
      tab(wrapper, TEST_ID.activityTabApprovals).attributes("aria-selected"),
    ).toBe("true");
    expect(
      tab(wrapper, TEST_ID.activityTabComments).attributes("aria-selected"),
    ).toBe("false");
    expect(visiblePanel(wrapper)).toBe("approvals");
  });

  it("keeps a reviewer's chosen tab when counts arrive later", async () => {
    const wrapper = mountRail();

    await tab(wrapper, TEST_ID.activityTabApprovals).trigger("click");
    await reportCount(wrapper, "CommentsPanel", 4);

    expect(
      tab(wrapper, TEST_ID.activityTabApprovals).attributes("aria-selected"),
    ).toBe("true");
    expect(visiblePanel(wrapper)).toBe("approvals");
  });

  it("leaves the history tab out when the branch has no history", () => {
    const wrapper = mountRail({ historyEnabled: false });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.activityTabHistory}"]`).exists(),
    ).toBe(false);
    expect(wrapper.find('[id$="panel-history"]').exists()).toBe(false);
  });

  it("leaves the history tab out when no variant was resolved", () => {
    const wrapper = mountRail({ variant: undefined });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.activityTabHistory}"]`).exists(),
    ).toBe(false);
  });

  it("moves between tabs with the arrow keys", async () => {
    const wrapper = mountRail();

    await tab(wrapper, TEST_ID.activityTabComments).trigger("keydown", {
      key: "ArrowRight",
    });
    expect(visiblePanel(wrapper)).toBe("history");

    await tab(wrapper, TEST_ID.activityTabHistory).trigger("keydown", {
      key: "ArrowRight",
    });
    expect(visiblePanel(wrapper)).toBe("approvals");

    await tab(wrapper, TEST_ID.activityTabApprovals).trigger("keydown", {
      key: "ArrowLeft",
    });
    expect(visiblePanel(wrapper)).toBe("history");

    await tab(wrapper, TEST_ID.activityTabHistory).trigger("keydown", {
      key: "End",
    });
    expect(visiblePanel(wrapper)).toBe("approvals");
  });
});

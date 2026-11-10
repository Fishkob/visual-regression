import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import TestComparisonView from "@/components/detail-panels/TestComparisonView.vue";
import ApprovalDecisionDialog from "@/components/approvals/ApprovalDecisionDialog.vue";
import { TEST_ID } from "@/lib/test-ids";

// The footer's role gate reads the session; these tests are about the view's
// chrome, so the writer role is assumed.
vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: true }),
}));

const { focusRegionSpy } = vi.hoisted(() => ({ focusRegionSpy: vi.fn() }));

vi.mock("@/components/detail-panels/InteractiveImageViewer.vue", () => ({
  default: {
    template:
      '<div data-testid="interactive-viewer">{{ baselineUrl }} {{ candidateUrl }} {{ diffUrl }}</div>',
    props: ["baselineUrl", "candidateUrl", "diffUrl", "regions"],
    setup(_props: unknown, { expose }: { expose: (api: unknown) => void }) {
      expose({ focusRegion: focusRegionSpy });
      return {};
    },
  },
}));

const mockComparison = {
  id: "cmp-1",
  baseline: { imageUrl: "/images/baseline.png" },
  candidate: { imageUrl: "/images/candidate.png" },
  diffImageUrl: "/images/diff.png",
  mismatchPixelCount: 157,
  status: "PENDING_APPROVAL" as const,
  thresholdExceeded: false,
};

describe("TestComparisonView", () => {
  beforeEach(() => {
    focusRegionSpy.mockClear();
  });

  it("renders the interactive viewer with correct props", () => {
    const wrapper = mount(TestComparisonView, {
      props: { comparison: mockComparison },
    });
    expect(wrapper.find('[data-testid="interactive-viewer"]').exists()).toBe(
      true,
    );
    const text = wrapper.find('[data-testid="interactive-viewer"]').text();
    expect(text).toContain("/images/baseline.png");
    expect(text).toContain("/images/candidate.png");
    expect(text).toContain("/images/diff.png");
  });

  it("lists the changed regions beside the stage", () => {
    const wrapper = mount(TestComparisonView, {
      props: {
        comparison: {
          ...mockComparison,
          changedRegions: [
            { x: 0, y: 0, width: 10, height: 10, pixelCount: 50 },
            { x: 20, y: 20, width: 10, height: 10, pixelCount: 30 },
          ],
        },
      },
    });

    const items = wrapper.findAll(
      `[data-testid="${TEST_ID.changedRegionItem}"]`,
    );

    expect(items).toHaveLength(2);
    expect(
      wrapper.get(`[data-testid="${TEST_ID.changedRegionCount}"]`).text(),
    ).toBe("2 areas");
  });

  it("focuses the region the reviewer picks", async () => {
    const wrapper = mount(TestComparisonView, {
      props: {
        comparison: {
          ...mockComparison,
          changedRegions: [
            { x: 0, y: 0, width: 10, height: 10, pixelCount: 50 },
            { x: 20, y: 20, width: 10, height: 10, pixelCount: 30 },
          ],
        },
      },
    });

    await wrapper
      .findAll(`[data-testid="${TEST_ID.changedRegionItem}"]`)[1]
      .trigger("click");

    expect(focusRegionSpy).toHaveBeenCalledWith(1);
  });

  it("shows no region rail when the comparison has no regions", () => {
    const wrapper = mount(TestComparisonView, {
      props: { comparison: mockComparison },
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.changedRegionList}"]`).exists(),
    ).toBe(false);
  });

  it("emits skip on skip button click", async () => {
    const wrapper = mount(TestComparisonView, {
      props: { comparison: mockComparison },
    });
    await wrapper.find('[data-testid="skip"]').trigger("click");
    expect(wrapper.emitted("skip")).toBeTruthy();
  });

  it("collects an optional reason before emitting approve", async () => {
    const wrapper = mount(TestComparisonView, {
      props: { comparison: mockComparison },
      global: { stubs: { DialogPortal: { template: "<slot />" } } },
    });
    await wrapper.find('[data-testid="approve-changes"]').trigger("click");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("approve")).toContainEqual([{}]);
  });

  it("handles missing baseline gracefully", () => {
    const wrapper = mount(TestComparisonView, {
      props: {
        comparison: {
          id: "cmp-2",
          baseline: undefined,
          candidate: { imageUrl: "/images/candidate.png" },
          diffImageUrl: "/images/diff.png",
          status: "PENDING_APPROVAL" as const,
          thresholdExceeded: false,
        },
      },
    });
    expect(wrapper.find('[data-testid="interactive-viewer"]').exists()).toBe(
      true,
    );
  });

  it("handles missing candidate gracefully", () => {
    const wrapper = mount(TestComparisonView, {
      props: {
        comparison: {
          id: "cmp-3",
          baseline: { imageUrl: "/images/baseline.png" },
          candidate: undefined,
          diffImageUrl: "/images/diff.png",
          status: "PENDING_APPROVAL" as const,
          thresholdExceeded: false,
        },
      },
    });
    expect(wrapper.find('[data-testid="interactive-viewer"]').exists()).toBe(
      true,
    );
  });

  it("opens the decision dialog through the exposed review action", async () => {
    const wrapper = mount(TestComparisonView, {
      props: { comparison: mockComparison },
    });
    const dialog = wrapper.findComponent(ApprovalDecisionDialog);
    expect(dialog.props("open")).toBe(false);

    (wrapper.vm as unknown as { openDecision: () => void }).openDecision();
    await wrapper.vm.$nextTick();

    expect(dialog.props("open")).toBe(true);
  });
});

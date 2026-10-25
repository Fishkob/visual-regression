import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import TestComparisonView from "@/components/detail-panels/TestComparisonView.vue";

// The footer's role gate reads the session; these tests are about the view's
// chrome, so the writer role is assumed.
vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: true }),
}));

vi.mock("@/components/detail-panels/InteractiveImageViewer.vue", () => ({
  default: {
    template:
      '<div data-testid="interactive-viewer">{{ baselineUrl }} {{ candidateUrl }} {{ diffUrl }} {{ mismatchPixelCount }}</div>',
    props: ["baselineUrl", "candidateUrl", "diffUrl", "mismatchPixelCount"],
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
    expect(text).toContain("157");
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
});

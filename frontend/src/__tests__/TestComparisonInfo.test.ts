import { describe, it, expect, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import TestComparisonInfo from "@/components/TestComparisonInfo.vue";
import type { Comparison } from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";

const auth = vi.hoisted(() => ({ isAdmin: true }));

vi.mock("@/composables/useAuth", async () => {
  const { ref } = await import("vue");
  return {
    useCurrentRole: () => ({
      isAdmin: ref(auth.isAdmin),
      canWrite: ref(true),
    }),
  };
});

const mounted: { unmount: () => void }[] = [];

function comparison(overrides: Partial<Comparison> = {}): Comparison {
  return {
    id: "cmp-1",
    diffImageUrl: "/images/diff.png",
    mismatchPixelCount: 12,
    status: "PENDING_APPROVAL",
    thresholdExceeded: false,
    baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 20 },
    candidate: { imageUrl: "/images/candidate.png" },
    ...overrides,
  };
}

function mountInfo(props: {
  comparison?: Comparison | null;
  baseline?: Comparison["baseline"];
  readOnly?: boolean;
  projectPixelDiffThreshold?: number | null;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = mount(TestComparisonInfo, {
    props: {
      projectName: "shop",
      testName: "checkout",
      ...props,
    },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: { ApprovalBadge: true },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  auth.isAdmin = true;
});

describe("TestComparisonInfo", () => {
  it("flags a pending comparison that sits within the baseline tolerance", () => {
    const wrapper = mountInfo({
      comparison: comparison(),
      baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 20 },
    });

    const badge = wrapper.find(
      `[data-testid="${TEST_ID.badgeWithinTolerance}"]`,
    );

    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("within tolerance");
  });

  it("does not flag a comparison above the tolerance", () => {
    const wrapper = mountInfo({
      comparison: comparison({ thresholdExceeded: true }),
      baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 20 },
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.badgeWithinTolerance}"]`).exists(),
    ).toBe(false);
  });

  it("does not flag anything when no tolerance is configured", () => {
    const wrapper = mountInfo({
      comparison: comparison(),
      baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 0 },
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.badgeWithinTolerance}"]`).exists(),
    ).toBe(false);
  });

  it("shows the threshold editor for an owned baseline", () => {
    const wrapper = mountInfo({
      comparison: comparison(),
      baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 20 },
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.thresholdInput}"]`).exists(),
    ).toBe(true);
  });

  it("shows the threshold read-only for an inherited baseline", () => {
    const wrapper = mountInfo({
      comparison: comparison(),
      baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 20 },
      readOnly: true,
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.thresholdInput}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.thresholdReadonly}"]`).text(),
    ).toContain("20");
  });

  it("shows the threshold read-only for a member", () => {
    auth.isAdmin = false;

    const wrapper = mountInfo({
      comparison: comparison(),
      baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 20 },
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.thresholdInput}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.thresholdReadonly}"]`).text(),
    ).toContain("20");
  });

  it("names the project default when the variant has no own threshold", () => {
    const wrapper = mountInfo({
      comparison: comparison(),
      baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 0 },
      projectPixelDiffThreshold: 10,
    });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.thresholdProjectDefault}"]`).text(),
    ).toContain("10");
  });

  it("stays quiet about the project default when the variant sets its own", () => {
    const wrapper = mountInfo({
      comparison: comparison(),
      baseline: { imageUrl: "/images/baseline.png", pixelDiffThreshold: 20 },
      projectPixelDiffThreshold: 10,
    });

    expect(
      wrapper
        .find(`[data-testid="${TEST_ID.thresholdProjectDefault}"]`)
        .exists(),
    ).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import ApprovalBadge from "@/components/ApprovalBadge.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockListApprovals } = vi.hoisted(() => ({
  mockListApprovals: vi.fn(),
}));

vi.mock("@sdk", () => ({
  approvalsControllerListApprovals: (...args: unknown[]) =>
    mockListApprovals(...args),
}));

const mounted: { unmount: () => void }[] = [];

function mountBadge(props: {
  projectName: string;
  testName: string;
  branch?: string;
  variant?: { viewport?: string; browser?: string; environment?: string };
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = mount(ApprovalBadge, {
    props,
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  });
  mounted.push(wrapper);
  return wrapper;
}

function approvalDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "ap-1",
    approvedBy: "jane.doe",
    approvedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    comparisonId: "cmp-1",
    testKind: "image",
    branchName: null,
    variant: {
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
    },
    candidateHash: "candidate-hash",
    baselineHash: "baseline-hash",
    mismatchPixelCount: 12,
    mismatchPageCount: null,
    pageCount: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("ApprovalBadge", () => {
  it("renders the newest approval with its full local timestamp as the title", async () => {
    const approvedAt = new Date(Date.now() - 5 * 60_000);
    mockListApprovals.mockResolvedValue({
      data: [
        approvalDto({
          approvedAt: approvedAt.toISOString(),
          branchName: "feature/x",
        }),
        approvalDto({
          id: "ap-2",
          approvedBy: "john.doe",
          approvedAt: new Date(Date.now() - 90 * 60_000).toISOString(),
          branchName: "feature/x",
        }),
      ],
    });

    const wrapper = mountBadge({
      projectName: "checkout",
      testName: "login",
      branch: "feature/x",
    });

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.approvalBadge}"]`).exists(),
      ).toBe(true),
    );

    const badge = wrapper.find(`[data-testid="${TEST_ID.approvalBadge}"]`);
    expect(badge.text()).toContain("Approved by jane.doe");
    expect(badge.text()).toContain("5 minutes ago");
    expect(badge.text()).not.toContain("john.doe");
    expect(badge.attributes("title")).toBe(approvedAt.toLocaleString());
    expect(mockListApprovals).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "feature/x" },
    });
  });

  it("picks the newest approval of the displayed variant", async () => {
    mockListApprovals.mockResolvedValue({
      data: [
        approvalDto({
          id: "ap-other",
          approvedBy: "other.variant",
          variant: {
            viewport: "800x600",
            browser: "Chrome",
            environment: "staging",
          },
        }),
        approvalDto({
          id: "ap-mine",
          approvedBy: "mine.variant",
          variant: {
            viewport: "1920x1080",
            browser: "Chrome",
            environment: "staging",
          },
        }),
      ],
    });

    const wrapper = mountBadge({
      projectName: "checkout",
      testName: "login",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
    });

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.approvalBadge}"]`).exists(),
      ).toBe(true),
    );

    const badge = wrapper.find(`[data-testid="${TEST_ID.approvalBadge}"]`);
    expect(badge.text()).toContain("Approved by mine.variant");
    expect(badge.text()).not.toContain("other.variant");
  });

  it("renders nothing when no approval matches the displayed variant", async () => {
    mockListApprovals.mockResolvedValue({
      data: [
        approvalDto({
          approvedBy: "other.variant",
          variant: {
            viewport: "800x600",
            browser: "Chrome",
            environment: "staging",
          },
        }),
      ],
    });

    const wrapper = mountBadge({
      projectName: "checkout",
      testName: "login",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
    });

    await vi.waitFor(() => expect(mockListApprovals).toHaveBeenCalled());
    await wrapper.vm.$nextTick();

    expect(
      wrapper.find(`[data-testid="${TEST_ID.approvalBadge}"]`).exists(),
    ).toBe(false);
  });

  it("filters the trail to the displayed branch", async () => {
    mockListApprovals.mockResolvedValue({
      data: [
        approvalDto({
          id: "ap-feature",
          approvedBy: "feature.approver",
          branchName: "feature/x",
          approvedAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        approvalDto({
          id: "ap-default",
          approvedBy: "default.approver",
          branchName: null,
          approvedAt: new Date(Date.now() - 120_000).toISOString(),
        }),
      ],
    });

    const defaultBranch = mountBadge({
      projectName: "checkout",
      testName: "login",
    });
    await vi.waitFor(() =>
      expect(
        defaultBranch.find(`[data-testid="${TEST_ID.approvalBadge}"]`).exists(),
      ).toBe(true),
    );
    expect(
      defaultBranch.find(`[data-testid="${TEST_ID.approvalBadge}"]`).text(),
    ).toContain("default.approver");

    const featureBranch = mountBadge({
      projectName: "checkout",
      testName: "login",
      branch: "feature/x",
    });
    await vi.waitFor(() =>
      expect(
        featureBranch.find(`[data-testid="${TEST_ID.approvalBadge}"]`).text(),
      ).toContain("feature.approver"),
    );
  });

  it("omits the branch filter when no branch is given", async () => {
    mockListApprovals.mockResolvedValue({ data: [] });

    mountBadge({ projectName: "checkout", testName: "login" });

    await vi.waitFor(() => expect(mockListApprovals).toHaveBeenCalled());

    expect(mockListApprovals).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
    });
  });

  it("renders nothing when the history is empty", async () => {
    mockListApprovals.mockResolvedValue({ data: [] });

    const wrapper = mountBadge({ projectName: "checkout", testName: "login" });

    await vi.waitFor(() => expect(mockListApprovals).toHaveBeenCalled());
    await wrapper.vm.$nextTick();

    expect(
      wrapper.find(`[data-testid="${TEST_ID.approvalBadge}"]`).exists(),
    ).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("renders nothing when the approvals request fails", async () => {
    mockListApprovals.mockRejectedValue(new Error("boom"));

    const wrapper = mountBadge({ projectName: "checkout", testName: "login" });

    await vi.waitFor(() => expect(mockListApprovals).toHaveBeenCalled());
    await vi.waitFor(() => expect(wrapper.text()).toBe(""));

    expect(
      wrapper.find(`[data-testid="${TEST_ID.approvalBadge}"]`).exists(),
    ).toBe(false);
  });
});

describe("ApprovalBadge reasons", () => {
  it("shows the structured reason and note of the newest approval", async () => {
    mockListApprovals.mockResolvedValue({
      data: [
        approvalDto({
          reason: "INTENDED_CHANGE",
          note: "Redesign approved by design",
        }),
      ],
    });

    const wrapper = mountBadge({ projectName: "checkout", testName: "login" });
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.approvalBadge}"]`).exists(),
      ).toBe(true),
    );

    expect(
      wrapper.get(`[data-testid="${TEST_ID.approvalReason}"]`).text(),
    ).toBe("Intended change");
    expect(
      wrapper.get(`[data-testid="${TEST_ID.approvalNote}"]`).text(),
    ).toContain("Redesign approved by design");
  });
});

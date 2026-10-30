import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import ApprovalHistoryPanel from "@/components/detail-panels/ApprovalHistoryPanel.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockApprovals } = vi.hoisted(() => ({ mockApprovals: vi.fn() }));

vi.mock("@sdk", () => ({
  approvalsControllerListApprovals: (...args: unknown[]) =>
    mockApprovals(...args),
}));

function approvalDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "ap-1",
    approvedBy: "alice",
    approvedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    comparisonId: "cmp-1",
    testKind: "image",
    reason: "INTENDED_CHANGE",
    note: "New design approved",
    branchName: "main",
    variant: {
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
    },
    candidateHash: "abc",
    baselineHash: null,
    mismatchPixelCount: 55860,
    mismatchPageCount: null,
    pageCount: null,
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function lastCount(wrapper: {
  emitted: (name: string) => unknown[][] | undefined;
}) {
  const events = wrapper.emitted("update:count") ?? [];
  return events[events.length - 1];
}

function mountPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = mount(ApprovalHistoryPanel, {
    props: { projectName: "checkout", testName: "login", branch: "main" },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApprovals.mockResolvedValue({
    data: [
      approvalDto(),
      approvalDto({
        id: "ap-2",
        approvedBy: "bob",
        reason: null,
        note: null,
        mismatchPixelCount: null,
        approvedAt: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
      }),
    ],
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("ApprovalHistoryPanel", () => {
  it("renders one row per approval with actor, reason and note", async () => {
    const wrapper = mountPanel();

    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.approvalHistoryRow}"]`),
      ).toHaveLength(2),
    );

    const row = wrapper.get(`[data-testid="${TEST_ID.approvalHistoryRow}"]`);
    expect(row.text()).toContain("alice");
    expect(row.text()).toContain("approved");
    expect(row.text()).toContain("5 minutes ago");
    expect(row.get(`[data-testid="${TEST_ID.approvalReason}"]`).text()).toBe(
      "Intended change",
    );
    expect(row.get(`[data-testid="${TEST_ID.approvalNote}"]`).text()).toBe(
      "New design approved",
    );
  });

  it("shows how much mismatch the approval accepted", async () => {
    const wrapper = mountPanel();

    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.approvalHistoryRow}"]`),
      ).toHaveLength(2),
    );

    const rows = wrapper.findAll(
      `[data-testid="${TEST_ID.approvalHistoryRow}"]`,
    );
    expect(
      rows[0]!
        .get(`[data-testid="${TEST_ID.approvalAcceptedMismatch}"]`)
        .text(),
    ).toContain("55,860 px accepted");
    // An approval without a counted mismatch keeps the line out entirely.
    expect(
      rows[1]!
        .find(`[data-testid="${TEST_ID.approvalAcceptedMismatch}"]`)
        .exists(),
    ).toBe(false);
  });

  it("reads the trail for the selected branch", async () => {
    mountPanel();

    await vi.waitFor(() =>
      expect(mockApprovals).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: { branch: "main" },
      }),
    );
  });

  it("reports the trail size to the section header", async () => {
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(lastCount(wrapper)).toEqual([2]));
  });

  it("shows the empty state when nothing has been approved", async () => {
    mockApprovals.mockResolvedValue({ data: [] });

    const wrapper = mountPanel();

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("No approvals yet"),
    );
    expect(lastCount(wrapper)).toEqual([0]);
  });
});

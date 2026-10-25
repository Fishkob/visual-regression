import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import InboxView from "@/views/InboxView.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockPending, mockBranches, mockGroups, mockBulkApprove, canWriteRef } =
  vi.hoisted(() => ({
    mockPending: vi.fn(),
    mockBranches: vi.fn(),
    mockGroups: vi.fn(),
    mockBulkApprove: vi.fn(),
    canWriteRef: { value: true },
  }));

vi.mock("@sdk", () => ({
  assignmentControllerOverdue: vi.fn(() => Promise.resolve({ data: [] })),
  reviewInboxControllerGetPending: (...args: unknown[]) => mockPending(...args),
  reviewInboxControllerGetBranches: (...args: unknown[]) =>
    mockBranches(...args),
  projectGroupsControllerFindAll: (...args: unknown[]) => mockGroups(...args),
  bulkActionsControllerApprove: (...args: unknown[]) =>
    mockBulkApprove(...args),
}));

vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: canWriteRef.value }),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
  RouterLink: { template: "<a><slot /></a>" },
}));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function pendingDto(overrides: Record<string, unknown> = {}) {
  return {
    comparisonId: "c-1",
    projectName: "checkout",
    groupId: null,
    groupName: null,
    testName: "checkout-flow",
    kind: "image",
    branchName: "main",
    runKey: null,
    isDefaultBranch: true,
    variant: {
      viewport: "1280x720",
      browser: "chromium",
      environment: "staging",
    },
    mismatchPixelCount: 42,
    mismatchPageCount: null,
    projectPendingCount: 2,
    projectBranchCount: 1,
    createdAt: minutesAgo(10),
    ...overrides,
  };
}

// The SDK response wraps the endpoint body, which is the paginated inbox payload.
function pageOf(rows: unknown[]) {
  return { data: { data: rows, meta: { total: rows.length } } };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(InboxView, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        SelectPortal: { template: "<slot />" },
        DialogPortal: { template: "<slot />" },
        AlertDialogPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForItems(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.inboxItem}"]`),
    ).toHaveLength(count),
  );
}

function approveCall(projectName: string) {
  return mockBulkApprove.mock.calls.find(
    (call) =>
      (call[0] as { path: { projectName: string } }).path.projectName ===
      projectName,
  )?.[0] as { body: { comparisonIds: string[] } } | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  canWriteRef.value = true;
  mockPending.mockResolvedValue(
    pageOf([
      pendingDto(),
      pendingDto({
        comparisonId: "c-2",
        testName: "cart",
        createdAt: minutesAgo(9),
      }),
      pendingDto({
        comparisonId: "c-3",
        projectName: "admin-ui",
        testName: "users",
        createdAt: minutesAgo(8),
      }),
    ]),
  );
  mockBranches.mockResolvedValue({ data: [] });
  mockGroups.mockResolvedValue({ data: [] });
  mockBulkApprove.mockImplementation(
    ({ path }: { path: { projectName: string } }) =>
      Promise.resolve({
        data: {
          approved:
            path.projectName === "checkout"
              ? [{ id: "c-1", success: true }]
              : [{ id: "c-3", success: true }],
          failed:
            path.projectName === "checkout"
              ? [
                  {
                    id: "c-2",
                    success: false,
                    error: "comparison was superseded",
                  },
                ]
              : [],
        },
      }),
  );
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("Inbox bulk approve", () => {
  it("approves a selection spanning projects and shows partial failures", async () => {
    const wrapper = mountView();
    await waitForItems(wrapper, 3);

    await wrapper
      .get(`[data-testid="${TEST_ID.inboxSelectAll}"]`)
      .setValue(true);
    expect(wrapper.text()).toContain("3 selected");

    await wrapper
      .get(`[data-testid="${TEST_ID.inboxBulkApprove}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.dialogDescription}"]`).text(),
    ).toContain("3 changes across 2 projects");

    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() => expect(mockBulkApprove).toHaveBeenCalledTimes(2));
    expect(approveCall("checkout")?.body.comparisonIds.sort()).toEqual([
      "c-1",
      "c-2",
    ]);
    expect(approveCall("admin-ui")?.body.comparisonIds).toEqual(["c-3"]);

    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Approved 2 changes, 1 failed",
      ),
    );

    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.bulkFailureRow}"]`),
      ).toHaveLength(1),
    );
    const failure = wrapper.get(`[data-testid="${TEST_ID.bulkFailureRow}"]`);
    expect(failure.text()).toContain("checkout · cart");
    expect(failure.text()).toContain("c-2");
    expect(failure.text()).toContain("comparison was superseded");

    // The selection is cleared after the batch.
    expect(wrapper.text()).toContain("0 selected");
  });

  it("sends only the selected comparison id with its project", async () => {
    const wrapper = mountView();
    await waitForItems(wrapper, 3);

    await wrapper
      .findAll(`[data-testid="${TEST_ID.inboxSelectRow}"]`)[0]
      .setValue(true);
    expect(wrapper.text()).toContain("1 selected");

    await wrapper
      .get(`[data-testid="${TEST_ID.inboxBulkApprove}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() => expect(mockBulkApprove).toHaveBeenCalledTimes(1));
    expect(mockBulkApprove).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      body: { comparisonIds: ["c-1"] },
    });
  });

  it("hides selection and bulk controls from a viewer", async () => {
    canWriteRef.value = false;

    const wrapper = mountView();
    await waitForItems(wrapper, 3);

    expect(
      wrapper.find(`[data-testid="${TEST_ID.inboxSelectRow}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.inboxSelectAll}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.inboxBulkApprove}"]`).exists(),
    ).toBe(false);
    // The rows themselves stay reachable for the read-only review.
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.inboxItem}"]`),
    ).toHaveLength(3);
  });
});

describe("Inbox bulk approve with 4-eyes votes", () => {
  it("reports pending votes separately and shows them in the dialog", async () => {
    mockBulkApprove.mockImplementation(
      ({ path }: { path: { projectName: string } }) =>
        Promise.resolve({
          data:
            path.projectName === "checkout"
              ? {
                  approved: [{ id: "c-1", success: true }],
                  pending: [{ id: "c-2", votes: 1, required: 2 }],
                  failed: [],
                }
              : {
                  approved: [{ id: "c-3", success: true }],
                  pending: [],
                  failed: [],
                },
        }),
    );

    const wrapper = mountView();
    await waitForItems(wrapper, 3);

    await wrapper
      .get(`[data-testid="${TEST_ID.inboxSelectAll}"]`)
      .setValue(true);
    await wrapper
      .get(`[data-testid="${TEST_ID.inboxBulkApprove}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Approved 2 changes, 1 awaiting additional approval",
      ),
    );

    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.bulkPendingRow}"]`),
      ).toHaveLength(1),
    );
    const pending = wrapper.get(`[data-testid="${TEST_ID.bulkPendingRow}"]`);
    expect(pending.text()).toContain("checkout · cart");
    expect(pending.text()).toContain("1 of 2 reviewers approved");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.bulkFailureRow}"]`).exists(),
    ).toBe(false);
    expect(wrapper.text()).toContain("Waiting for additional approval");
  });
});

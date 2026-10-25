import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import AssignReviewDialog from "@/components/test-lifecycle/AssignReviewDialog.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@sdk", () => ({
  assignmentControllerCreate: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mounted: { unmount: () => void }[] = [];

function mountDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(AssignReviewDialog, {
    props: {
      open: true,
      projectName: "checkout",
      testName: "login",
      branch: "main",
    },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: { DialogPortal: { template: "<slot />" } },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({
    data: {
      id: "a-1",
      projectName: "checkout",
      testName: "login",
      assigneeUsername: "alice",
    },
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("AssignReviewDialog", () => {
  it("creates a test-scoped assignment with a due date", async () => {
    const wrapper = mountDialog();
    await wrapper
      .get(`[data-testid="${TEST_ID.assignAssignee}"]`)
      .setValue("alice");
    await wrapper
      .get(`[data-testid="${TEST_ID.assignDueAt}"]`)
      .setValue("2026-11-01");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        path: { projectName: "checkout" },
        body: {
          testName: "login",
          branch: "main",
          assignee: "alice",
          dueAt: new Date("2026-11-01T23:59:59").toISOString(),
        },
      }),
    );
    await vi.waitFor(() =>
      expect(wrapper.emitted("update:open")).toContainEqual([false]),
    );
  });

  it("requires an assignee", async () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("Assignee is required.");
    await wrapper.find("form").trigger("submit");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import ReviewSettingsDialog from "@/components/projects/ReviewSettingsDialog.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));

vi.mock("@sdk", () => ({
  projectsControllerUpdateReviewPolicy: (...args: unknown[]) =>
    mockUpdate(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mounted: { unmount: () => void }[] = [];

function mountDialog(requiredApprovals = 2) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(ReviewSettingsDialog, {
    props: { open: true, projectName: "checkout", requiredApprovals },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        DialogPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue({ data: { id: "p-1", name: "checkout" } });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("ReviewSettingsDialog", () => {
  it("saves the required approval count", async () => {
    const wrapper = mountDialog(2);
    await wrapper
      .get(`[data-testid="${TEST_ID.reviewRequiredApprovals}"]`)
      .setValue("4");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout" },
        body: { requiredApprovals: 4 },
      }),
    );
    await vi.waitFor(() =>
      expect(wrapper.emitted("update:open")).toContainEqual([false]),
    );
  });

  it("rejects a value outside 1–10", async () => {
    const wrapper = mountDialog(2);
    await wrapper
      .get(`[data-testid="${TEST_ID.reviewRequiredApprovals}"]`)
      .setValue("11");

    expect(wrapper.text()).toContain(
      "Approvals required must be a whole number between 1 and 10.",
    );
    await wrapper.find("form").trigger("submit");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import ProjectsView from "@/views/ProjectsView.vue";
import { Select } from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockGroups, mockMove, canWriteRef } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGroups: vi.fn(),
  mockMove: vi.fn(),
  canWriteRef: { value: true },
}));

vi.mock("@sdk", () => ({
  projectsControllerGetProjectsWithPendingFlag: (...args: unknown[]) =>
    mockList(...args),
  projectGroupsControllerFindAll: (...args: unknown[]) => mockGroups(...args),
  projectsBulkControllerMove: (...args: unknown[]) => mockMove(...args),
  projectsControllerDeleteProject: vi.fn(),
  projectGroupsControllerCreate: vi.fn(),
  projectGroupsControllerRename: vi.fn(),
  projectGroupsControllerRemove: vi.fn(),
}));

vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: canWriteRef.value }),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  RouterLink: { template: "<a><slot /></a>" },
}));

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(ProjectsView, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        SelectPortal: { template: "<slot />" },
        DialogPortal: { template: "<slot />" },
        AlertDialogPortal: { template: "<slot />" },
        DropdownMenuPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForRows(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(wrapper.findAll(`[data-testid="${TEST_ID.tableRow}"]`)).toHaveLength(
      count,
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  canWriteRef.value = true;
  mockList.mockResolvedValue({
    data: {
      data: [
        { id: "p1", name: "checkout-ui", testCount: 2, pendingCount: 0 },
        { id: "p2", name: "admin-ui", testCount: 1, pendingCount: 0 },
      ],
      meta: { page: 1, limit: 25, total: 2, totalPages: 1 },
    },
  });
  mockGroups.mockResolvedValue({
    data: [{ id: "g1", name: "Shop", projectCount: 3 }],
  });
  mockMove.mockResolvedValue({
    data: {
      moved: [
        { id: "checkout-ui", success: true },
        { id: "admin-ui", success: true },
      ],
      failed: [],
    },
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("Projects bulk move", () => {
  // The e2e bulk and delete flows select a row by its name and then reach for
  // the checkbox or the actions menu inside it, so both must live in the row.
  it("scopes the checkbox and the row actions to the project row", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.projectRow}"]`);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.find(`[data-testid="${TEST_ID.tableRow}"]`).exists()).toBe(
        true,
      );
      expect(
        row.find(`[data-testid="${TEST_ID.projectSelectRow}"]`).exists(),
      ).toBe(true);
      expect(
        row.find(`[data-testid="${TEST_ID.projectActionsButton}"]`).exists(),
      ).toBe(true);
    }
  });

  it("moves the selection to the chosen group", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    await wrapper
      .get(`[data-testid="${TEST_ID.projectSelectAll}"]`)
      .setValue(true);
    expect(wrapper.text()).toContain("2 selected");

    await wrapper
      .get(`[data-testid="${TEST_ID.projectBulkMove}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.projectBulkMoveGroup}"]`)
          .exists(),
      ).toBe(true),
    );
    // The page has a group *filter* select; pick the dialog's own select.
    const dialogSelect = wrapper
      .findAllComponents(Select)
      .find((component) =>
        component
          .find(`[data-testid="${TEST_ID.projectBulkMoveGroup}"]`)
          .exists(),
      );
    if (!dialogSelect) throw new Error("move dialog select not found");
    dialogSelect.vm.$emit("update:modelValue", "g1");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockMove).toHaveBeenCalledWith({
        body: {
          projectNames: ["admin-ui", "checkout-ui"],
          groupId: "g1",
        },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Moved 2 projects"),
    );
    expect(wrapper.text()).toContain("0 selected");
  });

  it("moves to no group when the default option is kept", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    await wrapper
      .findAll(`[data-testid="${TEST_ID.projectSelectRow}"]`)[0]
      .setValue(true);

    await wrapper
      .get(`[data-testid="${TEST_ID.projectBulkMove}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.projectBulkMoveConfirm}"]`)
          .exists(),
      ).toBe(true),
    );
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockMove).toHaveBeenCalledWith({
        body: { projectNames: ["admin-ui"], groupId: null },
      }),
    );
  });

  it("lists the projects that could not be moved", async () => {
    mockMove.mockResolvedValue({
      data: {
        moved: [{ id: "checkout-ui", success: true }],
        failed: [
          { id: "admin-ui", success: false, error: "group no longer exists" },
        ],
      },
    });

    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    await wrapper
      .get(`[data-testid="${TEST_ID.projectSelectAll}"]`)
      .setValue(true);
    await wrapper
      .get(`[data-testid="${TEST_ID.projectBulkMove}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.projectBulkMoveConfirm}"]`)
          .exists(),
      ).toBe(true),
    );
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Moved 1 project, 1 failed"),
    );
    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.bulkFailureRow}"]`),
      ).toHaveLength(1),
    );
    const failure = wrapper.get(`[data-testid="${TEST_ID.bulkFailureRow}"]`);
    expect(failure.text()).toContain("admin-ui");
    expect(failure.text()).toContain("group no longer exists");
  });

  it("hides selection and bulk controls from a viewer", async () => {
    canWriteRef.value = false;

    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    expect(
      wrapper.find(`[data-testid="${TEST_ID.projectSelectRow}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.projectSelectAll}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.projectBulkMove}"]`).exists(),
    ).toBe(false);
    expect(wrapper.findAll(`[data-testid="${TEST_ID.tableRow}"]`)).toHaveLength(
      2,
    );
  });
});

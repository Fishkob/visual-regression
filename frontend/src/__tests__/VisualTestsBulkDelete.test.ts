import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import VisualTestsTable from "@/components/tables/VisualTestsTable.vue";
import type { VisualTestItem } from "@/domains/projects/project.model";
import { TEST_ID } from "@/lib/test-ids";

const { mockBulkDelete } = vi.hoisted(() => ({
  mockBulkDelete: vi.fn(),
}));

vi.mock("@sdk", () => ({
  bulkActionsControllerDeleteTests: (...args: unknown[]) =>
    mockBulkDelete(...args),
  testCommandsControllerDeleteVisualTest: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  RouterLink: { template: "<a><slot /></a>" },
}));

const TESTS: VisualTestItem[] = [
  {
    name: "checkout-flow",
    viewport: "1280x720",
    browser: "chromium",
    environment: "staging",
    latestStatus: "UNCHANGED",
    origin: "branch",
  },
  {
    name: "checkout-flow",
    viewport: "1920x1080",
    browser: "chromium",
    environment: "staging",
    latestStatus: "UNCHANGED",
    origin: "branch",
  },
  {
    name: "login-form",
    viewport: "1280x720",
    browser: "chromium",
    environment: "staging",
    latestStatus: "UNCHANGED",
    origin: "branch",
  },
  {
    name: "old-checkout",
    viewport: "1280x720",
    browser: "chromium",
    environment: "staging",
    latestStatus: "UNCHANGED",
    origin: "inherited",
    inheritedFrom: "main",
  },
];

const mounted: { unmount: () => void }[] = [];

function mountTable(selectable = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(VisualTestsTable, {
    attachTo: document.body,
    props: {
      tests: TESTS,
      projectName: "checkout-ui",
      branchName: "feature/x",
      selectable,
    },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        AlertDialogPortal: { template: "<slot />" },
        DialogPortal: { template: "<slot />" },
        DropdownMenuPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

function card(wrapper: ReturnType<typeof mountTable>, name: string) {
  return wrapper
    .findAll(`[data-testid="${TEST_ID.testResultCard}"]`)
    .find((element) => element.text().includes(name))!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBulkDelete.mockResolvedValue({
    data: {
      deleted: [
        { id: "checkout-flow", success: true },
        { id: "login-form", success: true },
      ],
      failed: [],
    },
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("VisualTestsTable bulk delete", () => {
  it("offers selection only for writers and only for tests owned by the branch", () => {
    const wrapper = mountTable();

    expect(
      wrapper.find(`[data-testid="${TEST_ID.testBulkBar}"]`).exists(),
    ).toBe(true);
    // Three groups, but the inherited one has nothing to delete on this branch.
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.testSelectRow}"]`),
    ).toHaveLength(2);
    expect(card(wrapper, "old-checkout").text()).toContain(
      "inherited from main",
    );
  });

  it("hides the whole bulk surface for a read-only viewer", () => {
    const wrapper = mountTable(false);

    expect(
      wrapper.find(`[data-testid="${TEST_ID.testBulkBar}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.testSelectRow}"]`),
    ).toHaveLength(0);
  });

  it("requires the project name before deleting the selected tests", async () => {
    const wrapper = mountTable();

    await card(wrapper, "checkout-flow")
      .find(`[data-testid="${TEST_ID.testSelectRow}"]`)
      .trigger("change");
    expect(wrapper.text()).toContain("1 test selected");

    await wrapper
      .find(`[data-testid="${TEST_ID.testBulkDelete}"]`)
      .trigger("click");

    const confirm = wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`);
    const input = wrapper.find(`[data-testid="${TEST_ID.dialogRequiredText}"]`);
    expect(confirm.attributes("disabled")).toBeDefined();

    await input.setValue("checkout-ui");
    expect(confirm.attributes("disabled")).toBeUndefined();

    await confirm.trigger("click");
    await flushPromises();

    expect(mockBulkDelete).toHaveBeenCalledWith({
      path: { projectName: "checkout-ui" },
      body: { testNames: ["checkout-flow"], branch: "feature/x" },
    });
    // The selection is consumed by the action it was made for.
    expect(wrapper.text()).toContain("0 tests selected");
  });

  it("selects every deletable test on the page and nothing else", async () => {
    const wrapper = mountTable();

    await wrapper
      .find(`[data-testid="${TEST_ID.testBulkSelectAll}"]`)
      .trigger("change");

    expect(wrapper.text()).toContain("2 tests selected");

    await wrapper
      .find(`[data-testid="${TEST_ID.testBulkDelete}"]`)
      .trigger("click");
    await wrapper
      .find(`[data-testid="${TEST_ID.dialogRequiredText}"]`)
      .setValue("checkout-ui");
    await wrapper
      .find(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");
    await flushPromises();

    expect(mockBulkDelete).toHaveBeenCalledWith({
      path: { projectName: "checkout-ui" },
      body: {
        testNames: ["checkout-flow", "login-form"],
        branch: "feature/x",
      },
    });
  });

  it("reports the tests the server refused instead of hiding them", async () => {
    mockBulkDelete.mockResolvedValue({
      data: {
        deleted: [{ id: "login-form", success: true }],
        failed: [
          { id: "checkout-flow", success: false, error: "Test not found" },
        ],
      },
    });
    const wrapper = mountTable();

    await wrapper
      .find(`[data-testid="${TEST_ID.testBulkSelectAll}"]`)
      .trigger("change");
    await wrapper
      .find(`[data-testid="${TEST_ID.testBulkDelete}"]`)
      .trigger("click");
    await wrapper
      .find(`[data-testid="${TEST_ID.dialogRequiredText}"]`)
      .setValue("checkout-ui");
    await wrapper
      .find(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");
    await flushPromises();

    expect(
      wrapper.find(`[data-testid="${TEST_ID.bulkFailureDialog}"]`).exists(),
    ).toBe(true);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.bulkFailureRow}"]`).text(),
    ).toContain("Test not found");
  });
});

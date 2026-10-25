import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import ProjectStoragePanel from "@/components/storage/ProjectStoragePanel.vue";
import { storageQueryKeys } from "@/domains/storage/query-keys";
import { TEST_ID } from "@/lib/test-ids";

const { mockGet, mockUpdate, canWriteRef } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  canWriteRef: { value: true },
}));

vi.mock("@sdk", () => ({
  storageControllerGet: (...args: unknown[]) => mockGet(...args),
  storageControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
}));

vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: canWriteRef.value }),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function storageDto(overrides: Record<string, unknown> = {}) {
  return {
    usageBytes: "1572864",
    quotaBytes: "10485760",
    percent: 15,
    softPercent: 80,
    warning: false,
    fileCount: 12,
    diffCount: 4,
    baselineRevisionLimit: 5,
    runHistoryDays: 30,
    orphanGraceHours: 24,
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function mountPanel(queryClient: QueryClient = createClient()) {
  const wrapper = mount(ProjectStoragePanel, {
    props: { projectName: "checkout" },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        DialogPortal: { template: "<slot />" },
        SelectPortal: { template: "<slot />" },
        AlertDialogPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForPanel(wrapper: ReturnType<typeof mountPanel>) {
  await vi.waitFor(() =>
    expect(
      wrapper.find(`[data-testid="${TEST_ID.storageUsage}"]`).exists(),
    ).toBe(true),
  );
}

async function openDialog(wrapper: ReturnType<typeof mountPanel>) {
  await wrapper
    .get(`[data-testid="${TEST_ID.storageEditAction}"]`)
    .trigger("click");
  await vi.waitFor(() =>
    expect(
      wrapper.find(`[data-testid="${TEST_ID.storageEditDialog}"]`).exists(),
    ).toBe(true),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  canWriteRef.value = true;
  mockGet.mockResolvedValue({ data: storageDto() });
  mockUpdate.mockResolvedValue({ data: storageDto() });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("ProjectStoragePanel", () => {
  it("renders usage, quota, progress, counts and retention", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    expect(
      wrapper.find(`[data-testid="${TEST_ID.storagePanel}"]`).exists(),
    ).toBe(true);
    expect(wrapper.get(`[data-testid="${TEST_ID.storageUsage}"]`).text()).toBe(
      "1.5 MB used",
    );
    expect(wrapper.get(`[data-testid="${TEST_ID.storageQuota}"]`).text()).toBe(
      "10.0 MB",
    );
    expect(wrapper.text()).toContain("15.0%");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.storageProgress}"]`)
        .attributes("aria-valuenow"),
    ).toBe("15");
    expect(wrapper.text()).toContain("12 files");
    expect(wrapper.text()).toContain("4 diffs");

    const retention = wrapper.get(
      `[data-testid="${TEST_ID.storageRetention}"]`,
    );
    expect(retention.text()).toContain("5 revisions");
    expect(retention.text()).toContain("30 days");
    expect(retention.text()).toContain("24 hours");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.storageWarning}"]`).exists(),
    ).toBe(false);
  });

  it("shows no quota, the warning badge and inherited retention", async () => {
    mockGet.mockResolvedValue({
      data: storageDto({
        quotaBytes: null,
        percent: 0,
        warning: true,
        baselineRevisionLimit: null,
        runHistoryDays: null,
        orphanGraceHours: null,
      }),
    });

    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    expect(wrapper.get(`[data-testid="${TEST_ID.storageQuota}"]`).text()).toBe(
      "No quota",
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.storageWarning}"]`).text(),
    ).toContain("Above 80% of quota");
    const retention = wrapper.get(
      `[data-testid="${TEST_ID.storageRetention}"]`,
    );
    expect(retention.text().match(/Global default/g)).toHaveLength(3);
  });

  it("saves the MB quota as a byte string and the retention limits", async () => {
    const queryClient = createClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = mountPanel(queryClient);
    await waitForPanel(wrapper);
    await openDialog(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.storageQuotaMb}"]`)
      .setValue("25");
    await wrapper
      .get(`[data-testid="${TEST_ID.storageBaselineLimit}"]`)
      .setValue("10");
    await wrapper
      .get(`[data-testid="${TEST_ID.storageRunDays}"]`)
      .setValue("14");
    await wrapper
      .get(`[data-testid="${TEST_ID.storageOrphanHours}"]`)
      .setValue("48");
    await wrapper
      .get(`[data-testid="${TEST_ID.storageSoftPercent}"]`)
      .setValue("90");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout" },
        body: {
          baselineRevisionLimit: 10,
          runHistoryDays: 14,
          orphanGraceHours: 48,
          storageQuotaBytes: String(25 * 1024 * 1024),
          quotaSoftPercent: 90,
        },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Storage settings saved"),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: storageQueryKeys.detail("checkout"),
    });
  });

  it("clears the quota with an empty MB field", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openDialog(wrapper);

    await wrapper.get(`[data-testid="${TEST_ID.storageQuotaMb}"]`).setValue("");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout" },
        body: {
          baselineRevisionLimit: 5,
          runHistoryDays: 30,
          orphanGraceHours: 24,
          storageQuotaBytes: null,
          quotaSoftPercent: 80,
        },
      }),
    );
  });

  it("validates the quota and the soft percent", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openDialog(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.storageQuotaMb}"]`)
      .setValue("0");
    await wrapper
      .get(`[data-testid="${TEST_ID.storageSoftPercent}"]`)
      .setValue("0");

    expect(wrapper.text()).toContain("Quota must be a positive number of MB.");
    expect(wrapper.text()).toContain(
      "Soft percent must be a whole number between 1 and 100.",
    );
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.storageSave}"]`)
        .attributes("disabled"),
    ).toBeDefined();
    await wrapper.find("form").trigger("submit");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a non-integer baseline limit", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openDialog(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.storageBaselineLimit}"]`)
      .setValue("2.5");

    expect(wrapper.text()).toContain(
      "Baseline revisions must be a positive whole number.",
    );
  });

  it("hides the edit action from a read-only viewer", async () => {
    canWriteRef.value = false;

    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    expect(
      wrapper.find(`[data-testid="${TEST_ID.storageEditAction}"]`).exists(),
    ).toBe(false);
    // The panel itself stays readable.
    expect(
      wrapper.find(`[data-testid="${TEST_ID.storageRetention}"]`).exists(),
    ).toBe(true);
  });
});

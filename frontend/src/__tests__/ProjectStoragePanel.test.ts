import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import ProjectStoragePanel from "@/components/storage/ProjectStoragePanel.vue";
import { storageQueryKeys } from "@/domains/storage/query-keys";
import { TEST_ID } from "@/lib/test-ids";

const { mockGet, mockUpdate, mockPreview, canWriteRef } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockPreview: vi.fn(),
  canWriteRef: { value: true },
}));

vi.mock("@sdk", () => ({
  storageControllerGet: (...args: unknown[]) => mockGet(...args),
  storageControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
  storageControllerPreviewRetention: (...args: unknown[]) =>
    mockPreview(...args),
}));

vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: canWriteRef.value }),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function previewDto(overrides: Record<string, unknown> = {}) {
  return {
    baselineRevisions: { limit: 5, overflow: 2 },
    runs: { days: 30, eligible: 1 },
    orphanGraceHours: 24,
    storage: {
      usageBytes: "1572864",
      quotaBytes: "10485760",
      percent: 15,
      warning: false,
    },
    ...overrides,
  };
}

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
  mockPreview.mockResolvedValue({ data: previewDto() });
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
    // The panel itself stays readable, and the dry run deletes nothing so it
    // stays available.
    expect(
      wrapper.find(`[data-testid="${TEST_ID.storageRetention}"]`).exists(),
    ).toBe(true);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.storagePreviewAction}"]`).exists(),
    ).toBe(true);
  });

  it("requests the dry run only after the button is clicked and renders the counts", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    expect(mockPreview).not.toHaveBeenCalled();

    await wrapper
      .get(`[data-testid="${TEST_ID.storagePreviewAction}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockPreview).toHaveBeenCalledWith({
        path: { projectName: "checkout" },
      }),
    );
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.storagePreviewDialog}"]`)
          .exists(),
      ).toBe(true),
    );

    const dialog = wrapper.get(
      `[data-testid="${TEST_ID.storagePreviewDialog}"]`,
    );
    expect(dialog.text()).toContain("Dry run — nothing is deleted");
    expect(dialog.text()).toContain("2 over the limit of 5");
    expect(dialog.text()).toContain("1 eligible in the 30-day window");
    expect(dialog.text()).toContain("24 hours");
    expect(dialog.text()).toContain("1.5 MB used");
    expect(dialog.text()).toContain("15.0%");
    // A dry run must not call the update mutation.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("shows a loading state while the preview is being computed", async () => {
    let resolvePreview: (value: unknown) => void = () => {};
    mockPreview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );

    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.storagePreviewAction}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.storagePreviewLoading}"]`)
          .exists(),
      ).toBe(true),
    );

    resolvePreview({ data: previewDto() });
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("2 over the limit of 5"),
    );
    expect(
      wrapper.find(`[data-testid="${TEST_ID.storagePreviewLoading}"]`).exists(),
    ).toBe(false);
  });

  it("shows an error state when the preview fails", async () => {
    mockPreview.mockRejectedValue(new Error("Preview is unavailable"));

    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.storagePreviewAction}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.storagePreviewError}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.storagePreviewError}"]`).text(),
    ).toContain("Preview is unavailable");
  });

  it("closes the preview dialog", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.storagePreviewAction}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.storagePreviewDialog}"]`)
          .exists(),
      ).toBe(true),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.storagePreviewClose}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.storagePreviewDialog}"]`)
          .exists(),
      ).toBe(false),
    );
  });
});

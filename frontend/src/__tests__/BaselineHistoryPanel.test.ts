import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import BaselineHistoryPanel from "@/components/detail-panels/BaselineHistoryPanel.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockRestore } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockRestore: vi.fn(),
}));

vi.mock("@sdk", () => ({
  baselineHistoryControllerList: (...args: unknown[]) => mockList(...args),
  baselineHistoryControllerRestore: (...args: unknown[]) =>
    mockRestore(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The panel's job is the confirm-before-restore flow, so the dialog is a probe
// that only renders while it is open: closing/confirming are the panel's
// concern, the dialog's chrome is ConfirmDialog's own contract.
const ConfirmDialogStub = {
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    confirmText: { type: String, default: "" },
    pending: { type: Boolean, default: false },
  },
  emits: ["update:open", "confirm", "cancel"],
  template: `<div v-if="open" data-testid="confirm-stub">
    <span data-testid="confirm-stub-title">{{ title }}</span>
    <p data-testid="confirm-stub-description">{{ description }}</p>
    <button type="button" data-testid="confirm-stub-confirm" @click="$emit('confirm')">
      {{ confirmText }}
    </button>
  </div>`,
};

function revisionDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "rev-1",
    viewport: "1920x1080",
    browser: "Chrome",
    environment: "staging",
    imageUrl: "http://localhost:9000/vrt/baseline.png",
    signedImageUrl: "http://localhost:9000/vrt/baseline.png?signature=abc",
    imageHash: "hash-old",
    pageCount: null,
    pixelDiffThreshold: 12,
    reason: "approval",
    createdBy: "jane.doe",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountPanel(
  props: Partial<{
    projectName: string;
    testName: string;
    branch: string;
    variant: { viewport?: string; browser?: string; environment?: string };
    currentHash: string;
    kind: "image" | "pdf";
    readOnly: boolean;
  }> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(BaselineHistoryPanel, {
    props: {
      projectName: "checkout",
      testName: "login",
      branch: "feature/x",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
      ...props,
    },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: { ConfirmDialog: ConfirmDialogStub },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForHistory(
  wrapper: ReturnType<typeof mountPanel>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(
      wrapper.get(`[data-testid="${TEST_ID.baselineHistoryToggle}"]`).text(),
    ).toContain(`Baseline history (${count})`),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRestore.mockResolvedValue({
    data: {
      baselineUrl: "http://localhost:9000/vrt/baseline.png",
      signedBaselineUrl: "http://localhost:9000/vrt/baseline.png?sig=1",
    },
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("BaselineHistoryPanel", () => {
  it("reads the history of the resolved variant on the selected branch", async () => {
    mockList.mockResolvedValue({ data: [] });

    const wrapper = mountPanel();
    await waitForHistory(wrapper, 0);

    expect(mockList).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
        branch: "feature/x",
      },
    });
  });

  it("explains the empty history", async () => {
    mockList.mockResolvedValue({ data: [] });

    const wrapper = mountPanel();
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.baselineHistoryEmpty}"]`)
          .exists(),
      ).toBe(true),
    );

    expect(
      wrapper.get(`[data-testid="${TEST_ID.baselineHistoryEmpty}"]`).text(),
    ).toContain("No replaced baselines yet");
  });

  it("renders one row per revision with reason, actor and threshold", async () => {
    mockList.mockResolvedValue({
      data: [
        revisionDto(),
        revisionDto({
          id: "rev-2",
          imageHash: "hash-older",
          reason: "restore",
          createdBy: null,
          pixelDiffThreshold: 0,
          createdAt: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
        }),
      ],
    });

    const wrapper = mountPanel();
    await waitForHistory(wrapper, 2);

    const rows = wrapper.findAll(
      `[data-testid="${TEST_ID.baselineHistoryRow}"]`,
    );
    expect(rows).toHaveLength(2);

    expect(
      rows[0]!.get(`[data-testid="${TEST_ID.baselineHistoryReason}"]`).text(),
    ).toBe("Approval");
    expect(rows[0]!.text()).toContain("jane.doe");
    expect(rows[0]!.text()).toContain("≤ 12 px");
    expect(rows[0]!.text()).toContain("5 minutes ago");

    expect(
      rows[1]!.get(`[data-testid="${TEST_ID.baselineHistoryReason}"]`).text(),
    ).toBe("Restore");
    expect(rows[1]!.text()).toContain("unknown");
    expect(rows[1]!.text()).toContain("≤ 0 px");
    expect(rows[1]!.text()).toContain("yesterday");
  });

  it("renders the presigned thumbnail with an alt text", async () => {
    mockList.mockResolvedValue({ data: [revisionDto()] });

    const wrapper = mountPanel();
    await waitForHistory(wrapper, 1);

    const thumb = wrapper.get(
      `[data-testid="${TEST_ID.baselineHistoryThumb}"]`,
    );
    expect(thumb.element.tagName).toBe("IMG");
    expect(thumb.attributes("src")).toBe(
      "http://localhost:9000/vrt/baseline.png?signature=abc",
    );
    expect(thumb.attributes("alt")).toContain("Baseline from");
  });

  it("shows a PDF placeholder with the recorded page count", async () => {
    mockList.mockResolvedValue({
      data: [revisionDto({ pageCount: 7, reason: "approval" })],
    });

    const wrapper = mountPanel({ kind: "pdf" });
    await waitForHistory(wrapper, 1);

    const thumb = wrapper.get(
      `[data-testid="${TEST_ID.baselineHistoryThumb}"]`,
    );
    expect(thumb.element.tagName).not.toBe("IMG");
    expect(
      wrapper.get(`[data-testid="${TEST_ID.baselineHistoryRow}"]`).text(),
    ).toContain("7 pages");
  });

  it("names the restore button after the revision it restores", async () => {
    mockList.mockResolvedValue({ data: [revisionDto()] });

    const wrapper = mountPanel();
    await waitForHistory(wrapper, 1);

    const button = wrapper.get(
      `[data-testid="${TEST_ID.baselineHistoryRestore}"]`,
    );
    expect(button.attributes("aria-label")).toBe(
      "Restore the baseline from 5 minutes ago",
    );
  });

  it("confirms before restoring and sends the revision id", async () => {
    mockList.mockResolvedValue({ data: [revisionDto()] });

    const wrapper = mountPanel();
    await waitForHistory(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.baselineHistoryRestore}"]`)
      .trigger("click");

    const description = wrapper.get('[data-testid="confirm-stub-description"]');
    expect(description.text()).toContain("replaces the current baseline");
    expect(description.text()).toContain("retires any pending comparison");

    expect(mockRestore).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="confirm-stub-confirm"]').trigger("click");

    await vi.waitFor(() =>
      expect(mockRestore).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        body: { revisionId: "rev-1" },
        query: { branch: "feature/x" },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Baseline restored for 1920x1080 / Chrome / staging of "login"',
      ),
    );
  });

  it("disables the restore of the revision that is already the baseline", async () => {
    mockList.mockResolvedValue({
      data: [
        revisionDto(),
        revisionDto({ id: "rev-2", imageHash: "hash-older" }),
      ],
    });

    const wrapper = mountPanel({ currentHash: "hash-older" });
    await waitForHistory(wrapper, 2);

    const buttons = wrapper.findAll(
      `[data-testid="${TEST_ID.baselineHistoryRestore}"]`,
    );
    expect(buttons[0]!.attributes("disabled")).toBeUndefined();
    expect(buttons[1]!.attributes("disabled")).toBeDefined();
    expect(
      wrapper
        .findAll(`[data-testid="${TEST_ID.baselineHistoryRow}"]`)[1]!
        .text(),
    ).toContain("current");
  });

  it("never offers a restore for a read-only (inherited) baseline", async () => {
    mockList.mockResolvedValue({ data: [revisionDto()] });

    const wrapper = mountPanel({ readOnly: true });
    await waitForHistory(wrapper, 1);

    expect(
      wrapper
        .find(`[data-testid="${TEST_ID.baselineHistoryRestore}"]`)
        .exists(),
    ).toBe(false);
    expect(
      wrapper.get(`[data-testid="${TEST_ID.baselineHistoryRow}"]`).text(),
    ).toContain("jane.doe");
  });

  it("offers a retry when the history cannot be loaded", async () => {
    mockList.mockRejectedValueOnce(new Error("boom"));

    const wrapper = mountPanel();
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Failed to load baseline history"),
    );

    mockList.mockResolvedValue({ data: [revisionDto()] });
    await wrapper.get(`[data-testid="${TEST_ID.retry}"]`).trigger("click");

    await waitForHistory(wrapper, 1);
  });
});

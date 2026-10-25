import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { nextTick } from "vue";
import { toast } from "vue-sonner";
import WebhooksView from "@/views/WebhooksView.vue";
import { Select } from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

const {
  mockList,
  mockCreate,
  mockUpdate,
  mockRemove,
  mockTest,
  mockDeliveries,
  mockReplay,
} = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockRemove: vi.fn(),
  mockTest: vi.fn(),
  mockDeliveries: vi.fn(),
  mockReplay: vi.fn(),
}));

vi.mock("@sdk", () => ({
  webhooksControllerList: (...args: unknown[]) => mockList(...args),
  webhooksControllerCreate: (...args: unknown[]) => mockCreate(...args),
  webhooksControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
  webhooksControllerRemove: (...args: unknown[]) => mockRemove(...args),
  webhooksControllerTest: (...args: unknown[]) => mockTest(...args),
  webhooksControllerDeliveries: (...args: unknown[]) => mockDeliveries(...args),
  webhooksControllerReplay: (...args: unknown[]) => mockReplay(...args),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { projectName: "checkout" }, query: {} }),
  RouterLink: { template: "<a><slot /></a>" },
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function endpointDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh-1",
    url: "https://hooks.example.com/vrt",
    events: ["review.requested", "comparison.approved"],
    format: "json",
    active: true,
    secretPreview: "****abcd",
    createdAt: minutesAgo(5),
    updatedAt: minutesAgo(5),
    ...overrides,
  };
}

function deliveryDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "d-1",
    event: "review.requested",
    status: "PENDING",
    attempts: 0,
    responseStatus: null,
    lastError: null,
    nextAttemptAt: null,
    createdAt: minutesAgo(2),
    deliveredAt: null,
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Dialogs portal out of the component tree; rendering the portal slots inline
  // keeps the real dialogs (and their form semantics) inside the wrapper so the
  // test can drive them. Attaching to the document body also gives the dialog
  // focus trap a real body to work against.
  const wrapper = mount(WebhooksView, {
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

async function waitForRows(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.webhookRow}"]`),
    ).toHaveLength(count),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ data: [endpointDto()] });
  mockCreate.mockResolvedValue({
    data: { ...endpointDto({ id: "wh-2" }), secret: "generated-secret" },
  });
  mockUpdate.mockResolvedValue({ data: endpointDto({ active: false }) });
  mockRemove.mockResolvedValue({ data: {} });
  mockTest.mockResolvedValue({ data: { queued: true } });
  mockDeliveries.mockResolvedValue({ data: [] });
  mockReplay.mockResolvedValue({ data: { queued: true } });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("WebhooksView", () => {
  it("explains the empty state", async () => {
    mockList.mockResolvedValue({ data: [] });

    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.webhooksEmpty}"]`).exists(),
      ).toBe(true),
    );
    const empty = wrapper.get(`[data-testid="${TEST_ID.webhooksEmpty}"]`);
    expect(empty.text()).toContain("No webhook endpoints yet");
    expect(empty.text()).toContain(
      "subscribe a project to review and approval events",
    );
  });

  it("renders a row with its events, format and secret preview", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    const row = wrapper.get(`[data-testid="${TEST_ID.webhookRow}"]`);
    expect(row.text()).toContain("Review requested");
    expect(row.text()).toContain("Comparison approved");
    expect(row.text()).toContain("JSON");
    expect(row.text()).toContain("****abcd");
    expect(row.text()).toContain("Active");

    const url = row.get(`[data-testid="${TEST_ID.webhookEndpointUrl}"]`);
    expect(url.text()).toBe("https://hooks.example.com/vrt");
    expect(url.attributes("title")).toBe("https://hooks.example.com/vrt");
  });

  it("creates an endpoint from the dialog and reveals the one-time secret", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper.get(`[data-testid="${TEST_ID.webhookAdd}"]`).trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.webhookUrlInput}"]`).exists(),
      ).toBe(true),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.webhookUrlInput}"]`)
      .setValue("https://hooks.example.com/new");

    const checkboxes = wrapper.findAll(
      `[data-testid="${TEST_ID.webhookEventCheckbox}"]`,
    );
    expect(checkboxes).toHaveLength(2);
    await checkboxes[1]!.setValue(false);

    wrapper.getComponent(Select).vm.$emit("update:modelValue", "slack");
    await nextTick();

    expect(
      wrapper.find(`[data-testid="${TEST_ID.webhookFormatSelect}"]`).exists(),
    ).toBe(true);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.webhookSubmit}"]`).exists(),
    ).toBe(true);

    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        path: { projectName: "checkout" },
        body: {
          url: "https://hooks.example.com/new",
          events: ["review.requested"],
          format: "slack",
        },
      }),
    );

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.webhookSecretDialog}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.webhookSecretValue}"]`).text(),
    ).toBe("generated-secret");
    expect(
      wrapper.get(`[data-testid="${TEST_ID.webhookSecretDialog}"]`).text(),
    ).toContain("shown only once");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.webhookSecretCopy}"]`).exists(),
    ).toBe(true);
  });

  it("toggles the active flag through the update endpoint", async () => {
    let resolveUpdate: (value: unknown) => void = () => {};
    mockUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    const toggle = wrapper.get(
      `[data-testid="${TEST_ID.webhookActiveToggle}"]`,
    );
    expect(toggle.attributes("role")).toBe("switch");
    expect(toggle.attributes("aria-label")).toContain(
      "https://hooks.example.com/vrt",
    );

    await toggle.setValue(false);

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout", id: "wh-1" },
        body: { active: false },
      }),
    );
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.webhookActiveToggle}"]`)
        .attributes("disabled"),
    ).toBeDefined();

    resolveUpdate({ data: endpointDto({ active: false }) });
    await vi.waitFor(() =>
      expect(
        wrapper
          .get(`[data-testid="${TEST_ID.webhookActiveToggle}"]`)
          .attributes("disabled"),
      ).toBeUndefined(),
    );
  });

  it("confirms before deleting and sends the endpoint id", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.webhookDelete}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogDescription}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.dialogDescription}"]`).text(),
    ).toContain("https://hooks.example.com/vrt");

    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockRemove).toHaveBeenCalledWith({
        path: { projectName: "checkout", id: "wh-1" },
      }),
    );
  });

  it("lists deliveries and replays one", async () => {
    mockDeliveries.mockResolvedValue({
      data: [
        deliveryDto({
          status: "FAILED",
          event: "comparison.approved",
          attempts: 5,
          responseStatus: 500,
          lastError: "connection refused",
          createdAt: minutesAgo(3),
        }),
      ],
    });

    const wrapper = mountView();
    await waitForRows(wrapper, 1);
    expect(mockDeliveries).not.toHaveBeenCalled();

    await wrapper
      .get(`[data-testid="${TEST_ID.webhookDeliveries}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.webhookDeliveryRow}"]`),
      ).toHaveLength(1),
    );
    expect(mockDeliveries).toHaveBeenCalledWith({
      path: { projectName: "checkout", id: "wh-1" },
    });

    const row = wrapper.get(`[data-testid="${TEST_ID.webhookDeliveryRow}"]`);
    expect(
      row.get(`[data-testid="${TEST_ID.webhookDeliveryStatus}"]`).text(),
    ).toBe("Failed");
    expect(row.text()).toContain("Comparison approved");
    expect(row.text()).toContain("5/5 attempts");
    expect(row.text()).toContain("HTTP 500");

    const error = row.get(`[data-testid="${TEST_ID.webhookDeliveryError}"]`);
    expect(error.text()).toBe("connection refused");
    expect(error.attributes("title")).toBe("connection refused");

    await row.get(`[data-testid="${TEST_ID.webhookReplay}"]`).trigger("click");

    await vi.waitFor(() =>
      expect(mockReplay).toHaveBeenCalledWith({
        path: { projectName: "checkout", id: "wh-1", deliveryId: "d-1" },
      }),
    );
  });

  it("says so when an endpoint has no deliveries yet", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.webhookDeliveries}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.webhookDeliveriesEmpty}"]`)
          .exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.webhookDeliveriesEmpty}"]`).text(),
    ).toBe("No deliveries yet");
  });

  it("queues a synthetic test delivery", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.webhookTest}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockTest).toHaveBeenCalledWith({
        path: { projectName: "checkout", id: "wh-1" },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Test delivery queued"),
    );
  });
});

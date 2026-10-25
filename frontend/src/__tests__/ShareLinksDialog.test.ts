import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import ShareLinksDialog from "@/components/share/ShareLinksDialog.vue";
import { Select } from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockCreate, mockRevoke } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockRevoke: vi.fn(),
}));

vi.mock("@sdk", () => ({
  shareLinksControllerList: (...args: unknown[]) => mockList(...args),
  shareLinksControllerCreate: (...args: unknown[]) => mockCreate(...args),
  shareLinkRevokeControllerRevoke: (...args: unknown[]) => mockRevoke(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function linkDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    scope: "TEST",
    projectName: "checkout",
    testName: "login",
    branchName: "main",
    runKey: null,
    createdBy: "alice",
    createdAt: "2026-10-01T10:00:00.000Z",
    expiresAt: "2099-10-08T10:00:00.000Z",
    revokedAt: null,
    lastAccessedAt: null,
    accessCount: 3,
    hasPassphrase: true,
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(ShareLinksDialog, {
    props: { open: true, projectName: "checkout" },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        DialogPortal: { template: "<slot />" },
        AlertDialogPortal: { template: "<slot />" },
        SelectPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForLinks(wrapper: ReturnType<typeof mountDialog>) {
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.shareLinkRow}"]`).length,
    ).toBeGreaterThan(0),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ data: [linkDto()] });
  mockCreate.mockResolvedValue({
    data: { link: linkDto({ id: "link-2" }), token: "tok-2" },
  });
  mockRevoke.mockResolvedValue({ data: linkDto({ revokedAt: "2026-10-02" }) });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("ShareLinksDialog", () => {
  it("lists links with scope, target, access count and passphrase badge", async () => {
    const wrapper = mountDialog();
    await waitForLinks(wrapper);

    const row = wrapper.get(`[data-testid="${TEST_ID.shareLinkRow}"]`);
    expect(row.text()).toContain("Single test");
    expect(row.text()).toContain("login · main");
    expect(row.text()).toContain("Passphrase");
    expect(row.text()).toContain("alice");
    expect(row.text()).toContain("3 accesses");
  });

  it("creates a test-scoped link and shows the full URL", async () => {
    const wrapper = mountDialog();
    await waitForLinks(wrapper);

    const scopeSelect = wrapper
      .findAllComponents(Select)
      .find((component) =>
        component.find(`[data-testid="${TEST_ID.shareScope}"]`).exists(),
      );
    if (!scopeSelect) throw new Error("scope select not found");
    scopeSelect.vm.$emit("update:modelValue", "TEST");
    await nextTick();

    await wrapper
      .get(`[data-testid="${TEST_ID.shareTestName}"]`)
      .setValue("login");
    await wrapper
      .get(`[data-testid="${TEST_ID.shareBranch}"]`)
      .setValue("main");
    await wrapper.get(`[data-testid="${TEST_ID.shareExpiry}"]`).setValue("14");
    await wrapper
      .get(`[data-testid="${TEST_ID.shareCreatePassphrase}"]`)
      .setValue("secret");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        path: { projectName: "checkout" },
        body: {
          scope: "TEST",
          testName: "login",
          branch: "main",
          expiresInDays: 14,
          passphrase: "secret",
        },
      }),
    );

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.shareCreatedUrl}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.shareCreatedUrl}"]`).text(),
    ).toBe(`${window.location.origin}/share/tok-2`);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.shareCopyUrl}"]`).exists(),
    ).toBe(true);
  });

  it("revokes a link after confirmation", async () => {
    const wrapper = mountDialog();
    await waitForLinks(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.shareRevoke}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");
    await nextTick();

    await vi.waitFor(() =>
      expect(mockRevoke).toHaveBeenCalledWith({ path: { id: "link-1" } }),
    );
  });

  it("validates that a test target and a valid expiry are provided", async () => {
    const wrapper = mountDialog();
    await waitForLinks(wrapper);

    const scopeSelect = wrapper
      .findAllComponents(Select)
      .find((component) =>
        component.find(`[data-testid="${TEST_ID.shareScope}"]`).exists(),
      );
    if (!scopeSelect) throw new Error("scope select not found");
    scopeSelect.vm.$emit("update:modelValue", "TEST");

    await wrapper.get(`[data-testid="${TEST_ID.shareExpiry}"]`).setValue("0");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.text()).toContain("Choose a target for this scope.");
    expect(wrapper.text()).toContain("Expiry must be between 1 and 365 days.");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

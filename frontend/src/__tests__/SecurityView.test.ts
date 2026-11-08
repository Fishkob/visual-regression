import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import SecurityView from "@/views/SecurityView.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockSessions, mockRevoke, mockRevokeAll } = vi.hoisted(() => ({
  mockSessions: vi.fn(),
  mockRevoke: vi.fn(),
  mockRevokeAll: vi.fn(),
}));

vi.mock("@sdk", () => ({
  authControllerListSessions: (...args: unknown[]) => mockSessions(...args),
  authControllerRevokeSession: (...args: unknown[]) => mockRevoke(...args),
  authControllerRevokeAllSessions: (...args: unknown[]) =>
    mockRevokeAll(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function sessionDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "s-1",
    createdAt: minutesAgo(60),
    lastSeenAt: minutesAgo(2),
    expiresAt: minutesAgo(-60 * 24),
    ip: "10.0.0.1",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0",
    isCurrent: true,
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(SecurityView, {
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

async function waitForSessions(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.sessionRow}"]`),
    ).toHaveLength(count),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessions.mockResolvedValue({
    data: [
      sessionDto(),
      sessionDto({
        id: "s-2",
        isCurrent: false,
        ip: "10.0.0.2",
        lastSeenAt: null,
        userAgent: "curl/8.5.0",
      }),
    ],
  });
  mockRevoke.mockResolvedValue({});
  mockRevokeAll.mockResolvedValue({ data: { revoked: 2 } });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("SecurityView", () => {
  it("lists sessions with a current badge and revokes another one", async () => {
    const wrapper = mountView();
    await waitForSessions(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.sessionRow}"]`);
    expect(
      rows[0].find(`[data-testid="${TEST_ID.sessionCurrent}"]`).exists(),
    ).toBe(true);
    // The current session cannot be revoked from the list.
    expect(
      rows[0].find(`[data-testid="${TEST_ID.sessionRevoke}"]`).exists(),
    ).toBe(false);
    expect(rows[1].text()).toContain("never");
    expect(rows[1].text()).toContain("10.0.0.2");

    await rows[1]
      .get(`[data-testid="${TEST_ID.sessionRevoke}"]`)
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
      expect(mockRevoke).toHaveBeenCalledWith({ path: { id: "s-2" } }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Session revoked"),
    );
  });

  it("logs out all other sessions and reports the revoked count", async () => {
    const wrapper = mountView();
    await waitForSessions(wrapper, 2);

    await wrapper
      .get(`[data-testid="${TEST_ID.sessionsRevokeAll}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() => expect(mockRevokeAll).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Signed out 2 other sessions"),
    );
  });

  it("disables logging out others when this is the only session", async () => {
    mockSessions.mockResolvedValue({ data: [sessionDto()] });

    const wrapper = mountView();
    await waitForSessions(wrapper, 1);

    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.sessionsRevokeAll}"]`)
        .attributes("disabled"),
    ).toBeDefined();
  });
});

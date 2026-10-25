import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import SecurityView from "@/views/SecurityView.vue";
import { TEST_ID } from "@/lib/test-ids";

const {
  mockMe,
  mockSetup,
  mockEnable,
  mockDisable,
  mockSessions,
  mockRevoke,
  mockRevokeAll,
} = vi.hoisted(() => ({
  mockMe: vi.fn(),
  mockSetup: vi.fn(),
  mockEnable: vi.fn(),
  mockDisable: vi.fn(),
  mockSessions: vi.fn(),
  mockRevoke: vi.fn(),
  mockRevokeAll: vi.fn(),
}));

vi.mock("@sdk", () => ({
  authControllerMe: (...args: unknown[]) => mockMe(...args),
  authControllerSetupTwoFactor: (...args: unknown[]) => mockSetup(...args),
  authControllerEnableTwoFactor: (...args: unknown[]) => mockEnable(...args),
  authControllerDisableTwoFactor: (...args: unknown[]) => mockDisable(...args),
  authControllerListSessions: (...args: unknown[]) => mockSessions(...args),
  authControllerRevokeSession: (...args: unknown[]) => mockRevoke(...args),
  authControllerRevokeAllSessions: (...args: unknown[]) =>
    mockRevokeAll(...args),
  authControllerLogin: vi.fn(),
  authControllerLogout: vi.fn(),
  authControllerChangePassword: vi.fn(),
  authControllerVerifyTwoFactor: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

let twoFactorEnabled = false;

function meDto() {
  return {
    username: "alice",
    role: "MEMBER",
    mustChangePassword: false,
    totpEnabled: twoFactorEnabled,
  };
}

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
  twoFactorEnabled = false;
  mockMe.mockImplementation(async () => ({ data: meDto() }));
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
  mockSetup.mockResolvedValue({
    data: {
      secret: "JBSWY3DPEHPK3PXP",
      otpauthUrl: "otpauth://totp/vrt:alice?secret=JBSWY3DPEHPK3PXP",
    },
  });
  mockEnable.mockResolvedValue({
    data: { recoveryCodes: ["AAAA-BBBB", "CCCC-DDDD"] },
  });
  mockDisable.mockResolvedValue({});
  mockRevoke.mockResolvedValue({});
  mockRevokeAll.mockResolvedValue({ data: { revoked: 2 } });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("SecurityView", () => {
  it("starts 2FA setup, enables it and reveals the recovery codes", async () => {
    const wrapper = mountView();
    await waitForSessions(wrapper, 2);

    const enableButton = wrapper.get(
      `[data-testid="${TEST_ID.twoFactorEnable}"]`,
    );
    await enableButton.trigger("click");

    await vi.waitFor(() => expect(mockSetup).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(
        wrapper.get(`[data-testid="${TEST_ID.twoFactorSecret}"]`).text(),
      ).toBe("JBSWY3DPEHPK3PXP"),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.twoFactorSetupUri}"]`).text(),
    ).toBe("otpauth://totp/vrt:alice?secret=JBSWY3DPEHPK3PXP");

    await wrapper
      .get(`[data-testid="${TEST_ID.twoFactorCode}"]`)
      .setValue("123456");
    await wrapper
      .get(`[data-testid="${TEST_ID.twoFactorConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockEnable).toHaveBeenCalledWith({
        body: { code: "123456" },
      }),
    );
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.recoveryCodes}"]`).exists(),
      ).toBe(true),
    );

    const dialog = wrapper.get(`[data-testid="${TEST_ID.recoveryCodes}"]`);
    expect(dialog.text()).toContain("Store these now");
    expect(dialog.text()).toContain("AAAA-BBBB");
    expect(dialog.text()).toContain("CCCC-DDDD");
    expect(toast.success).toHaveBeenCalledWith(
      "Two-factor authentication enabled",
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.recoveryCodesDone}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.recoveryCodes}"]`).exists(),
      ).toBe(false),
    );
  });

  it("disables 2FA after a password confirmation", async () => {
    twoFactorEnabled = true;

    const wrapper = mountView();
    await waitForSessions(wrapper, 2);
    expect(wrapper.text()).toContain("Recovery codes were issued");

    await wrapper
      .get(`[data-testid="${TEST_ID.twoFactorDisable}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.twoFactorPassword}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.twoFactorPassword}"]`)
      .setValue("secret");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockDisable).toHaveBeenCalledWith({
        body: { password: "secret" },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Two-factor authentication disabled",
      ),
    );
  });

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

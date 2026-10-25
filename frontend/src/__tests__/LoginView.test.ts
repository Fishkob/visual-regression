import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import LoginView from "@/views/LoginView.vue";
import { TEST_ID } from "@/lib/test-ids";

function mountLogin() {
  return mount(LoginView);
}

const push = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  RouterLink: { template: "<a><slot /></a>" },
}));

vi.mock("@tanstack/vue-query", () => ({
  useMutation: (cfg: unknown) => {
    const c = cfg as {
      mutationFn: (v: unknown) => Promise<unknown>;
      onSuccess?: (data: unknown) => void;
      onError?: () => void;
    };
    return {
      mutateAsync: vi.fn(async (v: unknown) => {
        const data = await c.mutationFn(v);
        c.onSuccess?.(data);
        return data;
      }),
      isPending: false,
      error: null,
    };
  },
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { mockLogin, mockVerifyTwoFactor } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockVerifyTwoFactor: vi.fn(),
}));

vi.mock("@sdk", () => ({
  authControllerLogin: (...a: unknown[]) => mockLogin(...a),
  authControllerVerifyTwoFactor: (...a: unknown[]) => mockVerifyTwoFactor(...a),
  authControllerMe: vi.fn(),
  authControllerChangePassword: vi.fn(),
  authControllerLogout: vi.fn(),
}));

async function fillPasswordStep(wrapper: ReturnType<typeof mountLogin>) {
  await wrapper
    .get(`[data-testid="${TEST_ID.loginUsername}"]`)
    .setValue("alice");
  await wrapper
    .get(`[data-testid="${TEST_ID.loginPassword}"]`)
    .setValue("secret");
  await wrapper.find("form").trigger("submit");
}

describe("LoginView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits username and password on submit", async () => {
    mockLogin.mockResolvedValue({ data: { username: "alice" } });
    const wrapper = mountLogin();

    await fillPasswordStep(wrapper);

    await vi.waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(mockLogin).toHaveBeenCalledWith({
      body: { username: "alice", password: "secret" },
    });
    expect(push).toHaveBeenCalledWith({ name: "review-inbox" });
  });

  it("labels the credential inputs", () => {
    const wrapper = mountLogin();

    for (const [testId, labelText] of [
      [TEST_ID.loginUsername, "Username"],
      [TEST_ID.loginPassword, "Password"],
    ] as const) {
      const input = wrapper.get(`[data-testid="${testId}"]`);
      const id = input.attributes("id");
      expect(id).toBeTruthy();
      expect(wrapper.get(`label[for="${id}"]`).text()).toBe(labelText);
    }
  });

  it("surfaces an error message when login fails", async () => {
    mockLogin.mockResolvedValue({
      error: { message: "Invalid username or password" },
    });
    const wrapper = mountLogin();

    await fillPasswordStep(wrapper);

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Invalid username or password"),
    );
  });

  it("switches to the code step on a 2FA challenge and verifies it", async () => {
    mockLogin.mockResolvedValue({
      data: { twoFactorRequired: true, challengeToken: "challenge-1" },
    });
    mockVerifyTwoFactor.mockResolvedValue({
      data: {
        username: "alice",
        role: "MEMBER",
        mustChangePassword: false,
        totpEnabled: true,
      },
    });

    const wrapper = mountLogin();
    await fillPasswordStep(wrapper);

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`).exists(),
      ).toBe(true),
    );
    // The challenge is not a session: nothing is navigated until the code
    // verifies.
    expect(push).not.toHaveBeenCalled();

    await wrapper
      .get(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`)
      .setValue("123456");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockVerifyTwoFactor).toHaveBeenCalledWith({
        body: { challengeToken: "challenge-1", code: "123456" },
      }),
    );
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith({ name: "review-inbox" }),
    );
  });

  it("accepts a recovery code as the second factor", async () => {
    mockLogin.mockResolvedValue({
      data: { twoFactorRequired: true, challengeToken: "challenge-1" },
    });
    mockVerifyTwoFactor.mockResolvedValue({
      data: {
        username: "alice",
        role: "MEMBER",
        mustChangePassword: false,
        totpEnabled: true,
      },
    });

    const wrapper = mountLogin();
    await fillPasswordStep(wrapper);
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`).exists(),
      ).toBe(true),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`)
      .setValue("ABCD-EFGH");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockVerifyTwoFactor).toHaveBeenCalledWith({
        body: { challengeToken: "challenge-1", code: "ABCD-EFGH" },
      }),
    );
  });

  it("shows an inline error for a wrong code and keeps the code step", async () => {
    mockLogin.mockResolvedValue({
      data: { twoFactorRequired: true, challengeToken: "challenge-1" },
    });
    mockVerifyTwoFactor.mockResolvedValue({
      error: { message: "Invalid two-factor code" },
    });

    const wrapper = mountLogin();
    await fillPasswordStep(wrapper);
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`).exists(),
      ).toBe(true),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`)
      .setValue("000000");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(
        wrapper.get(`[data-testid="${TEST_ID.loginTwoFactorError}"]`).text(),
      ).toContain("Invalid two-factor code"),
    );
    expect(
      wrapper.find(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`).exists(),
    ).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("returns to the password step and drops the challenge", async () => {
    mockLogin.mockResolvedValue({
      data: { twoFactorRequired: true, challengeToken: "challenge-1" },
    });

    const wrapper = mountLogin();
    await fillPasswordStep(wrapper);
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`).exists(),
      ).toBe(true),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.loginTwoFactorBack}"]`)
      .trigger("click");

    expect(
      wrapper.find(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.loginSubmit}"]`).exists(),
    ).toBe(true);

    // A second attempt starts from a fresh password submission (the old
    // challenge is gone, so the code step is only reachable again via login).
    mockLogin.mockResolvedValue({
      data: { twoFactorRequired: true, challengeToken: "challenge-2" },
    });
    await fillPasswordStep(wrapper);
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.loginTwoFactorCode}"]`).exists(),
      ).toBe(true),
    );
    expect(mockLogin).toHaveBeenCalledTimes(2);
  });
});

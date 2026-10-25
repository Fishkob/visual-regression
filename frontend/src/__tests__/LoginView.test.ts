import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import LoginView from "@/views/LoginView.vue";
import { TEST_ID } from "@/lib/test-ids";

const push = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  RouterLink: { template: "<a><slot /></a>" },
}));

vi.mock("@tanstack/vue-query", () => ({
  useMutation: (cfg: unknown) => {
    const c = cfg as {
      mutationFn: (v: unknown) => Promise<unknown>;
      onSuccess?: () => void;
      onError?: () => void;
    };
    return {
      mutateAsync: vi.fn(async (v: unknown) => {
        await c.mutationFn(v);
        c.onSuccess?.();
      }),
      isPending: false,
      error: null,
    };
  },
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    clear: vi.fn(),
  }),
}));

const mockLogin = vi.hoisted(() => vi.fn());
vi.mock("@sdk", () => ({
  authControllerLogin: (...a: unknown[]) => mockLogin(...a),
}));

describe("LoginView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits username and password on submit", async () => {
    mockLogin.mockResolvedValue({ data: { username: "alice" } });
    const wrapper = mount(LoginView);

    await wrapper
      .get(`[data-testid="${TEST_ID.loginUsername}"]`)
      .setValue("alice");
    await wrapper
      .get(`[data-testid="${TEST_ID.loginPassword}"]`)
      .setValue("secret");
    await wrapper.find("form").trigger("submit");
    await vi.waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(mockLogin).toHaveBeenCalledWith({
      body: { username: "alice", password: "secret" },
    });
    expect(push).toHaveBeenCalledWith({ name: "review-inbox" });
  });

  it("labels the credential inputs", () => {
    const wrapper = mount(LoginView);

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
    const wrapper = mount(LoginView);

    await wrapper
      .get(`[data-testid="${TEST_ID.loginUsername}"]`)
      .setValue("alice");
    await wrapper
      .get(`[data-testid="${TEST_ID.loginPassword}"]`)
      .setValue("wrong");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Invalid username or password"),
    );
  });
});

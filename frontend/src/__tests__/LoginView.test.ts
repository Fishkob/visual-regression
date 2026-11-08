import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import LoginView from "@/views/LoginView.vue";
import { TEST_ID } from "@/lib/test-ids";

function mountLogin() {
  return mount(LoginView, { global: { plugins: [] } });
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

const { mockLogin } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
}));

vi.mock("@sdk", () => ({
  authControllerLogin: (...a: unknown[]) => mockLogin(...a),
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
});

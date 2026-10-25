import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import {
  useChangePassword,
  useCurrentRole,
  useLogin,
  useMeQuery,
} from "@/composables/useAuth";
import { authQueryKeys } from "@/domains/auth/query-keys";
import type { CurrentUser } from "@/domains/auth/auth.model";

const queryOptions = vi.hoisted(() => ({
  current: undefined as
    | undefined
    | { queryKey: { value: unknown }; queryFn: () => Promise<unknown> },
}));

const mockUseQuery = vi.hoisted(() =>
  vi.fn((opts: unknown) => {
    queryOptions.current = opts as never;
    return { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
  }),
);

const mockUseMutation = vi.hoisted(() =>
  vi.fn((cfg: unknown) => {
    const c = cfg as {
      mutationFn: (v: unknown) => Promise<unknown>;
      onSuccess?: (data: unknown) => void;
      onError?: () => void;
    };
    return {
      mutate: vi.fn(),
      mutateAsync: vi.fn(async (v: unknown) => {
        const data = await c.mutationFn(v);
        c.onSuccess?.(data);
      }),
      isPending: false,
    };
  }),
);

const mockQueryClient = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  clear: vi.fn(),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  cancelQueries: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useQueryClient: () => mockQueryClient,
  QueryClient: class QueryClient {},
}));

const { mockMe, mockLogin, mockLogout, mockChangePassword, mockToast } =
  vi.hoisted(() => ({
    mockMe: vi.fn(),
    mockLogin: vi.fn(),
    mockLogout: vi.fn(),
    mockChangePassword: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
  }));

vi.mock("@sdk", () => ({
  authControllerMe: (...a: unknown[]) => mockMe(...a),
  authControllerLogin: (...a: unknown[]) => mockLogin(...a),
  authControllerLogout: (...a: unknown[]) => mockLogout(...a),
  authControllerChangePassword: (...a: unknown[]) => mockChangePassword(...a),
}));

vi.mock("vue-sonner", () => ({ toast: mockToast }));

const push = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
}));

const user = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  username: "alice",
  role: "MEMBER",
  mustChangePassword: false,
  ...overrides,
});

function queryData(value: unknown) {
  mockUseQuery.mockReturnValue({
    data: ref(value),
    isLoading: false,
    error: ref(null),
    refetch: vi.fn(),
  } as never);
}

describe("useMeQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryOptions.current = undefined;
  });

  it("queries /auth/me with the me key", () => {
    useMeQuery();
    expect(queryOptions.current!.queryKey.value).toEqual(authQueryKeys.me());
  });

  it("maps the me payload to the current user", async () => {
    mockMe.mockResolvedValue({
      data: { username: "alice", role: "ADMIN", mustChangePassword: true },
    });
    useMeQuery();
    const result = await queryOptions.current!.queryFn();
    expect(result).toEqual({
      username: "alice",
      role: "ADMIN",
      mustChangePassword: true,
    });
  });

  it("maps an empty payload to null", async () => {
    mockMe.mockResolvedValue({});
    useMeQuery();
    const result = await queryOptions.current!.queryFn();
    expect(result).toBeNull();
  });
});

describe("useCurrentRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryData(null);
  });

  it("defaults a missing session to MEMBER", () => {
    const { role, isAdmin, canWrite } = useCurrentRole();
    expect(role.value).toBe("MEMBER");
    expect(isAdmin.value).toBe(false);
    expect(canWrite.value).toBe(true);
  });

  it("exposes ADMIN as admin and writable", () => {
    queryData(user({ role: "ADMIN" }));
    const { role, isAdmin, canWrite } = useCurrentRole();
    expect(role.value).toBe("ADMIN");
    expect(isAdmin.value).toBe(true);
    expect(canWrite.value).toBe(true);
  });

  it("exposes MEMBER as writable but not admin", () => {
    queryData(user({ role: "MEMBER" }));
    const { isAdmin, canWrite } = useCurrentRole();
    expect(isAdmin.value).toBe(false);
    expect(canWrite.value).toBe(true);
  });

  it("exposes VIEWER as read-only", () => {
    queryData(user({ role: "VIEWER" }));
    const { isAdmin, canWrite } = useCurrentRole();
    expect(isAdmin.value).toBe(false);
    expect(canWrite.value).toBe(false);
  });
});

describe("useLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the login sdk function with credentials and navigates to the inbox", async () => {
    mockLogin.mockResolvedValue({
      data: { username: "alice", role: "MEMBER", mustChangePassword: false },
    });
    const { mutateAsync } = useLogin();
    await mutateAsync({ username: "alice", password: "secret" });
    expect(mockLogin).toHaveBeenCalledWith({
      body: { username: "alice", password: "secret" },
    });
    expect(push).toHaveBeenCalledWith({ name: "review-inbox" });
  });

  it("routes a forced password change to the change-password page", async () => {
    mockLogin.mockResolvedValue({
      data: { username: "alice", role: "MEMBER", mustChangePassword: true },
    });
    const { mutateAsync } = useLogin();
    await mutateAsync({ username: "alice", password: "temporary" });

    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      authQueryKeys.me(),
      expect.objectContaining({ mustChangePassword: true }),
    );
    expect(push).toHaveBeenCalledWith({ name: "change-password" });
  });

  it("rejects when the sdk resolves an error", async () => {
    mockLogin.mockResolvedValue({
      error: { message: "Invalid username or password" },
    });
    const { mutateAsync } = useLogin();
    await expect(
      mutateAsync({ username: "alice", password: "wrong" }),
    ).rejects.toThrow("Invalid username or password");
    expect(push).not.toHaveBeenCalled();
  });

  it("rejects with a fallback message when the sdk error has no message", async () => {
    mockLogin.mockResolvedValue({ error: { status: 401 } });
    const { mutateAsync } = useLogin();
    await expect(
      mutateAsync({ username: "alice", password: "wrong" }),
    ).rejects.toThrow("Invalid username or password");
  });
});

describe("useChangePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the passwords, caches the new session and routes to the inbox", async () => {
    mockChangePassword.mockResolvedValue({
      data: { username: "alice", role: "MEMBER", mustChangePassword: false },
    });
    const { mutateAsync } = useChangePassword();

    await mutateAsync({
      currentPassword: "temporary",
      newPassword: "a-long-secret",
    });

    expect(mockChangePassword).toHaveBeenCalledWith({
      body: { currentPassword: "temporary", newPassword: "a-long-secret" },
    });
    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      authQueryKeys.me(),
      {
        username: "alice",
        role: "MEMBER",
        mustChangePassword: false,
      },
    );
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: authQueryKeys.me(),
    });
    expect(mockToast.success).toHaveBeenCalledWith("Password changed");
    expect(push).toHaveBeenCalledWith({ name: "review-inbox" });
  });

  it("rejects and does not navigate when the current password is wrong", async () => {
    mockChangePassword.mockResolvedValue({
      error: { message: "Current password is incorrect" },
    });
    const { mutateAsync } = useChangePassword();

    await expect(
      mutateAsync({ currentPassword: "wrong", newPassword: "a-long-secret" }),
    ).rejects.toThrow("Current password is incorrect");
    expect(push).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});

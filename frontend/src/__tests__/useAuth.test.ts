import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMeQuery, useLogin } from "@/composables/useAuth";
import { authQueryKeys } from "@/domains/auth/query-keys";

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
      onSuccess?: () => void;
      onError?: () => void;
    };
    return {
      mutate: vi.fn(),
      mutateAsync: vi.fn(async (v: unknown) => {
        await c.mutationFn(v);
        c.onSuccess?.();
      }),
      isPending: false,
    };
  }),
);

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    clear: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    cancelQueries: vi.fn(),
  }),
  QueryClient: class QueryClient {},
}));

const mockMe = vi.hoisted(() => vi.fn());
const mockLogin = vi.hoisted(() => vi.fn());
const mockLogout = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  authControllerMe: (...a: unknown[]) => mockMe(...a),
  authControllerLogin: (...a: unknown[]) => mockLogin(...a),
  authControllerLogout: (...a: unknown[]) => mockLogout(...a),
}));

const push = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
}));

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
    mockMe.mockResolvedValue({ data: { username: "alice" } });
    useMeQuery();
    const result = await queryOptions.current!.queryFn();
    expect(result).toEqual({ username: "alice" });
  });

  it("maps an empty payload to null", async () => {
    mockMe.mockResolvedValue({});
    useMeQuery();
    const result = await queryOptions.current!.queryFn();
    expect(result).toBeNull();
  });
});

describe("useLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the login sdk function with credentials and navigates to the project list", async () => {
    mockLogin.mockResolvedValue({ data: { username: "alice" } });
    const { mutateAsync } = useLogin();
    await mutateAsync({ username: "alice", password: "secret" });
    expect(mockLogin).toHaveBeenCalledWith({
      body: { username: "alice", password: "secret" },
    });
    expect(push).toHaveBeenCalledWith({ name: "review-inbox" });
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

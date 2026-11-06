import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { BulkApproveResultDto } from "@sdk";
import { useBulkApprove } from "@/composables/useBulkApprove";

const { mockApproveAll, mockUseSdkMutation, configs } = vi.hoisted(() => {
  const configs: {
    current?: {
      mutationFn: () => Promise<unknown>;
      successMessage: (result: BulkApproveResultDto) => string;
      invalidate: (client: {
        invalidateQueries: ReturnType<typeof vi.fn>;
      }) => void;
    };
  } = {};
  return {
    mockApproveAll: vi.fn(),
    configs,
    mockUseSdkMutation: vi.fn((config: NonNullable<typeof configs.current>) => {
      configs.current = config;
      return { mutate: vi.fn(), isPending: false };
    }),
  };
});

vi.mock("@sdk", () => ({
  approvalsControllerApproveAllPending: (...args: unknown[]) =>
    mockApproveAll(...args),
}));

vi.mock("@/composables/useSdkMutation", () => ({
  useSdkMutation: (...args: unknown[]) =>
    mockUseSdkMutation(...(args as [never])),
}));

describe("useBulkApprove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configs.current = undefined;
  });

  it("approves all pending variants of the branch", async () => {
    mockApproveAll.mockResolvedValue({
      data: { approved: 2, pending: [], failed: [] },
    });
    useBulkApprove(ref("checkout"), ref("login"), ref("feature/x"));

    await configs.current!.mutationFn();

    expect(mockApproveAll).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "feature/x" },
    });
  });

  it("omits the branch query for the default branch", async () => {
    mockApproveAll.mockResolvedValue({
      data: { approved: 1, pending: [], failed: [] },
    });
    useBulkApprove(ref("checkout"), ref("login"), ref(undefined));

    await configs.current!.mutationFn();

    expect(mockApproveAll).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
    });
  });

  it("formats the no-op, success and partial-failure messages", () => {
    useBulkApprove(ref("checkout"), ref("login"));

    expect(configs.current!.successMessage({ approved: 0, failed: [] })).toBe(
      "No pending variants",
    );
    expect(configs.current!.successMessage({ approved: 1, failed: [] })).toBe(
      "Approved 1 variant",
    );
    expect(configs.current!.successMessage({ approved: 3, failed: [] })).toBe(
      "Approved 3 variants",
    );
    expect(
      configs.current!.successMessage({
        approved: 2,
        failed: [{ comparisonId: "c1", error: "stale" }],
      }),
    ).toBe("Approved 2 variants (1 failed)");
  });

  it("invalidates every review surface after the batch", () => {
    useBulkApprove(ref("checkout"), ref("login"));
    const client = { invalidateQueries: vi.fn() };

    configs.current!.invalidate(client);

    expect(client.invalidateQueries).toHaveBeenCalledTimes(8);
    const keys = client.invalidateQueries.mock.calls.map((call) => {
      const [arg] = call as [{ queryKey: readonly unknown[] }];
      return arg.queryKey[0];
    });
    expect(keys).toEqual(
      expect.arrayContaining([
        "visual-tests",
        "pdf-tests",
        "projects",
        "pending-tests",
        "review-inbox",
        "branches",
        "approvals",
      ]),
    );
  });
});

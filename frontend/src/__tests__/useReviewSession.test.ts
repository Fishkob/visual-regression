import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useReviewSession } from "@/composables/useReviewSession";
import { resetReviewSeen } from "@/lib/review-pass";
import { invalidateVisualTestDetails } from "@/lib/invalidation";
import type { PendingTest } from "@/domains/pending-tests/pending-test";
import { toast } from "vue-sonner";

let mutationOptions: Record<string, any> = {};
const mockMutate = vi.fn();
const mockCancelQueries = vi.fn();
const mockGetQueryData = vi.fn();
const mockSetQueryData = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockPush = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
  useMutation: vi.fn((opts) => {
    mutationOptions = opts;
    return { mutate: mockMutate };
  }),
  useQueryClient: vi.fn(() => ({
    cancelQueries: mockCancelQueries,
    getQueryData: mockGetQueryData,
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  })),
}));

vi.mock("vue-router", () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
  })),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("useReviewSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationOptions = {};
    resetReviewSeen();
  });

  const createArgs = () => ({
    projectName: ref("test-project"),
    testName: ref("login-form"),
    filters: ref({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    }),
    currentComparisonId: ref<string | undefined>("comp-1"),
    approve: vi.fn(),
    invalidateDetails: invalidateVisualTestDetails,
    pendingTests: ref<PendingTest[]>([
      {
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
      {
        name: "signup-form",
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      },
    ]),
  });

  it("handleApprove calls mutate with the pinned comparison id", () => {
    const args = createArgs();
    const { handleApprove } = useReviewSession(args);

    handleApprove();

    expect(mockMutate).toHaveBeenCalledOnce();
    expect(mockMutate).toHaveBeenCalledWith("comp-1");
  });

  it("handleApprove skips when no comparison is loaded", () => {
    const args = createArgs();
    args.currentComparisonId.value = undefined;
    const { handleApprove } = useReviewSession(args);

    handleApprove();

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("handleSkip navigates to next unseen test", () => {
    const args = createArgs();
    const { handleSkip } = useReviewSession(args);

    handleSkip();

    expect(mockPush).toHaveBeenCalledWith({
      name: "test-detail",
      params: { projectName: "test-project", testName: "signup-form" },
      query: {
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      },
      state: { fromReviewLoop: true },
    });
  });

  it("handleSkip navigates to project done when no unseen remain", () => {
    const args = createArgs();
    args.pendingTests.value = [
      {
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
    ];
    const { handleSkip } = useReviewSession(args);

    handleSkip();

    expect(mockPush).toHaveBeenCalledWith("/projects/test-project/done");
  });

  it("starts a fresh pass when entered directly (no loop navigation state)", () => {
    const args = createArgs();
    const { handleSkip } = useReviewSession(args);

    // Skip login-form: the loop offers signup-form next, and login stays in the
    // seen set so a mid-pass continuation would not re-offer it.
    handleSkip();
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ testName: "signup-form" }),
      }),
    );

    mockPush.mockClear();

    // A second session mounted directly (e.g. a deep link into a test) resets
    // the project's seen set — CONTEXT.md:69 — so the earlier skip is forgotten
    // and login-form is offered again.
    resetReviewSeen();
    args.testName.value = "signup-form";
    const { handleSkip: handleSkipAgain } = useReviewSession(args);

    handleSkipAgain();
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ testName: "login-form" }),
      }),
    );
  });

  it("re-offers previously skipped variants after switching projects", async () => {
    const { nextTick } = await import("vue");
    const args = createArgs();
    args.testName.value = "login-form";
    const { handleSkip } = useReviewSession(args);

    handleSkip();
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ testName: "signup-form" }),
      }),
    );

    mockPush.mockClear();
    args.projectName.value = "other-project";
    await nextTick();
    args.projectName.value = "test-project";
    await nextTick();

    args.testName.value = "signup-form";
    handleSkip();

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ testName: "login-form" }),
      }),
    );
  });

  describe("mutation callbacks", () => {
    it("onMutate removes current test from cache and returns previous", async () => {
      const args = createArgs();
      useReviewSession(args);

      const previousData = [...args.pendingTests.value];
      mockGetQueryData.mockReturnValue(previousData);

      const context = await mutationOptions.onMutate();

      expect(mockCancelQueries).toHaveBeenCalledWith({
        queryKey: ["pending-tests", "list", "test-project"],
      });
      const filterFn = mockSetQueryData.mock.calls[0][1];
      const filtered = filterFn(previousData);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("signup-form");
      expect(context).toEqual({
        previous: previousData,
        keys: ["pending-tests", "list", "test-project"],
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });
    });

    it("onSuccess navigates to next test after the server confirms", async () => {
      const args = createArgs();
      useReviewSession(args);
      // simulate the cache removal onMutate applies: current test leaves the pending list
      args.pendingTests.value = args.pendingTests.value.slice(1);
      mockGetQueryData.mockReturnValue([...args.pendingTests.value]);

      await mutationOptions.onMutate();
      mutationOptions.onSuccess(undefined, undefined, {});

      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "test-detail",
          params: expect.objectContaining({ testName: "signup-form" }),
        }),
      );
    });

    it("onError does not navigate away from the failed test", () => {
      const args = createArgs();
      useReviewSession(args);

      mutationOptions.onError(new Error("fail"), undefined, {
        previous: args.pendingTests.value,
        keys: ["pending-tests", "list", "test-project"],
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("onError restores previous cache when context has previous", () => {
      const args = createArgs();
      useReviewSession(args);

      const previousData: PendingTest[] = [
        {
          name: "login-form",
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
      ];

      mutationOptions.onError(new Error("fail"), undefined, {
        previous: previousData,
        keys: ["pending-tests", "list", "test-project"],
      });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ["pending-tests", "list", "test-project"],
        previousData,
      );
    });

    it("onError does not restore cache without context", () => {
      const args = createArgs();
      useReviewSession(args);

      mutationOptions.onError(new Error("fail"), undefined, undefined);

      expect(mockSetQueryData).not.toHaveBeenCalled();
    });

    it("onError restores cache and fires exactly one contextual toast", () => {
      const args = createArgs();
      useReviewSession(args);

      const previousData: PendingTest[] = [
        {
          name: "login-form",
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
      ];

      mutationOptions.onError(new Error("fail"), undefined, {
        previous: previousData,
        keys: ["pending-tests", "list", "test-project"],
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ["pending-tests", "list", "test-project"],
        previousData,
      );
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(
        'Could not approve 1920x1080 / chrome / prod of "login-form"',
      );
    });

    it("onSuccess invalidates details + project queries for the approved variant", () => {
      const args = createArgs();
      useReviewSession(args);

      mutationOptions.onSuccess(undefined, undefined, {
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: [
          "visual-tests",
          "details",
          "test-project",
          "login-form",
          "1920x1080",
          "chrome",
          "prod",
        ],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["projects", "detail", "test-project"],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["pending-tests", "list", "test-project"],
      });
    });

    it("onSuccess shows success toast", () => {
      const args = createArgs();
      useReviewSession(args);

      mutationOptions.onSuccess(undefined, undefined, {
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(toast.success).toHaveBeenCalledWith(
        'Approved 1920x1080 / chrome / prod of "login-form"',
      );
    });
  });
});

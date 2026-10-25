import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useReviewSession } from "@/composables/useReviewSession";
import { isSeen, resetReviewSeen } from "@/lib/review-pass";
import { invalidateVisualTestDetails } from "@/lib/invalidation";
import { keyOf } from "@/lib/variant-key";
import type { PendingTest } from "@/domains/pending-tests/pending-test";
import { toast } from "vue-sonner";

let mutationOptions: Record<string, any> = {};
const mockMutate = vi.fn();
const mockCancelQueries = vi.fn();
const mockGetQueryData = vi.fn();
const mockSetQueryData = vi.fn();
const mockGetQueriesData = vi.fn();
const mockSetQueriesData = vi.fn();
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
    getQueriesData: mockGetQueriesData,
    setQueriesData: mockSetQueriesData,
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
    branchName: ref<string | undefined>(undefined),
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

  it("starts at step one even when the current test is last in the pending list", () => {
    const args = createArgs();
    args.pendingTests.value = [
      {
        name: "signup-form",
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      },
      {
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
    ];

    const { progress } = useReviewSession(args);

    expect(progress.value).toEqual({ current: 1, total: 2 });
  });

  it("sets the total when the pending list loads after mount", async () => {
    const { nextTick } = await import("vue");
    const args = createArgs();
    const allPending = [...args.pendingTests.value];
    args.pendingTests.value = [];
    const { progress } = useReviewSession(args);

    expect(progress.value).toEqual({ current: 1, total: 0 });

    args.pendingTests.value = allPending;
    await nextTick();

    expect(progress.value).toEqual({ current: 1, total: 2 });
  });

  it("keeps progress when the route params resolve after mount", async () => {
    const { nextTick } = await import("vue");
    const args = createArgs();
    args.projectName.value = "";
    const { progress } = useReviewSession(args);

    args.projectName.value = "test-project";
    await nextTick();

    expect(progress.value).toEqual({ current: 1, total: 2 });
  });

  it("falls back to the first step when the current test is not pending", () => {
    const args = createArgs();
    args.testName.value = "not-pending";
    const { progress } = useReviewSession(args);

    expect(progress.value).toEqual({ current: 1, total: 2 });
  });

  it("advances progress after approving the current test", () => {
    const args = createArgs();
    args.pendingTests.value = [
      {
        name: "signup-form",
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      },
      {
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
    ];
    const { progress } = useReviewSession(args);

    expect(progress.value).toEqual({ current: 1, total: 2 });

    args.pendingTests.value = args.pendingTests.value.slice(0, 1);
    mutationOptions.onSuccess(undefined, undefined, {
      currentVariant: {
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
      currentTestName: "login-form",
    });

    expect(progress.value).toEqual({ current: 2, total: 2 });
  });

  it("advances progress on skip", () => {
    const args = createArgs();
    const { handleSkip, progress } = useReviewSession(args);

    expect(progress.value).toEqual({ current: 1, total: 2 });

    handleSkip();

    expect(progress.value).toEqual({ current: 2, total: 2 });
  });

  it("does not advance progress when returning to the inbox", () => {
    const args = { ...createArgs(), returnToInbox: true };
    const { progress } = useReviewSession(args);

    mutationOptions.onSuccess(undefined, undefined, {
      currentVariant: {
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
      currentTestName: "login-form",
    });

    expect(progress.value).toEqual({ current: 1, total: 2 });
  });

  it("reads returnToInbox reactively", () => {
    const returnToInbox = ref(false);
    const args = { ...createArgs(), returnToInbox };
    const { handleSkip } = useReviewSession(args);

    returnToInbox.value = true;
    handleSkip();

    expect(mockPush).toHaveBeenCalledWith({ name: "review-inbox" });
  });

  it("handleSkip returns to the inbox without marking the test seen", () => {
    const args = { ...createArgs(), returnToInbox: true };
    const { handleSkip } = useReviewSession(args);

    handleSkip();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["review-inbox"],
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ name: "review-inbox" });
    expect(
      isSeen(
        "test-project",
        keyOf({
          name: "login-form",
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        }),
      ),
    ).toBe(false);
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

    expect(mockPush).toHaveBeenCalledWith({
      name: "approval-done",
      params: { projectName: "test-project" },
    });
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
    it("removes the inbox item and returns to the inbox after approval", async () => {
      const args = { ...createArgs(), returnToInbox: true };
      const previousPending = [...args.pendingTests.value];
      const previousInboxPage = {
        items: [{ comparisonId: "comp-1" }, { comparisonId: "comp-2" }],
        total: 2,
        page: 1,
        pageSize: 50,
      };
      mockGetQueryData.mockReturnValueOnce(previousPending);
      mockGetQueriesData.mockReturnValueOnce([
        [["review-inbox", "list"], previousInboxPage],
      ]);
      useReviewSession(args);

      const context = await mutationOptions.onMutate();

      expect(mockCancelQueries).toHaveBeenCalledWith({
        queryKey: ["review-inbox", "list"],
      });
      expect(context.restoreInbox).toEqual(expect.any(Function));
      const inboxWrite = mockSetQueriesData.mock.calls.find(
        ([options]) => options.queryKey[0] === "review-inbox",
      );
      const nextPage = inboxWrite?.[1](previousInboxPage);
      expect(nextPage.items).toEqual([{ comparisonId: "comp-2" }]);
      expect(nextPage.total).toBe(1);

      mutationOptions.onSuccess(undefined, undefined, context);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({ name: "review-inbox" });
    });

    it("onError restores both the pending and inbox caches", async () => {
      const args = { ...createArgs(), returnToInbox: true };
      const previousPending = [...args.pendingTests.value];
      const previousInboxPage = {
        items: [{ comparisonId: "comp-1" }],
        total: 1,
        page: 1,
        pageSize: 50,
      };
      mockGetQueryData.mockReturnValueOnce(previousPending);
      mockGetQueriesData.mockReturnValueOnce([
        [["review-inbox", "list"], previousInboxPage],
      ]);
      useReviewSession(args);

      const context = await mutationOptions.onMutate();
      mockSetQueryData.mockClear();

      mutationOptions.onError(new Error("fail"), undefined, context);

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ["pending-tests", "list", "test-project"],
        previousPending,
      );
      expect(mockSetQueryData).toHaveBeenCalledWith(
        ["review-inbox", "list"],
        previousInboxPage,
      );
    });

    it("onMutate removes current test from cache and returns a restore closure", async () => {
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
        restore: expect.any(Function),
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      context.restore();
      expect(mockSetQueryData).toHaveBeenLastCalledWith(
        ["pending-tests", "list", "test-project"],
        previousData,
      );
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
      const restore = vi.fn();

      mutationOptions.onError(new Error("fail"), undefined, {
        restore,
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(restore).toHaveBeenCalledOnce();
    });

    it("onError restores the pending cache through the returned closure", () => {
      const args = createArgs();
      useReviewSession(args);
      const restore = vi.fn();

      mutationOptions.onError(new Error("fail"), undefined, {
        restore,
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(restore).toHaveBeenCalledOnce();
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
      const restore = vi.fn();

      mutationOptions.onError(new Error("fail"), undefined, {
        restore,
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(restore).toHaveBeenCalledOnce();
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(
        'Could not approve 1920x1080 / chrome / prod of "login-form": fail',
      );
    });

    it("onError invalidates the inbox when returning to the inbox", () => {
      const args = { ...createArgs(), returnToInbox: true };
      useReviewSession(args);
      const restore = vi.fn();

      mutationOptions.onError(new Error("fail"), undefined, {
        restore,
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(restore).toHaveBeenCalledOnce();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: [
          "visual-tests",
          "details",
          "test-project",
          "",
          "login-form",
          "1920x1080",
          "chrome",
          "prod",
        ],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["review-inbox"],
      });
    });

    it("onError invalidates the details for a project-loop approval", () => {
      const args = createArgs();
      useReviewSession(args);
      const restore = vi.fn();

      mutationOptions.onError(new Error("fail"), undefined, {
        restore,
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
      });

      expect(restore).toHaveBeenCalledOnce();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: [
          "visual-tests",
          "details",
          "test-project",
          "",
          "login-form",
          "1920x1080",
          "chrome",
          "prod",
        ],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["projects", "pending"],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["review-inbox"],
      });
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
          "",
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

  describe("branch propagation", () => {
    it("targets the branch-scoped pending cache when removing the approved test", async () => {
      const args = {
        ...createArgs(),
        branchName: ref<string | undefined>("feature/x"),
      };
      useReviewSession(args);

      await mutationOptions.onMutate();

      expect(mockCancelQueries).toHaveBeenCalledWith({
        queryKey: ["pending-tests", "list", "test-project", "feature/x"],
      });
    });

    it("includes the branch in the invalidation args", () => {
      const args = {
        ...createArgs(),
        branchName: ref<string | undefined>("feature/x"),
      };
      const invalidateDetails = vi.fn();
      useReviewSession({ ...args, invalidateDetails });

      mutationOptions.onSuccess(undefined, undefined, {
        currentVariant: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
        currentTestName: "login-form",
        currentBranch: "feature/x",
      });

      expect(invalidateDetails).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ branch: "feature/x" }),
      );
    });

    it("navigates the next test with the branch in the query", () => {
      const args = {
        ...createArgs(),
        branchName: ref<string | undefined>("feature/x"),
      };
      const { handleSkip } = useReviewSession(args);

      handleSkip();

      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ branch: "feature/x" }),
        }),
      );
    });

    it("resets the pass when the branch changes", async () => {
      const { nextTick } = await import("vue");
      const branchName = ref<string | undefined>("main");
      const { handleSkip } = useReviewSession({ ...createArgs(), branchName });
      const loginKey = keyOf({
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      });

      handleSkip();
      expect(isSeen("test-project", loginKey)).toBe(true);

      branchName.value = "feature/x";
      await nextTick();

      expect(isSeen("test-project", loginKey)).toBe(false);
    });
  });
});

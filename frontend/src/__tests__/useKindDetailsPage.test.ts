import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

const mockUseReviewSession = vi.fn();

vi.mock("@/composables/useReviewSession", () => ({
  useReviewSession: (...args: unknown[]) => mockUseReviewSession(...args),
}));

const mockUsePendingTestsQuery = vi.fn();

vi.mock("@/composables/usePendingTests", () => ({
  usePendingTestsQuery: (...args: unknown[]) =>
    mockUsePendingTestsQuery(...args),
}));

vi.mock("@sdk", () => ({
  approvalsControllerApprovePdfTest: vi.fn(),
  approvalsControllerApproveVisualTest: vi.fn(),
  pdfControllerGetPdfTestDetails: vi.fn(),
  testsQueriesControllerGetVisualTestDetails: vi.fn(),
}));

describe("useKindDetailsPage (shared shell)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReviewSession.mockReturnValue({
      handleApprove: vi.fn(),
      handleSkip: vi.fn(),
      isApproving: ref(false),
    });
    mockUsePendingTestsQuery.mockReturnValue({ data: ref([]) });
  });

  function createAdapter(overrides: Record<string, unknown> = {}) {
    return {
      useDetailsQuery: vi.fn(() => ({
        data: ref({ comparison: { id: "comp-1" } }),
        isLoading: ref(false),
        error: ref(null),
        refetch: vi.fn(),
      })),
      approve: vi.fn(() => Promise.resolve({ data: {} })),
      invalidateDetails: vi.fn(),
      viewKeyOf: (comparison: { id?: string } | null | undefined) =>
        comparison?.id ?? "",
      ...overrides,
    };
  }

  function createArgs(adapter: ReturnType<typeof createAdapter>) {
    return {
      adapter,
      projectName: ref("proj"),
      testName: ref("test"),
      branchName: ref<string | undefined>(undefined),
      filters: ref({
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      }),
    };
  }

  it("gates the pending query off while there is no comparison", async () => {
    const { useKindDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    useKindDetailsPage(
      createArgs(
        createAdapter({
          useDetailsQuery: () => ({
            data: ref(null),
            isLoading: ref(false),
            error: ref(null),
            refetch: vi.fn(),
          }),
        }),
      ),
    );

    expect(mockUsePendingTestsQuery).toHaveBeenCalledTimes(1);
    expect(mockUsePendingTestsQuery.mock.calls[0][2].value).toBe(false);
  });

  it("enables the pending query when a comparison is present", async () => {
    const { useKindDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    useKindDetailsPage(createArgs(createAdapter()));

    expect(mockUsePendingTestsQuery).toHaveBeenCalledTimes(1);
    expect(mockUsePendingTestsQuery.mock.calls[0][2].value).toBe(true);
  });

  it("threads my reviews into the pending query and the review session", async () => {
    const { useKindDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    const assignedToMe = ref(true);
    useKindDetailsPage({
      ...createArgs(createAdapter()),
      assignedToMe,
    });

    expect(mockUsePendingTestsQuery.mock.calls[0][3]).toBe(assignedToMe);
    expect(mockUseReviewSession.mock.calls[0][0].assignedToMe).toBe(
      assignedToMe,
    );
  });

  it("composes the review session with the adapter's approve + invalidation", async () => {
    const { useKindDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    const adapter = createAdapter();
    useKindDetailsPage(createArgs(adapter));

    const options = mockUseReviewSession.mock.calls[0][0];
    expect(options.currentComparisonId.value).toBe("comp-1");
    expect(options.invalidateDetails).toBe(adapter.invalidateDetails);

    await options.approve("comp-1");
    expect(adapter.approve).toHaveBeenCalledWith(
      "proj",
      "test",
      "comp-1",
      undefined,
    );
  });

  it("builds the viewKey from the identity + comparison + artifact", async () => {
    const { useKindDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    const adapter = createAdapter({ viewKeyOf: () => "art" });
    const { viewKey } = useKindDetailsPage(createArgs(adapter));

    expect(viewKey.value).toBe(
      "proj::test::1920x1080::chrome::prod::comp-1::art",
    );
  });

  it("passes data, isLoading, error, refetch through from the query", async () => {
    const { useKindDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    const result = useKindDetailsPage(createArgs(createAdapter()));

    expect(result.data).toBeDefined();
    expect(result.isLoading).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.refetch).toBeDefined();
  });

  it("delegates approve/skip to the review session", async () => {
    const { useKindDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    const result = useKindDetailsPage(createArgs(createAdapter()));

    const session = mockUseReviewSession.mock.results[0].value;
    expect(result.handleApprove).toBe(session.handleApprove);
    expect(result.handleSkip).toBe(session.handleSkip);
  });
});

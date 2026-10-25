import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { invalidatePdfTestDetails } from "@/lib/invalidation";

const mockUseReviewSession = vi.fn();

vi.mock("@/composables/useReviewSession", () => ({
  useReviewSession: (...args: unknown[]) => mockUseReviewSession(...args),
}));

const mockApprovePdfTest = vi.fn();
vi.mock("@sdk", () => ({
  approvalsControllerApprovePdfTest: mockApprovePdfTest,
  pdfControllerGetPdfTestDetails: vi.fn(),
  pdfControllerRenderPdfPage: vi.fn(),
  approvalsControllerApproveVisualTest: vi.fn(),
  testsQueriesControllerGetVisualTestDetails: vi.fn(),
}));

vi.mock("@/lib/sdk", () => ({
  getData: (result: unknown) =>
    typeof result === "object" && result && "data" in result
      ? (result as { data: unknown }).data
      : undefined,
}));

vi.mock("@tanstack/vue-query", () => ({
  useQuery: vi.fn(() => ({
    data: ref({ comparison: { id: "pdf-comp-1" } }),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: ref(false),
  })),
}));

describe("usePdfTestDetailsPage (pdf)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReviewSession.mockReturnValue({
      handleApprove: vi.fn(),
      handleSkip: vi.fn(),
      isApproving: ref(false),
    });
  });

  const createArgs = () => ({
    projectName: ref("test-project"),
    testName: ref("my-pdf-test"),
    branchName: ref<string | undefined>(undefined),
    filters: ref({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    }),
  });

  it("returns data, isLoading, error, refetch from query", async () => {
    const { usePdfTestDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    const result = usePdfTestDetailsPage(createArgs());

    expect(result.data).toBeDefined();
    expect(result.isLoading).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.refetch).toBeDefined();
  });

  it("returns handleApprove, handleSkip, and isApproving from the review session", async () => {
    const { usePdfTestDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    const result = usePdfTestDetailsPage(createArgs());

    expect(result.handleApprove).toBeDefined();
    expect(result.handleSkip).toBeDefined();
    expect(result.isApproving).toBeDefined();
  });

  it("wires the comparison id and pdf approve call into the review session", async () => {
    mockApprovePdfTest.mockResolvedValue({ data: {} });

    const { usePdfTestDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    usePdfTestDetailsPage(createArgs());

    const options = mockUseReviewSession.mock.calls[0][0];
    expect(options.currentComparisonId.value).toBe("pdf-comp-1");
    await options.approve("pdf-comp-1", {
      reason: "INTENDED_CHANGE",
      note: "Copy updated in the new design",
    });

    expect(mockApprovePdfTest).toHaveBeenCalledWith({
      path: { projectName: "test-project", testName: "my-pdf-test" },
      body: {
        comparisonId: "pdf-comp-1",
        reason: "INTENDED_CHANGE",
        note: "Copy updated in the new design",
      },
    });
  });

  it("passes invalidatePdfTestDetails to the review session", async () => {
    const { usePdfTestDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    usePdfTestDetailsPage(createArgs());

    const options = mockUseReviewSession.mock.calls[0][0];
    expect(options.invalidateDetails).toBe(invalidatePdfTestDetails);
  });

  it("delegates handleApprove and handleSkip to the review session", async () => {
    const { usePdfTestDetailsPage } =
      await import("@/composables/useTestDetailsPage");
    const result = usePdfTestDetailsPage(createArgs());

    const session = mockUseReviewSession.mock.results[0].value;
    expect(result.handleApprove).toBe(session.handleApprove);
    expect(result.handleSkip).toBe(session.handleSkip);
  });
});

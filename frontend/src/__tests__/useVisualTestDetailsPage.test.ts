import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useVisualTestDetailsPage } from "@/composables/useTestDetailsPage";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

useQueryMock.mockReturnValue({
  data: ref(undefined),
  isLoading: ref(false),
  error: ref(null),
  refetch: vi.fn(),
});

vi.mock("@sdk", () => ({
  testsQueriesControllerGetTestsWithPendingStatus: vi.fn(),
  testsQueriesControllerGetVisualTestDetails: vi.fn(() =>
    Promise.resolve({ data: undefined }),
  ),
  pdfControllerGetPdfTestDetails: vi.fn(),
  approvalsControllerApproveVisualTest: vi.fn(),
  approvalsControllerApprovePdfTest: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({
  useQuery: useQueryMock,
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("@/composables/useReviewSession", () => ({
  useReviewSession: vi.fn(() => ({
    handleApprove: vi.fn(),
    handleSkip: vi.fn(),
  })),
}));

describe("useVisualTestDetailsPage (image)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createArgs = () => ({
    projectName: ref("test-project"),
    testName: ref("login-form"),
    filters: ref({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    }),
  });

  it("returns data, isLoading, error, refetch from query", () => {
    const result = useVisualTestDetailsPage(createArgs());

    expect(result.data).toBeDefined();
    expect(result.isLoading).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.refetch).toBeDefined();
  });

  it("returns handleApprove and handleSkip from review flow", () => {
    const result = useVisualTestDetailsPage(createArgs());

    expect(result.handleApprove).toBeDefined();
    expect(result.handleSkip).toBeDefined();
  });

  it("generates viewKey from project, test, filters, and comparison", async () => {
    const mockData = ref({
      comparison: {
        id: "cmp-123",
        diffImageUrl: "/images/diff.png",
      },
    });

    useQueryMock.mockReturnValue({
      data: mockData,
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });

    const expectedKey = [
      "test-project",
      "login-form",
      "1920x1080",
      "chrome",
      "prod",
      "cmp-123",
      "/images/diff.png",
    ].join("::");

    const result = useVisualTestDetailsPage(createArgs());

    expect(result.viewKey.value).toBe(expectedKey);
  });

  it("generates viewKey with empty strings when no comparison", async () => {
    const mockData = ref(undefined);

    useQueryMock.mockReturnValue({
      data: mockData,
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });

    const result = useVisualTestDetailsPage(createArgs());

    const keyParts = result.viewKey.value.split("::");
    expect(keyParts[5]).toBe("");
  });

  it("updates viewKey when filters change", async () => {
    const mockData = ref({
      comparison: { id: "cmp-123" },
    });

    useQueryMock.mockReturnValue({
      data: mockData,
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });

    const filters = ref({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    });
    const args = {
      projectName: ref("test-project"),
      testName: ref("login-form"),
      filters,
    };

    const result = useVisualTestDetailsPage(args);

    const initialKey = result.viewKey.value;

    filters.value = {
      viewport: "1280x720",
      browser: "firefox",
      environment: "staging",
    };

    expect(result.viewKey.value).not.toBe(initialKey);
    expect(result.viewKey.value).toContain("1280x720");
    expect(result.viewKey.value).toContain("firefox");
  });
});

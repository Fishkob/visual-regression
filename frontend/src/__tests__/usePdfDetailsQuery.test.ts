import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

const mockUseQuery = vi.fn();
const mockGetPdfTestDetails = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("@sdk", () => ({
  pdfControllerGetPdfTestDetails: mockGetPdfTestDetails,
  pdfControllerRenderPdfPage: vi.fn(),
  approvalsControllerApprovePdfTest: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

describe("usePdfDetailsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: ref(null),
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });
  });

  it("creates query with correct queryKey from pdfTestQueryKeys", async () => {
    const { usePdfDetailsQuery } =
      await import("@/composables/useTestDetailsPage");

    const projectName = ref("my-project");
    const testName = ref("my-test");
    const filters = ref({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    });

    usePdfDetailsQuery(projectName, testName, filters);

    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey.value).toEqual([
      "pdf-tests",
      "details",
      "my-project",
      "my-test",
      "1920x1080",
      "chrome",
      "prod",
    ]);
  });

  it("uses empty query key when projectName or testName is empty", async () => {
    const { usePdfDetailsQuery } =
      await import("@/composables/useTestDetailsPage");

    usePdfDetailsQuery(ref(""), ref("test"), ref({}));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey.value).toEqual([]);
  });

  it("queryFn calls pdfControllerGetPdfTestDetails with correct args", async () => {
    const { usePdfDetailsQuery } =
      await import("@/composables/useTestDetailsPage");

    const mockDetails = {
      id: "pdf-1",
      name: "test",
      status: "PENDING_APPROVAL",
      kind: "pdf",
      createdAt: "2024-01-01T00:00:00Z",
      baseline: {
        id: "b1",
        pdfUrl: "/baseline.pdf",
        imageHash: "abc",
        pageCount: 7,
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
      comparison: null,
    };
    mockGetPdfTestDetails.mockResolvedValue({ data: mockDetails });

    const filters = ref({
      viewport: "1280x720",
      browser: "firefox",
      environment: "staging",
    });
    usePdfDetailsQuery(ref("proj"), ref("test"), filters);

    const options = mockUseQuery.mock.calls[0][0];
    const result = await options.queryFn();

    expect(mockGetPdfTestDetails).toHaveBeenCalledWith({
      path: { projectName: "proj", testName: "test" },
      query: {
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      },
    });
    expect(result).toEqual({
      id: "pdf-1",
      name: "test",
      status: "PENDING_APPROVAL",
      createdAt: "2024-01-01T00:00:00Z",
      baseline: {
        pdfUrl: "/baseline.pdf",
        imageHash: "abc",
        pageCount: 7,
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      },
      comparison: undefined,
    });
  });

  it("query key collapses to [] when projectName or testName is empty (the gating convention)", async () => {
    const { usePdfDetailsQuery } =
      await import("@/composables/useTestDetailsPage");

    usePdfDetailsQuery(ref(""), ref("test"), ref({}));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey.value).toEqual([]);
    expect(options.enabled.value).toBe(false);
  });

  it("query is enabled only when both projectName and testName are set", async () => {
    const { usePdfDetailsQuery } =
      await import("@/composables/useTestDetailsPage");

    usePdfDetailsQuery(ref("proj"), ref("test"), ref({}));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.enabled.value).toBe(true);
  });

  it("query is disabled when projectName or testName is missing", async () => {
    const { usePdfDetailsQuery } =
      await import("@/composables/useTestDetailsPage");

    usePdfDetailsQuery(ref(""), ref("test"), ref({}));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.enabled.value).toBe(false);
  });
});

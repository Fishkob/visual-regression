import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

const mockUseQuery = vi.fn();
const mockRenderPdfPage = vi.fn();
const mockKeepPreviousData = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
  keepPreviousData: mockKeepPreviousData,
}));

vi.mock("@sdk", () => ({
  pdfControllerRenderPdfPage: mockRenderPdfPage,
}));

describe("usePdfPageRenderQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: ref(null),
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });
  });

  it("builds the render-page query key from project, test, url and page", async () => {
    const { usePdfPageRenderQuery } =
      await import("@/composables/usePdfPageRender");

    usePdfPageRenderQuery(
      ref("proj"),
      ref("test"),
      ref("http://storage/diff.pdf"),
      ref(2),
    );

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey.value).toEqual([
      "pdf-tests",
      "render",
      "proj",
      "test",
      "http://storage/diff.pdf",
      2,
    ]);
  });

  it("collapses the key when pdfUrl is empty (the gating convention)", async () => {
    const { usePdfPageRenderQuery } =
      await import("@/composables/usePdfPageRender");

    usePdfPageRenderQuery(ref("proj"), ref("test"), ref(""), ref(1));

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.queryKey.value).toEqual([]);
    expect(options.enabled.value).toBe(false);
  });

  it("fetches the rendered page through the SDK with path and query", async () => {
    const { usePdfPageRenderQuery } =
      await import("@/composables/usePdfPageRender");
    mockRenderPdfPage.mockResolvedValue({ data: { imageUrl: "/page.png" } });

    usePdfPageRenderQuery(
      ref("proj"),
      ref("test"),
      ref("http://storage/diff.pdf"),
      ref(3),
    );

    const options = mockUseQuery.mock.calls[0][0];
    const result = await options.queryFn();

    expect(mockRenderPdfPage).toHaveBeenCalledWith({
      path: { projectName: "proj", testName: "test" },
      query: { pdfUrl: "http://storage/diff.pdf", page: 3 },
    });
    expect(result).toEqual({ imageUrl: "/page.png" });
  });

  it("maps an empty payload to null", async () => {
    const { usePdfPageRenderQuery } =
      await import("@/composables/usePdfPageRender");
    mockRenderPdfPage.mockResolvedValue({ data: undefined });

    usePdfPageRenderQuery(
      ref("proj"),
      ref("test"),
      ref("http://storage/diff.pdf"),
      ref(1),
    );

    const options = mockUseQuery.mock.calls[0][0];
    const result = await options.queryFn();

    expect(result).toBeNull();
  });

  it("keeps the previous page data while a new page loads", async () => {
    const { usePdfPageRenderQuery } =
      await import("@/composables/usePdfPageRender");

    usePdfPageRenderQuery(
      ref("proj"),
      ref("test"),
      ref("http://storage/diff.pdf"),
      ref(1),
    );

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.placeholderData).toBe(mockKeepPreviousData);
  });
});

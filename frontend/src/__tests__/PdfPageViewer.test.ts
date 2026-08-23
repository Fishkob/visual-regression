import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

const mockUsePdfPageRenderQuery = vi.fn();

vi.mock("@/composables/usePdfPageRender", () => ({
  usePdfPageRenderQuery: (...args: unknown[]) =>
    mockUsePdfPageRenderQuery(...args),
}));

vi.mock("@/components/ImageDisplay.vue", () => ({
  default: { template: '<div data-testid="image-display" />' },
}));

vi.mock("@/components/ui/button", () => ({
  Button: { template: '<button data-testid="retry-btn"><slot/></button>' },
}));

describe("PdfPageViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state when isLoading is true", async () => {
    mockUsePdfPageRenderQuery.mockReturnValue({
      data: ref(null),
      isLoading: ref(true),
      isError: ref(false),
      refetch: vi.fn(),
    });
    const PdfPageViewer = (await import("@/components/pdf/PdfPageViewer.vue"))
      .default;
    const wrapper = mount(PdfPageViewer, {
      props: {
        projectName: "proj",
        testName: "test",
        pdfUrl: "http://rustfs/doc.pdf",
        page: 1,
        label: "Baseline",
      },
    });
    expect(wrapper.text()).toContain("Loading page 1...");
  });

  it("shows ImageDisplay when data is available", async () => {
    mockUsePdfPageRenderQuery.mockReturnValue({
      data: ref({ imageUrl: "http://rustfs/render.png", pageCount: 3 }),
      isLoading: ref(false),
      isError: ref(false),
      refetch: vi.fn(),
    });
    const PdfPageViewer = (await import("@/components/pdf/PdfPageViewer.vue"))
      .default;
    const wrapper = mount(PdfPageViewer, {
      props: {
        projectName: "proj",
        testName: "test",
        pdfUrl: "http://rustfs/doc.pdf",
        page: 1,
        label: "Baseline",
      },
    });
    expect(wrapper.find('[data-testid="image-display"]').exists()).toBe(true);
  });

  it("shows error state and retry button when isError is true", async () => {
    const refetch = vi.fn();
    mockUsePdfPageRenderQuery.mockReturnValue({
      data: ref(null),
      isLoading: ref(false),
      isError: ref(true),
      refetch,
    });
    const PdfPageViewer = (await import("@/components/pdf/PdfPageViewer.vue"))
      .default;
    const wrapper = mount(PdfPageViewer, {
      props: {
        projectName: "proj",
        testName: "test",
        pdfUrl: "http://rustfs/doc.pdf",
        page: 2,
        label: "Current",
      },
    });
    expect(wrapper.text()).toContain("Failed to load page 2");
    expect(wrapper.find('[data-testid="retry-btn"]').exists()).toBe(true);
  });

  it("does not show image when pdfUrl is undefined", async () => {
    mockUsePdfPageRenderQuery.mockReturnValue({
      data: ref(null),
      isLoading: ref(false),
      isError: ref(false),
      refetch: vi.fn(),
    });
    const PdfPageViewer = (await import("@/components/pdf/PdfPageViewer.vue"))
      .default;
    const wrapper = mount(PdfPageViewer, {
      props: {
        projectName: "proj",
        testName: "test",
        pdfUrl: undefined,
        page: 1,
        label: "Baseline",
      },
    });
    expect(wrapper.find('[data-testid="image-display"]').exists()).toBe(false);
  });
});

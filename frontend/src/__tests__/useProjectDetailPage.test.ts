import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useProjectDetailPage } from "@/composables/useProjectDetailPage";
import type { Project } from "@/domains/projects/project.model";

const project: Project = {
  id: "proj-1",
  name: "checkout",
  hasPendingTests: false,
  testCount: 3,
  createdAt: "2025-01-01",
  visualTests: [
    {
      name: "login",
      kind: "image",
      viewport: "1920x1080",
      browser: "chrome",
      latestStatus: "PENDING_APPROVAL",
    },
    {
      name: "cart",
      kind: "image",
      viewport: "1280x720",
      browser: "firefox",
      latestStatus: "UNCHANGED",
    },
    {
      name: "invoice",
      kind: "pdf",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
      latestStatus: "UNCHANGED",
    },
    {
      name: "invoice",
      kind: "pdf",
      viewport: "1280x720",
      browser: "firefox",
      environment: "staging",
      latestStatus: "PENDING_APPROVAL",
    },
    {
      name: "receipt",
      kind: "pdf",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
      latestStatus: "UNCHANGED",
    },
  ],
};

const { useProjectDetailQueryMock } = vi.hoisted(() => ({
  useProjectDetailQueryMock: vi.fn(),
}));

vi.mock("@/composables/useProjects", () => ({
  useProjectDetailQuery: useProjectDetailQueryMock,
}));

describe("useProjectDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockProject(value: Project = project) {
    useProjectDetailQueryMock.mockReturnValue({
      data: ref(value),
      isLoading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    });
  }

  it("splits image and pdf tests by kind", () => {
    mockProject();
    const { imageTests, pdfTests } = useProjectDetailPage(ref("checkout"));

    expect(imageTests.value.map((t) => t.name)).toEqual(["login", "cart"]);
    expect(pdfTests.value.map((t) => t.name)).toEqual(["invoice", "receipt"]);
  });

  it("counts pending screenshot tests", () => {
    mockProject();
    const { screenshotPendingCount } = useProjectDetailPage(ref("checkout"));

    expect(screenshotPendingCount.value).toBe(1);
  });

  it("counts pending pdf tests once per test, not per variant", () => {
    mockProject();
    const { pdfPendingCount } = useProjectDetailPage(ref("checkout"));

    expect(pdfPendingCount.value).toBe(1);
  });

  it("aggregates a pdf test's status across its variants", () => {
    mockProject();
    const { pdfTests } = useProjectDetailPage(ref("checkout"));

    const invoice = pdfTests.value.find((t) => t.name === "invoice");
    expect(invoice?.status).toBe("PENDING_APPROVAL");
  });

  it("keeps a variant on each pdf test so navigation can carry it", () => {
    mockProject();
    const { pdfTests } = useProjectDetailPage(ref("checkout"));

    const receipt = pdfTests.value.find((t) => t.name === "receipt");
    expect(receipt).toMatchObject({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    });
  });

  it("exposes the single project query state for both tabs, reactively", () => {
    const refetch = vi.fn();
    const isLoading = ref(true);
    const error = ref<Error | null>(null);
    useProjectDetailQueryMock.mockReturnValue({
      data: ref(project),
      isLoading,
      error,
      refetch,
    });

    const { activeTabState } = useProjectDetailPage(ref("checkout"));

    expect(activeTabState.isLoading).toBe(true);
    expect(activeTabState.error).toBeNull();

    isLoading.value = false;
    expect(activeTabState.isLoading).toBe(false);

    error.value = new Error("boom");
    expect(activeTabState.error).toBeInstanceOf(Error);

    activeTabState.refetch();
    expect(refetch).toHaveBeenCalled();
  });

  it("handles an empty project", () => {
    mockProject({ ...project, visualTests: [], testCount: 0 });

    const { imageTests, pdfTests, screenshotPendingCount, pdfPendingCount } =
      useProjectDetailPage(ref("checkout"));

    expect(imageTests.value).toEqual([]);
    expect(pdfTests.value).toEqual([]);
    expect(screenshotPendingCount.value).toBe(0);
    expect(pdfPendingCount.value).toBe(0);
  });
});

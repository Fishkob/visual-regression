import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useProjectDetailPage } from "@/composables/useProjectDetailPage";
import type { Project } from "@/domains/projects/project.model";

const project: Project = {
  id: "proj-1",
  name: "checkout",
  hasPendingTests: true,
  testCount: 3,
  pendingCount: 2,
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
      latestStatus: "PENDING_APPROVAL",
    },
    {
      name: "invoice",
      kind: "pdf",
      viewport: "1280x720",
      browser: "firefox",
      environment: "staging",
      latestStatus: "UNCHANGED",
    },
    {
      name: "cart",
      kind: "image",
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

  it("returns all image and pdf tests in one list", () => {
    mockProject();
    const { tests } = useProjectDetailPage(ref("checkout"));

    expect(tests.value).toHaveLength(5);
    expect(tests.value.map((t) => t.name)).toEqual([
      "login",
      "cart",
      "invoice",
      "invoice",
      "cart",
    ]);
    expect(tests.value.some((t) => t.kind === "pdf")).toBe(true);
    expect(tests.value.some((t) => t.kind === "image")).toBe(true);
  });

  it("counts pending rows", () => {
    mockProject();
    const { pendingCount } = useProjectDetailPage(ref("checkout"));

    expect(pendingCount.value).toBe(2);
  });

  it("counts distinct test names", () => {
    mockProject();
    const { testCount } = useProjectDetailPage(ref("checkout"));

    expect(testCount.value).toBe(3);
  });

  it("exposes the project query state reactively", () => {
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
    mockProject({
      ...project,
      visualTests: [],
      testCount: 0,
      pendingCount: 0,
    });

    const { tests, pendingCount, testCount } = useProjectDetailPage(
      ref("checkout"),
    );

    expect(tests.value).toEqual([]);
    expect(pendingCount.value).toBe(0);
    expect(testCount.value).toBe(0);
  });
});

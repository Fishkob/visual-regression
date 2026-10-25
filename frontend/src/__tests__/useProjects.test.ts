import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import {
  useProjectsWithPendingQuery,
  useProjectDetailQuery,
} from "@/composables/useProjects";
import type { Project } from "@/domains/projects/project.model";
import { PROJECT_DETAIL_PAGE_SIZE, PROJECTS_PAGE_SIZE } from "@/lib/pagination";

interface QueryOptionsShape {
  queryKey: { value: unknown };
  queryFn: () => Promise<unknown>;
}

const { mockUseQuery, queryOptions } = vi.hoisted(() => {
  const queryOptions: { current?: QueryOptionsShape } = {};
  const mockUseQuery = vi.fn((opts: QueryOptionsShape) => {
    queryOptions.current = opts;
    return {
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
  });
  return { mockUseQuery, queryOptions };
});

const mockGetProjectsWithPending = vi.hoisted(() => vi.fn());
const mockGetOneProject = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/vue-query", () => ({
  useQuery: mockUseQuery,
  keepPreviousData: (previous: unknown) => previous,
}));

vi.mock("@sdk", () => ({
  projectsControllerGetProjectsWithPendingFlag: (...args: unknown[]) =>
    mockGetProjectsWithPending(...args),
  projectsControllerGetOneProject: (...args: unknown[]) =>
    mockGetOneProject(...args),
}));

const projectDto = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "checkout",
  pending: false,
  visualTests: [],
  ...overrides,
});

describe("useProjectsWithPendingQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryOptions.current = undefined;
  });

  it("fetches exactly one server page and reports the total", async () => {
    mockGetProjectsWithPending.mockResolvedValue({
      data: {
        data: [projectDto({ name: "checkout" })],
        meta: { total: 42 },
      },
    });

    useProjectsWithPendingQuery({ page: 2, q: "check", groupId: "g1" });

    const result = (await queryOptions.current!.queryFn()) as {
      items: Project[];
      total: number;
      page: number;
      pageSize: number;
    };

    expect(result.items.map((project) => project.name)).toEqual(["checkout"]);
    expect(result.total).toBe(42);
    expect(result.page).toBe(2);
    expect(mockGetProjectsWithPending).toHaveBeenCalledTimes(1);
    expect(mockGetProjectsWithPending).toHaveBeenCalledWith({
      query: {
        skip: PROJECTS_PAGE_SIZE,
        take: PROJECTS_PAGE_SIZE,
        q: "check",
        groupId: "g1",
      },
    });
  });

  it("maps an empty payload to an empty page", async () => {
    mockGetProjectsWithPending.mockResolvedValue({ data: { data: [] } });

    useProjectsWithPendingQuery();

    const result = (await queryOptions.current!.queryFn()) as {
      items: Project[];
      total: number;
      page: number;
    };

    expect(result).toMatchObject({ items: [], total: 0, page: 1 });
  });
});

describe("useProjectDetailQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryOptions.current = undefined;
  });

  it("gates the query until the project name is ready", () => {
    const projectName = ref<string>("");

    useProjectDetailQuery(projectName);

    expect(queryOptions.current!.queryKey.value).toEqual([]);

    projectName.value = "checkout";

    expect(queryOptions.current!.queryKey.value).toEqual([
      "projects",
      "detail",
      "checkout",
      { page: 1 },
    ]);
  });

  it("keys and fetches the requested branch", async () => {
    mockGetOneProject.mockResolvedValue({
      data: projectDto({ name: "checkout", branchName: "feature/x" }),
    });

    useProjectDetailQuery(ref("checkout"), ref("feature/x"));

    expect(queryOptions.current!.queryKey.value).toEqual([
      "projects",
      "detail",
      "checkout",
      "feature/x",
      { page: 1 },
    ]);

    await queryOptions.current!.queryFn();

    expect(mockGetOneProject).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      query: { skip: 0, take: PROJECT_DETAIL_PAGE_SIZE, branch: "feature/x" },
    });
  });

  it("maps the project DTO to the domain model", async () => {
    mockGetOneProject.mockResolvedValue({
      data: projectDto({ name: "checkout" }),
    });

    useProjectDetailQuery(ref("checkout"));

    const result = (await queryOptions.current!.queryFn()) as Project;

    expect(result).toMatchObject({
      id: "1",
      name: "checkout",
      hasPendingTests: false,
    });
  });

  it("throws when the project payload is missing", async () => {
    mockGetOneProject.mockResolvedValue({});

    useProjectDetailQuery(ref("missing"));

    await expect(queryOptions.current!.queryFn()).rejects.toThrow(
      "Project not found",
    );
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import {
  useProjectsWithPendingQuery,
  useProjectDetailQuery,
} from "@/composables/useProjects";
import type { Project } from "@/domains/projects/project.model";

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

  it("pages past the first page and maps every row", async () => {
    mockGetProjectsWithPending
      .mockResolvedValueOnce({
        data: {
          data: [projectDto({ name: "checkout" })],
          meta: { total: 2 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [projectDto({ id: 2, name: "admin" })],
          meta: { total: 2 },
        },
      });

    useProjectsWithPendingQuery();

    const result = (await queryOptions.current!.queryFn()) as Project[];

    expect(result.map((p) => p.name)).toEqual(["checkout", "admin"]);
    expect(mockGetProjectsWithPending).toHaveBeenNthCalledWith(1, {
      query: { skip: 0, take: 100 },
    });
    expect(mockGetProjectsWithPending).toHaveBeenNthCalledWith(2, {
      query: { skip: 100, take: 100 },
    });
  });

  it("maps an empty payload to an empty list", async () => {
    mockGetProjectsWithPending.mockResolvedValue({ data: { data: [] } });

    useProjectsWithPendingQuery();

    const result = (await queryOptions.current!.queryFn()) as Project[];

    expect(result).toEqual([]);
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
    ]);
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

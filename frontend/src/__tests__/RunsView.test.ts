import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { i18n } from "@/i18n";
import RunsView from "@/views/RunsView.vue";
import { Select } from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockBranches } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockBranches: vi.fn(),
}));

vi.mock("@sdk", () => ({
  runsControllerList: (...args: unknown[]) => mockList(...args),
  branchesControllerList: (...args: unknown[]) => mockBranches(...args),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { projectName: "checkout" }, query: {} }),
  RouterLink: {
    props: ["to"],
    template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
  },
}));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function meta(total: number, page = 1) {
  return {
    page,
    limit: 20,
    total,
    totalPages: Math.max(1, Math.ceil(total / 20)),
    hasNextPage: page < Math.ceil(total / 20),
    hasPreviousPage: page > 1,
  };
}

// The SDK response wraps the endpoint body, and the runs list body is the
// paginated { data, meta } payload itself.
function pageOf(rows: unknown[], total = rows.length, page = 1) {
  return { data: { data: rows, meta: meta(total, page) } };
}

function runDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    key: "ci-42",
    branchName: "main",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    commitMessage: "Fix the checkout button",
    ciUrl: null,
    createdAt: minutesAgo(30),
    lastActivityAt: minutesAgo(5),
    finishedAt: null,
    finishedBy: null,
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(RunsView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: { SelectPortal: { template: "<slot />" } },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForRows(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(wrapper.findAll(`[data-testid="${TEST_ID.runRow}"]`)).toHaveLength(
      count,
    ),
  );
}

function lastListQuery() {
  const calls = mockList.mock.calls;
  return calls[calls.length - 1]![0] as {
    path: { projectName: string };
    query: { page?: number; limit?: number; branch?: string };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(pageOf([runDto()]));
  mockBranches.mockResolvedValue({
    data: [
      {
        name: "main",
        isDefault: true,
        isArchived: false,
        targetBranchName: null,
        testCount: 1,
        pendingCount: 0,
        createdAt: minutesAgo(100),
      },
      {
        name: "release",
        isDefault: false,
        isArchived: false,
        targetBranchName: null,
        testCount: 1,
        pendingCount: 0,
        createdAt: minutesAgo(90),
      },
    ],
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("RunsView", () => {
  it("lists a run with its key, branch, commit and finisher", async () => {
    mockList.mockResolvedValue(
      pageOf([
        runDto(),
        runDto({
          id: "run-2",
          key: "ci-43",
          finishedAt: minutesAgo(1),
          finishedBy: "auto",
          commitSha: null,
          commitMessage: null,
        }),
      ]),
    );

    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.runRow}"]`);
    expect(rows[0].text()).toContain("ci-42");
    expect(rows[0].text()).toContain("main");
    expect(rows[0].text()).toContain("0123456");
    expect(rows[0].text()).toContain("Fix the checkout button");
    expect(rows[1].text()).toContain("auto");

    const commit = rows[0].get(`[data-testid="${TEST_ID.runCommit}"]`);
    expect(commit.attributes("title")).toBe(
      "0123456789abcdef0123456789abcdef01234567",
    );
  });

  it("explains the empty state", async () => {
    mockList.mockResolvedValue(pageOf([]));

    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.runsEmpty}"]`).exists(),
      ).toBe(true),
    );
    expect(wrapper.get(`[data-testid="${TEST_ID.runsEmpty}"]`).text()).toBe(
      "No runs yet — pass a runKey on upload to group a CI run.",
    );
  });

  it("pages and filters through the server query", async () => {
    mockList.mockImplementation((request: unknown) => {
      const { query } = request as { query: { page?: number } };
      return pageOf([runDto()], 45, query.page ?? 1);
    });

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    expect(lastListQuery().query).toEqual({ page: 1, limit: 20 });
    expect(lastListQuery().path).toEqual({ projectName: "checkout" });

    await wrapper
      .get(`[data-testid="${TEST_ID.paginationNext}"]`)
      .trigger("click");

    await vi.waitFor(() => expect(lastListQuery().query.page).toBe(2));

    wrapper.getComponent(Select).vm.$emit("update:modelValue", "release");

    await vi.waitFor(() =>
      expect(lastListQuery()).toMatchObject({
        path: { projectName: "checkout" },
        query: { page: 1, limit: 20, branch: "release" },
      }),
    );
  });

  it("links each run to its branch-scoped detail page", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    const link = wrapper.get(`[data-testid="${TEST_ID.runRow}"]`).get("a");
    const target = link.attributes("data-to");

    expect(target).toContain('"name":"run-detail"');
    expect(target).toContain('"runKey":"ci-42"');
    expect(target).toContain('"branch":"main"');
  });
});

describe("RunsView locale", () => {
  it("renders the German labels when the locale is German", async () => {
    i18n.global.locale.value = "de";

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    expect(wrapper.text()).toContain("Läufe");
    expect(wrapper.text()).toContain("Erstellt");
    expect(wrapper.text()).toContain("Letzte Aktivität");
    expect(wrapper.text()).toContain("Abgeschlossen");
  });
});

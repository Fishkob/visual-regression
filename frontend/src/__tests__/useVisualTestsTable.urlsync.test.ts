import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick, reactive, ref } from "vue";
import { useVisualTestsTable } from "@/composables/useVisualTestsTable";
import { FILTER_ALL } from "@/domains/test-status";
import type { VisualTestItem } from "@/domains/projects/project.model";

const { mockState, mockReplace } = vi.hoisted(() => ({
  mockState: {
    route: { query: {} } as { query: Record<string, string> },
  },
  mockReplace: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => mockState.route,
  useRouter: () => ({ replace: mockReplace }),
}));

const tests: VisualTestItem[] = [
  {
    name: "checkout-report",
    kind: "pdf",
    viewport: "1920x1080",
    browser: "chrome",
    latestStatus: "UNCHANGED",
  },
];

describe("useVisualTestsTable URL sync", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockState.route = reactive({ query: {} });
  });

  it("initializes filters from the route query", () => {
    mockState.route = reactive({
      query: {
        q: "checkout",
        browser: "chrome",
        viewport: "1920x1080",
        status: "filter:pending",
        environment: "prod",
        kind: "pdf",
      },
    });

    const { filters } = useVisualTestsTable({
      tests: ref(tests),
      syncUrl: true,
    });

    expect(filters.value).toEqual({
      search: "checkout",
      browser: "chrome",
      viewport: "1920x1080",
      status: "filter:pending",
      environment: "prod",
      kind: "pdf",
    });
  });

  it("updates filters when the route query changes", async () => {
    const { filters } = useVisualTestsTable({
      tests: ref(tests),
      syncUrl: true,
    });

    expect(filters.value.kind).toBe(FILTER_ALL);

    mockState.route.query.kind = "pdf";
    await nextTick();

    expect(filters.value.kind).toBe("pdf");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("writes filter changes to the route query", async () => {
    mockState.route = reactive({ query: { browser: "chrome" } });

    const { filters } = useVisualTestsTable({
      tests: ref(tests),
      syncUrl: true,
    });

    filters.value.search = "checkout";
    await nextTick();

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const { query } = mockReplace.mock.calls[0][0];
    expect(query).toMatchObject({ q: "checkout", browser: "chrome" });
    expect(query.kind).toBeUndefined();
  });

  it("clears FILTER_ALL values from the route query", async () => {
    mockState.route = reactive({ query: { kind: "pdf" } });

    const { filters } = useVisualTestsTable({
      tests: ref(tests),
      syncUrl: true,
    });

    filters.value.kind = FILTER_ALL;
    await nextTick();

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const { query } = mockReplace.mock.calls[0][0];
    expect(query.kind).toBeUndefined();
  });
});

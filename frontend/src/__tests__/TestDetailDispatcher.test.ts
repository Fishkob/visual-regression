import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/vue-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

const mockGetKind = vi.fn();
vi.mock("@sdk", () => ({
  testsQueriesControllerGetKind: mockGetKind,
}));

vi.mock("@/lib/sdk", () => ({
  getData: (result: unknown) =>
    typeof result === "object" && result && "data" in result
      ? (result as { data: unknown }).data
      : undefined,
}));

vi.mock("@/composables/useRouteParams", () => ({
  useRouteParams: () => ({
    projectName: ref("test-project"),
    testName: ref("test-name"),
  }),
}));

const stubs = {
  VisualTestDetailsView: {
    template: '<div data-testid="visual-view">Visual</div>',
  },
  PdfTestDetailsView: { template: '<div data-testid="pdf-view">PDF</div>' },
  TestComparisonSkeleton: {
    template: '<div data-testid="skeleton">Loading</div>',
  },
  ErrorAlert: {
    props: ["variant", "title", "message", "retry", "onRetry"],
    template: '<div data-testid="error">{{ title }}</div>',
  },
};

function mockQuery(overrides: Record<string, unknown>) {
  mockUseQuery.mockReturnValue({
    data: ref(null),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
    ...overrides,
  });
}

describe("TestDetailDispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton while loading", async () => {
    mockQuery({ isLoading: ref(true) });
    const mod = await import("@/components/TestDetailDispatcher.vue");
    const wrapper = mount(mod.default, { global: { stubs } });
    expect(wrapper.find('[data-testid="skeleton"]').exists()).toBe(true);
  });

  it("shows error alert on error", async () => {
    mockQuery({ error: ref(new Error("Network error")) });
    const mod = await import("@/components/TestDetailDispatcher.vue");
    const wrapper = mount(mod.default, { global: { stubs } });
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Failed to load test");
  });

  it("renders VisualTestDetailsView when kind is image", async () => {
    mockQuery({ data: ref({ kind: "image" }) });
    const mod = await import("@/components/TestDetailDispatcher.vue");
    const wrapper = mount(mod.default, { global: { stubs } });
    expect(wrapper.find('[data-testid="visual-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pdf-view"]').exists()).toBe(false);
  });

  it("renders PdfTestDetailsView when kind is pdf", async () => {
    mockQuery({ data: ref({ kind: "pdf" }) });
    const mod = await import("@/components/TestDetailDispatcher.vue");
    const wrapper = mount(mod.default, { global: { stubs } });
    expect(wrapper.find('[data-testid="pdf-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="visual-view"]').exists()).toBe(false);
  });

  it('shows "Test not found" error when kind is null', async () => {
    mockQuery({ data: ref({ kind: null }) });
    const mod = await import("@/components/TestDetailDispatcher.vue");
    const wrapper = mount(mod.default, { global: { stubs } });
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Test not found");
  });
});

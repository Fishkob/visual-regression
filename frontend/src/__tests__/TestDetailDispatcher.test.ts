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

// The details view is normally reached with variant coordinates in the URL;
// the variant-less case is covered by the useVariantResolution test.
const routeState = vi.hoisted(() => ({
  filters: {
    value: {} as {
      viewport?: string;
      browser?: string;
      environment?: string;
    },
  },
}));

vi.mock("@/composables/useRouteParams", () => ({
  useRouteParams: () => ({
    projectName: ref("test-project"),
    testName: ref("test-name"),
    branch: ref(undefined),
    filters: routeState.filters,
  }),
}));

// The dispatcher resolves a missing variant before it renders a details view;
// the variant-resolution composable owns that query and has its own test.
vi.mock("@/composables/useTestVariants", () => ({
  useTestVariantsQuery: () => ({
    data: ref(null),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const stubs = {
  VisualTestDetailsView: {
    template: '<div data-testid="visual-view">Visual</div>',
  },
  PdfTestDetailsView: { template: '<div data-testid="pdf-view">PDF</div>' },
  TestComparisonSkeleton: {
    template: '<div data-testid="skeleton">Loading</div>',
  },
  TestDetailsHeader: {
    props: ["testName"],
    template: '<header data-testid="frame-header">{{ testName }}</header>',
  },
  TestMetadataPanel: { template: '<div data-testid="frame-metadata" />' },
  DetailActivityRail: { template: '<div data-testid="frame-rail" />' },
  ErrorAlert: {
    props: ["variant", "title", "message", "retry", "onRetry"],
    template: '<div data-testid="error">{{ title }}</div>',
  },
  EmptyState: {
    props: ["title", "description"],
    template: '<div data-testid="empty">{{ title }}</div>',
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
    routeState.filters.value = {
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
    };
  });

  it("keeps the page frame around the comparison skeleton while loading", async () => {
    mockQuery({ isLoading: ref(true) });
    const mod = await import("@/components/TestDetailDispatcher.vue");
    const wrapper = mount(mod.default, { global: { stubs } });
    expect(wrapper.find('[data-testid="skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="frame-header"]').text()).toContain(
      "test-name",
    );
    expect(wrapper.find('[data-testid="frame-metadata"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="frame-rail"]').exists()).toBe(true);
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

  it("shows the empty state when a variant-less test has no variants", async () => {
    routeState.filters.value = {};
    mockQuery({ data: ref({ kind: "image" }) });
    const mod = await import("@/components/TestDetailDispatcher.vue");
    const wrapper = mount(mod.default, { global: { stubs } });
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true);
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

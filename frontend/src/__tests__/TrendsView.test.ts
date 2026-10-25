import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import TrendsView from "@/views/TrendsView.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockGetTrends } = vi.hoisted(() => ({
  mockGetTrends: vi.fn(),
}));

vi.mock("@sdk", () => ({
  trendsControllerGet: (...args: unknown[]) => mockGetTrends(...args),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { projectName: "checkout" }, query: {} }),
}));

function trendsDto(overrides: Record<string, unknown> = {}) {
  return {
    from: "2026-09-20",
    to: "2026-10-20",
    days: 30,
    daily: [
      { date: "2026-10-19", changed: 2, unchanged: 5, withinThreshold: 1 },
      { date: "2026-10-20", changed: 1, unchanged: 0, withinThreshold: 2 },
    ],
    pendingReview: { count: 3, avgSeconds: 11_520, maxSeconds: 172_800 },
    approvalLatency: { count: 4, avgSeconds: 720 },
    flakeRate: { flakyTests: 1, totalTests: 4, rate: 0.25 },
    ...overrides,
  };
}

// The SDK response wraps the endpoint body, which is the report payload itself.
function response(overrides: Record<string, unknown> = {}) {
  return { data: trendsDto(overrides) };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(TrendsView, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForView(wrapper: ReturnType<typeof mountView>) {
  await vi.waitFor(() =>
    expect(wrapper.find(`[data-testid="${TEST_ID.trendsView}"]`).exists()).toBe(
      true,
    ),
  );
  await vi.waitFor(() =>
    expect(
      wrapper.find(`[data-testid="${TEST_ID.trendsComparisons}"]`).exists(),
    ).toBe(true),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTrends.mockResolvedValue(response());
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("TrendsView", () => {
  it("renders the four summary cards", async () => {
    const wrapper = mountView();
    await waitForView(wrapper);

    const comparisons = wrapper.get(
      `[data-testid="${TEST_ID.trendsComparisons}"]`,
    );
    expect(comparisons.text()).toContain("Changed");
    expect(comparisons.text()).toContain("Unchanged");
    expect(comparisons.text()).toContain("Within threshold");
    // 2+1 changed, 5+0 unchanged, 1+2 within threshold, 11 total.
    expect(comparisons.text()).toContain("11");
    expect(comparisons.text()).toContain("3");
    expect(comparisons.text()).toContain("5");

    const pending = wrapper.get(
      `[data-testid="${TEST_ID.trendsPendingReview}"]`,
    );
    expect(pending.text()).toContain("3");
    expect(pending.text()).toContain("3.2 h");
    expect(pending.text()).toContain("2.0 d");

    const latency = wrapper.get(
      `[data-testid="${TEST_ID.trendsApprovalLatency}"]`,
    );
    expect(latency.text()).toContain("4");
    expect(latency.text()).toContain("12 min");

    const flake = wrapper.get(`[data-testid="${TEST_ID.trendsFlakeRate}"]`);
    expect(flake.text()).toContain("25.0%");
    expect(flake.text()).toContain("1");
    expect(flake.text()).toContain("4");

    expect(mockGetTrends).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      query: { days: 30 },
    });
  });

  it("renders the daily rows with their totals", async () => {
    const wrapper = mountView();
    await waitForView(wrapper);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.trendsDailyRow}"]`);
    expect(rows).toHaveLength(2);
    expect(rows[0].findAll("td").map((cell) => cell.text())).toEqual([
      "2026-10-19",
      "2",
      "5",
      "1",
      "8",
    ]);
    expect(rows[1].findAll("td").map((cell) => cell.text())).toEqual([
      "2026-10-20",
      "1",
      "0",
      "2",
      "3",
    ]);
  });

  it("switches the range and refetches with days=90", async () => {
    const wrapper = mountView();
    await waitForView(wrapper);

    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.trendsRange30}"]`)
        .attributes("aria-pressed"),
    ).toBe("true");

    await wrapper
      .get(`[data-testid="${TEST_ID.trendsRange90}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockGetTrends).toHaveBeenCalledWith({
        path: { projectName: "checkout" },
        query: { days: 90 },
      }),
    );
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.trendsRange90}"]`)
        .attributes("aria-pressed"),
    ).toBe("true");
  });

  it("shows the empty state when the window has no outcomes", async () => {
    mockGetTrends.mockResolvedValue(response({ daily: [] }));

    const wrapper = mountView();
    await waitForView(wrapper);

    const empty = wrapper.get(`[data-testid="${TEST_ID.trendsEmpty}"]`);
    expect(empty.text()).toBe("No comparison outcomes in this window yet.");
    // The summary cards still render — they describe the whole window, not only
    // the days that happened to have outcomes.
    expect(
      wrapper.find(`[data-testid="${TEST_ID.trendsComparisons}"]`).exists(),
    ).toBe(true);
  });
});

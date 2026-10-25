import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { i18n } from "@/i18n";
import InboxView from "@/views/InboxView.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockPending, mockBranches, mockGroups, mockReplace, routeState } =
  vi.hoisted(() => ({
    mockPending: vi.fn(),
    mockBranches: vi.fn(),
    mockGroups: vi.fn(),
    mockReplace: vi.fn(),
    routeState: {} as {
      route?: { params: Record<string, string>; query: Record<string, string> };
    },
  }));

vi.mock("@sdk", () => ({
  reviewInboxControllerGetPending: (...args: unknown[]) => mockPending(...args),
  reviewInboxControllerGetBranches: (...args: unknown[]) =>
    mockBranches(...args),
  projectGroupsControllerFindAll: (...args: unknown[]) => mockGroups(...args),
}));

// The route is real enough to react to router.replace: the page reads `page`
// from the URL, so a filter apply must be able to move the route back to page 1.
vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: true }),
}));

vi.mock("vue-router", async () => {
  const { reactive } = await import("vue");
  const route = reactive({ params: {}, query: {} as Record<string, string> });
  routeState.route = route;
  return {
    useRoute: () => route,
    useRouter: () => ({ replace: mockReplace }),
    RouterLink: { template: "<a><slot /></a>" },
  };
});

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function pendingDto(overrides: Record<string, unknown> = {}) {
  return {
    comparisonId: "c-1",
    projectName: "checkout",
    groupId: null,
    groupName: null,
    testName: "checkout-flow",
    kind: "image",
    branchName: "main",
    runKey: null,
    isDefaultBranch: true,
    variant: {
      viewport: "1280x720",
      browser: "chromium",
      environment: "staging",
    },
    mismatchPixelCount: 42,
    mismatchPageCount: null,
    projectPendingCount: 1,
    projectBranchCount: 1,
    createdAt: minutesAgo(5),
    ...overrides,
  };
}

// The SDK response wraps the endpoint body, and the inbox body is the paginated
// { data, meta } payload itself.
function pageOf(rows: unknown[], total = rows.length) {
  return { data: { data: rows, meta: { total } } };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(InboxView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: { SelectPortal: { template: "<slot />" } },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForItems(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.inboxItem}"]`),
    ).toHaveLength(count),
  );
}

function lastPendingQuery() {
  const calls = mockPending.mock.calls;
  return calls[calls.length - 1]![0] as {
    query: { skip: number; take: number; runKey?: string };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeState.route!.query = {};
  mockReplace.mockImplementation(
    ({ query }: { query: Record<string, string> }) => {
      routeState.route!.query = query;
    },
  );
  mockPending.mockResolvedValue(pageOf([pendingDto()]));
  mockBranches.mockResolvedValue({ data: [] });
  mockGroups.mockResolvedValue({ data: [] });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  i18n.global.locale.value = "en";
});

describe("InboxView run filter", () => {
  it("sends the run key to the server and returns to the first page", async () => {
    routeState.route!.query = { page: "2" };

    const wrapper = mountView();
    await waitForItems(wrapper, 1);
    expect(lastPendingQuery().query).toEqual({ skip: 50, take: 50 });

    await wrapper
      .get(`[data-testid="${TEST_ID.inboxRunFilter}"]`)
      .setValue("ci-42");

    await vi.waitFor(() =>
      expect(lastPendingQuery().query).toEqual({
        skip: 0,
        take: 50,
        runKey: "ci-42",
      }),
    );
    // Applying the filter returns to page 1, which is what drops the page
    // parameter from the URL.
    expect(mockReplace).toHaveBeenCalledWith({ query: {} });
  });

  it("sends the tag filter to the server and returns to the first page", async () => {
    routeState.route!.query = { page: "2" };

    const wrapper = mountView();
    await waitForItems(wrapper, 1);
    expect(lastPendingQuery().query).toEqual({ skip: 50, take: 50 });

    await wrapper
      .get(`[data-testid="${TEST_ID.inboxTagFilter}"]`)
      .setValue("Smoke");

    await vi.waitFor(() =>
      expect(lastPendingQuery().query).toEqual({
        skip: 0,
        take: 50,
        tag: "smoke",
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ query: {} });
  });

  it("combines the tag filter with the other filters", async () => {
    const wrapper = mountView();
    await waitForItems(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.inboxTagFilter}"]`)
      .setValue("critical");
    await vi.waitFor(() =>
      expect(lastPendingQuery().query).toEqual({
        skip: 0,
        take: 50,
        tag: "critical",
      }),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.inboxRunFilter}"]`)
      .setValue("ci-7");

    await vi.waitFor(() =>
      expect(lastPendingQuery().query).toEqual({
        skip: 0,
        take: 50,
        runKey: "ci-7",
        tag: "critical",
      }),
    );
  });

  it("shows the run badge only on grouped rows", async () => {
    mockPending.mockResolvedValue(
      pageOf([
        pendingDto({ comparisonId: "c-1", runKey: "ci-42" }),
        pendingDto({
          comparisonId: "c-2",
          testName: "invoice",
          kind: "pdf",
          runKey: null,
        }),
      ]),
    );

    const wrapper = mountView();
    await waitForItems(wrapper, 2);

    const badges = wrapper.findAll(`[data-testid="${TEST_ID.inboxRunBadge}"]`);
    expect(badges).toHaveLength(1);
    expect(badges[0].text()).toBe("ci-42");
    expect(badges[0].attributes("title")).toBe("Run ci-42");
  });
});

describe("InboxView locale", () => {
  it("renders the German labels when the locale is German", async () => {
    i18n.global.locale.value = "de";

    const wrapper = mountView();
    await waitForItems(wrapper, 1);

    expect(wrapper.text()).toContain("Posteingang");
    expect(wrapper.text()).toContain("1 Änderung zu prüfen");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.inboxSearch}"]`)
        .attributes("placeholder"),
    ).toBe("Test oder Projekt suchen...");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.inboxFilterKind}"]`)
        .attributes("aria-label"),
    ).toBe("Nach Typ filtern");
  });
});

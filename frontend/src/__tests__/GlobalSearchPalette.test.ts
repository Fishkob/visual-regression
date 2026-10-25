import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import GlobalSearchPalette from "@/components/search/GlobalSearchPalette.vue";
import { useGlobalSearchPalette } from "@/composables/useGlobalSearchPalette";
import {
  SEARCH_FAVORITES_KEY,
  SEARCH_RECENTS_KEY,
} from "@/domains/search/search-storage";
import { TEST_ID } from "@/lib/test-ids";

const { mockSearch, mockPush, routeState } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockPush: vi.fn(),
  routeState: {} as {
    route?: { fullPath: string; name: string };
  },
}));

vi.mock("@sdk", () => ({
  searchControllerQuery: (...args: unknown[]) => mockSearch(...args),
}));

vi.mock("vue-router", async () => {
  const { reactive: createReactive } = await import("vue");
  const route = createReactive({ fullPath: "/", name: "review-inbox" });
  routeState.route = route;
  return {
    useRoute: () => route,
    useRouter: () => ({ push: mockPush }),
  };
});

function resultsDto(overrides: Record<string, unknown> = {}) {
  return {
    query: "check",
    projects: [{ name: "checkout" }],
    tests: [
      {
        projectName: "checkout",
        branchName: "main",
        testName: "checkout-flow",
        kind: "image",
        status: "PENDING_APPROVAL",
      },
    ],
    branches: [
      { projectName: "checkout", branchName: "release", isDefault: false },
    ],
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountPalette() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = mount(GlobalSearchPalette, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: { DialogPortal: { template: "<slot />" } },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

function openWithShortcut() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    }),
  );
}

async function waitForDialog(wrapper: ReturnType<typeof mountPalette>) {
  await vi.waitFor(() =>
    expect(
      wrapper.find(`[data-testid="${TEST_ID.globalSearchDialog}"]`).exists(),
    ).toBe(true),
  );
}

async function search(wrapper: ReturnType<typeof mountPalette>, text: string) {
  await wrapper
    .get(`[data-testid="${TEST_ID.globalSearchInput}"]`)
    .setValue(text);
}

function rows(wrapper: ReturnType<typeof mountPalette>) {
  return wrapper.findAll(`[data-testid="${TEST_ID.globalSearchResult}"]`);
}

let trigger: HTMLButtonElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  routeState.route!.fullPath = "/";
  useGlobalSearchPalette().closePalette();
  mockSearch.mockResolvedValue({ data: resultsDto() });

  trigger = document.createElement("button");
  trigger.setAttribute("data-testid", TEST_ID.searchTrigger);
  document.body.append(trigger);
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  trigger?.remove();
  trigger = null;
  useGlobalSearchPalette().closePalette();
});

describe("GlobalSearchPalette", () => {
  it("opens with Ctrl+K and renders grouped results", async () => {
    const wrapper = mountPalette();

    openWithShortcut();
    await waitForDialog(wrapper);
    await search(wrapper, "check");

    await vi.waitFor(() => expect(rows(wrapper)).toHaveLength(3));
    expect(wrapper.text()).toContain("Projects");
    expect(wrapper.text()).toContain("Tests");
    expect(wrapper.text()).toContain("Branches");
    expect(rows(wrapper)[0].text()).toContain("checkout");
    expect(rows(wrapper)[1].text()).toContain("checkout-flow");
    expect(rows(wrapper)[1].text()).toContain("checkout · main");
    expect(rows(wrapper)[2].text()).toContain("checkout · release");
  });

  it("moves the selection with the arrow keys and opens it with Enter", async () => {
    const wrapper = mountPalette();
    openWithShortcut();
    await waitForDialog(wrapper);
    await search(wrapper, "check");
    await vi.waitFor(() => expect(rows(wrapper)).toHaveLength(3));

    expect(rows(wrapper)[0].attributes("data-active")).toBe("true");

    const input = wrapper.get(`[data-testid="${TEST_ID.globalSearchInput}"]`);
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(rows(wrapper)[1].attributes("data-active")).toBe("true");
    await input.trigger("keydown", { key: "ArrowUp" });
    expect(rows(wrapper)[0].attributes("data-active")).toBe("true");
    await input.trigger("keydown", { key: "ArrowDown" });

    await input.trigger("keydown", { key: "Enter" });

    expect(mockPush).toHaveBeenCalledWith(
      "/projects/checkout/tests/checkout-flow?branch=main",
    );
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.globalSearchDialog}"]`).exists(),
      ).toBe(false),
    );
  });

  it("navigates on click and remembers the item as recent", async () => {
    const wrapper = mountPalette();
    openWithShortcut();
    await waitForDialog(wrapper);
    await search(wrapper, "check");
    await vi.waitFor(() => expect(rows(wrapper)).toHaveLength(3));

    await rows(wrapper)[0].trigger("click");
    expect(mockPush).toHaveBeenCalledWith("/projects/checkout");

    const stored = JSON.parse(
      localStorage.getItem(SEARCH_RECENTS_KEY) ?? "[]",
    ) as { label: string }[];
    expect(stored[0]?.label).toBe("checkout");

    openWithShortcut();
    await waitForDialog(wrapper);
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.globalSearchRecent}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.globalSearchRecent}"]`).text(),
    ).toContain("checkout");
  });

  it("persists favorites and shows them when the query is empty", async () => {
    const wrapper = mountPalette();
    openWithShortcut();
    await waitForDialog(wrapper);
    await search(wrapper, "check");
    await vi.waitFor(() => expect(rows(wrapper)).toHaveLength(3));

    const favoriteToggles = wrapper.findAll(
      `[data-testid="${TEST_ID.searchFavoriteToggle}"]`,
    );
    await favoriteToggles[0].trigger("click");

    const stored = JSON.parse(
      localStorage.getItem(SEARCH_FAVORITES_KEY) ?? "[]",
    ) as { label: string }[];
    expect(stored[0]?.label).toBe("checkout");

    await search(wrapper, "");
    await vi.waitFor(() =>
      expect(
        wrapper
          .find(`[data-testid="${TEST_ID.globalSearchFavorites}"]`)
          .exists(),
      ).toBe(true),
    );

    const favorites = wrapper.get(
      `[data-testid="${TEST_ID.globalSearchFavorites}"]`,
    );
    expect(favorites.text()).toContain("checkout");
    await favorites
      .findAll(`[data-testid="${TEST_ID.globalSearchResult}"]`)[0]
      .trigger("click");
    expect(mockPush).toHaveBeenCalledWith("/projects/checkout");
  });

  it("clears the recent list", async () => {
    const wrapper = mountPalette();
    openWithShortcut();
    await waitForDialog(wrapper);
    await search(wrapper, "check");
    await vi.waitFor(() => expect(rows(wrapper)).toHaveLength(3));
    await rows(wrapper)[0].trigger("click");

    openWithShortcut();
    await waitForDialog(wrapper);
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.globalSearchRecent}"]`).exists(),
      ).toBe(true),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.globalSearchRecentClear}"]`)
      .trigger("click");

    expect(
      wrapper.find(`[data-testid="${TEST_ID.globalSearchRecent}"]`).exists(),
    ).toBe(false);
    expect(localStorage.getItem(SEARCH_RECENTS_KEY)).toBeNull();
  });

  it("shows the empty state when nothing matches", async () => {
    mockSearch.mockResolvedValue({
      data: { query: "zzz", projects: [], tests: [], branches: [] },
    });

    const wrapper = mountPalette();
    openWithShortcut();
    await waitForDialog(wrapper);
    await search(wrapper, "zzz");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.globalSearchEmpty}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.globalSearchEmpty}"]`).text(),
    ).toContain('No matches for "zzz"');
  });

  it("shows the error state when the search fails", async () => {
    mockSearch.mockRejectedValue(new Error("Search is unavailable"));

    const wrapper = mountPalette();
    openWithShortcut();
    await waitForDialog(wrapper);
    await search(wrapper, "check");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.globalSearchError}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.globalSearchError}"]`).text(),
    ).toContain("Search is unavailable");
  });

  it("ignores Ctrl+K while typing in a form field", async () => {
    const wrapper = mountPalette();
    const typing = document.createElement("input");
    document.body.append(typing);
    typing.focus();

    typing.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(
      wrapper.find(`[data-testid="${TEST_ID.globalSearchDialog}"]`).exists(),
    ).toBe(false);

    typing.remove();
    openWithShortcut();
    await waitForDialog(wrapper);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const wrapper = mountPalette();
    trigger?.focus();
    openWithShortcut();
    await waitForDialog(wrapper);

    const input = wrapper.get(`[data-testid="${TEST_ID.globalSearchInput}"]`);
    (input.element as HTMLInputElement).focus();
    input.element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    await nextTick();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.globalSearchDialog}"]`).exists(),
      ).toBe(false),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("closes when the route changes", async () => {
    const wrapper = mountPalette();
    openWithShortcut();
    await waitForDialog(wrapper);

    routeState.route!.fullPath = "/projects/checkout";
    await nextTick();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.globalSearchDialog}"]`).exists(),
      ).toBe(false),
    );
  });
});

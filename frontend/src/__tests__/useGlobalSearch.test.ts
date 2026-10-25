import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref, type Ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useGlobalSearch } from "@/composables/useGlobalSearch";
import { SEARCH_DEBOUNCE_MS } from "@/domains/search/search.model";

const { mockSearch } = vi.hoisted(() => ({ mockSearch: vi.fn() }));

vi.mock("@sdk", () => ({
  searchControllerQuery: (...args: unknown[]) => mockSearch(...args),
}));

const mounted: VueWrapper[] = [];

function mountComposable<T>(useComposable: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let result!: T;

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useComposable();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  mounted.push(wrapper);

  return { result };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearch.mockResolvedValue({
    data: { query: "", projects: [], tests: [], branches: [] },
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("useGlobalSearch", () => {
  it("never requests an empty query and debounces the first character", async () => {
    const query = ref("");

    mountComposable(() => useGlobalSearch(query));

    await delay(SEARCH_DEBOUNCE_MS + 100);
    expect(mockSearch).not.toHaveBeenCalled();

    query.value = "c";
    await nextTick();
    // The keystroke alone must not fire a request.
    expect(mockSearch).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    expect(mockSearch).toHaveBeenCalledWith({ query: { q: "c" } });

    // Clearing the box returns to the local recent/favorite view; it does not
    // ask the server for an empty query.
    query.value = "";
    await delay(SEARCH_DEBOUNCE_MS + 100);
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it("only requests the settled text, not every keystroke", async () => {
    const query = ref("");

    mountComposable(() => useGlobalSearch(query));

    query.value = "a";
    await delay(100);
    query.value = "ab";
    await delay(100);
    query.value = "abc";

    await vi.waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    expect(mockSearch).toHaveBeenCalledWith({ query: { q: "abc" } });
    expect(mockSearch).not.toHaveBeenCalledWith({ query: { q: "a" } });
    expect(mockSearch).not.toHaveBeenCalledWith({ query: { q: "ab" } });
  });

  it("stays quiet while the palette is closed", async () => {
    const query = ref("checkout");
    const enabled: Ref<boolean> = ref(false);

    mountComposable(() => useGlobalSearch(query, enabled));

    await delay(SEARCH_DEBOUNCE_MS + 100);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("trims the settled query before sending it", async () => {
    const query = ref("");

    mountComposable(() => useGlobalSearch(query));

    query.value = "  checkout  ";
    await vi.waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    expect(mockSearch).toHaveBeenCalledWith({ query: { q: "checkout" } });
  });
});

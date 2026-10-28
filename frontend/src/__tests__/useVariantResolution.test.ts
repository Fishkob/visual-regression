import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick, ref } from "vue";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/vue-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { branch: "main", from: "inbox" } }),
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@sdk", () => ({
  testsQueriesControllerGetVariants: vi.fn(),
}));

vi.mock("@/lib/sdk", () => ({
  getData: (result: unknown) => result,
  unwrapSdkData: (result: unknown) => result,
}));

const variants = [
  {
    viewport: "1366x768",
    browser: "Chrome",
    environment: "staging",
    status: "UNCHANGED",
    baselineInherited: false,
  },
  {
    viewport: "1920x1080",
    browser: "Chrome",
    environment: "staging",
    status: "PENDING_APPROVAL",
    baselineInherited: false,
  },
];

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: ref({ variants: [] }),
    isLoading: ref(false),
    error: ref(null),
    refetch: vi.fn(),
    ...overrides,
  };
}

async function setup(filters = {}) {
  const { useVariantResolution } =
    await import("@/composables/useVariantResolution");
  const result = useVariantResolution({
    projectName: ref("shop"),
    testName: ref("login"),
    branch: ref("main"),
    filters: ref(filters),
    enabled: ref(true),
  });
  await nextTick();
  return result;
}

describe("useVariantResolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplace.mockResolvedValue(undefined);
  });

  it("redirects a variant-less link to the pending variant, keeping the query", async () => {
    mockUseQuery.mockReturnValue(queryResult({ data: ref({ variants }) }));

    const result = await setup();

    expect(result.isResolvingVariant.value).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith({
      query: {
        branch: "main",
        from: "inbox",
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
    });
  });

  it("does not touch the URL when variant coordinates are already present", async () => {
    mockUseQuery.mockReturnValue(queryResult());

    await setup({ viewport: "1920x1080", browser: "Chrome" });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("reports a test without variants instead of redirecting", async () => {
    mockUseQuery.mockReturnValue(queryResult({ data: ref({ variants: [] }) }));

    const result = await setup();

    expect(result.hasNoVariants.value).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("stops resolving once the variants query settles", async () => {
    mockUseQuery.mockReturnValue(queryResult({ data: ref({ variants }) }));

    const result = await setup();

    // The redirect updates the URL; until the route changes the details view
    // must not render, so the resolving flag stays on.
    expect(result.isResolvingVariant.value).toBe(true);
  });

  it("does not redirect while the variants query is still loading", async () => {
    mockUseQuery.mockReturnValue(
      queryResult({ data: ref(undefined), isLoading: ref(true) }),
    );

    const result = await setup();

    expect(result.isResolvingVariant.value).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("ignores a cached variants error when the URL already names a variant", async () => {
    // The variants key is shared with the gallery; a failed read must not blank
    // a details page that resolved its variant from the URL.
    mockUseQuery.mockReturnValue(
      queryResult({ error: ref(new Error("Authentication required")) }),
    );

    const result = await setup({ viewport: "1920x1080" });

    expect(result.error.value).toBeNull();
    expect(result.isResolvingVariant.value).toBe(false);
  });

  it("reports the variants error when the link needs resolving", async () => {
    mockUseQuery.mockReturnValue(
      queryResult({ error: ref(new Error("Authentication required")) }),
    );

    const result = await setup();

    expect(result.error.value).toBeInstanceOf(Error);
    expect(result.isResolvingVariant.value).toBe(false);
  });
});

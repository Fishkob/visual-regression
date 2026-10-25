import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useTestVariantsQuery } from "@/composables/useTestVariants";

const mockGetVariants = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  testsQueriesControllerGetVariants: (...args: unknown[]) =>
    mockGetVariants(...args),
}));

const mounted: VueWrapper[] = [];

function mountComposable<T>(useComposable: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
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

const variantsPayload = () => ({
  data: {
    name: "login",
    kind: "image",
    variants: [
      {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
        status: "PENDING_APPROVAL",
        baselineUrl: "/baseline.png",
        signedBaselineUrl: "https://cdn.example.com/baseline.png",
        candidateUrl: "/candidate.png",
        signedCandidateUrl: null,
        mismatchPixelCount: 12,
        baselineInherited: false,
      },
      {
        viewport: "390x844",
        browser: "Chrome",
        environment: "staging",
        status: "OK",
        baselineUrl: null,
        signedBaselineUrl: null,
        candidateUrl: null,
        signedCandidateUrl: null,
        mismatchPixelCount: null,
        baselineInherited: true,
      },
    ],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe("useTestVariantsQuery", () => {
  it("passes project, test and branch to the SDK and unwraps the variants", async () => {
    mockGetVariants.mockResolvedValue(variantsPayload());

    const { result } = mountComposable(() =>
      useTestVariantsQuery("checkout", "login", "feature/x"),
    );

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(mockGetVariants).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "feature/x" },
    });
    expect(result.data.value?.name).toBe("login");
    expect(result.data.value?.variants[0]).toEqual({
      viewport: "1920x1080",
      browser: "Chrome",
      environment: "staging",
      status: "PENDING_APPROVAL",
      baselineUrl: "https://cdn.example.com/baseline.png",
      candidateUrl: "/candidate.png",
      mismatchPixelCount: 12,
      baselineInherited: false,
    });
    expect(result.data.value?.variants[1]).toEqual({
      viewport: "390x844",
      browser: "Chrome",
      environment: "staging",
      status: "OK",
      baselineInherited: true,
    });
  });

  it("omits the branch query when no branch is selected", async () => {
    mockGetVariants.mockResolvedValue(variantsPayload());

    const { result } = mountComposable(() =>
      useTestVariantsQuery("checkout", "login"),
    );

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(mockGetVariants).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
    });
  });

  it("gates the read until the project and test names are known", async () => {
    mockGetVariants.mockResolvedValue(variantsPayload());
    const projectName = ref<string | undefined>(undefined);

    const { result } = mountComposable(() =>
      useTestVariantsQuery(projectName, "login"),
    );

    await flushPromises();

    expect(mockGetVariants).not.toHaveBeenCalled();
    expect(result.data.value).toBeUndefined();

    projectName.value = "checkout";

    await vi.waitFor(() => expect(mockGetVariants).toHaveBeenCalledOnce());
    expect(mockGetVariants).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
    });
  });

  it("honours an explicit enabled flag", async () => {
    mockGetVariants.mockResolvedValue(variantsPayload());
    const enabled = ref(false);

    mountComposable(() =>
      useTestVariantsQuery("checkout", "login", undefined, enabled),
    );

    await flushPromises();

    expect(mockGetVariants).not.toHaveBeenCalled();
  });

  it("refetches when the branch changes", async () => {
    mockGetVariants.mockResolvedValue(variantsPayload());
    const branch = ref<string | undefined>("main");

    const { result } = mountComposable(() =>
      useTestVariantsQuery("checkout", "login", branch),
    );

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    branch.value = "feature/x";

    await vi.waitFor(() => expect(mockGetVariants).toHaveBeenCalledTimes(2));
    expect(mockGetVariants).toHaveBeenLastCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "feature/x" },
    });
  });

  it("maps a payload without a data member to null", async () => {
    mockGetVariants.mockResolvedValue({});

    const { result } = mountComposable(() =>
      useTestVariantsQuery("checkout", "login"),
    );

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true));

    expect(result.data.value).toBeNull();
  });
});

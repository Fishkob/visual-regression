import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useVisualTestDelete,
  type DeleteOptions,
} from "@/composables/useVisualTestDelete";
import type { VisualTestItem } from "@/domains/projects/project.model";

interface MutationOptionsShape {
  onSuccess?: (data: unknown, variables: unknown, context: unknown) => void;
}

const { mockMutate, mutationOptions } = vi.hoisted(() => {
  const mutationOptions: { current?: MutationOptionsShape } = {};
  const mockMutate = vi.fn();
  return { mockMutate, mutationOptions };
});

const mockQueryClient = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));
const mockInvalidateProjectDetail = vi.hoisted(() => vi.fn());
const mockInvalidateProjectList = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/vue-query", () => ({
  useMutation: vi.fn((opts: MutationOptionsShape) => {
    mutationOptions.current = opts;
    return {
      mutate: mockMutate,
    };
  }),
  useQueryClient: vi.fn(() => mockQueryClient),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/invalidation", () => ({
  invalidateProjectDetail: mockInvalidateProjectDetail,
  invalidateProjectList: mockInvalidateProjectList,
}));

describe("useVisualTestDelete", () => {
  beforeEach(() => {
    mockInvalidateProjectDetail.mockClear();
    mockInvalidateProjectList.mockClear();
  });

  const createOptions = (
    overrides: Partial<DeleteOptions> = {},
  ): DeleteOptions => ({
    projectName: "test-project",
    ...overrides,
  });

  it("initializes with showConfirm as false", () => {
    const result = useVisualTestDelete(createOptions());

    expect(result.showConfirm.value).toBe(false);
  });

  it("initializes with pendingVariant as null", () => {
    const result = useVisualTestDelete(createOptions());

    expect(result.pendingVariant.value).toBeNull();
  });

  it("initializes with deleting as false", () => {
    const result = useVisualTestDelete(createOptions());

    expect(result.deleting.value).toBe(false);
  });

  it("requestDelete sets pendingVariant and shows confirm", () => {
    const result = useVisualTestDelete(createOptions());

    const test: VisualTestItem = {
      name: "login-form",
      viewport: "1920x1080",
      browser: "chrome",
    };

    result.requestDelete(test);

    expect(result.pendingVariant.value).toStrictEqual(test);
    expect(result.showConfirm.value).toBe(true);
  });

  it("variantLabel returns just name when no details", () => {
    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.pendingVariant.value = { name: "login-form" } as VisualTestItem;

    expect(result.variantLabel.value).toBe("login-form");
  });

  it("variantLabel includes viewport when present", () => {
    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.pendingVariant.value = {
      name: "login-form",
      viewport: "1920x1080",
    } as VisualTestItem;

    expect(result.variantLabel.value).toBe("login-form (1920x1080)");
  });

  it("variantLabel includes browser when present", () => {
    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.pendingVariant.value = {
      name: "login-form",
      browser: "chrome",
    } as VisualTestItem;

    expect(result.variantLabel.value).toBe("login-form (chrome)");
  });

  it("variantLabel includes all details joined by ·", () => {
    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.pendingVariant.value = {
      name: "login-form",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    } as VisualTestItem;

    expect(result.variantLabel.value).toBe(
      "login-form (1920x1080 · chrome · prod)",
    );
  });

  it("variantLabel returns empty string when pendingVariant is null", () => {
    const options = createOptions();
    const result = useVisualTestDelete(options);

    expect(result.variantLabel.value).toBe("");
  });

  it("cancelDelete clears pendingVariant", () => {
    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.pendingVariant.value = { name: "test" } as VisualTestItem;
    result.showConfirm.value = true;

    result.cancelDelete();

    expect(result.pendingVariant.value).toBeNull();
    // Note: cancelDelete doesn't reset showConfirm - that's a potential bug
  });

  it("confirmDelete sets deleting to true when pendingVariant exists", () => {
    mockMutate.mockClear();

    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.pendingVariant.value = { name: "login-form" } as VisualTestItem;

    result.confirmDelete();

    expect(result.deleting.value).toBe(true);
    expect(mockMutate).toHaveBeenCalledWith({
      testName: "login-form",
      viewport: undefined,
      browser: undefined,
      environment: undefined,
    });
  });

  it("confirmDelete does nothing when pendingVariant is null", () => {
    mockMutate.mockClear();

    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.confirmDelete();

    expect(mockMutate).not.toHaveBeenCalled();
    expect(result.deleting.value).toBe(false);
  });

  it("confirmDelete does nothing when already deleting", () => {
    mockMutate.mockClear();

    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.deleting.value = true;
    result.pendingVariant.value = { name: "login-form" } as VisualTestItem;

    result.confirmDelete();

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("confirmDelete passes all variant details to mutation", () => {
    mockMutate.mockClear();

    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.pendingVariant.value = {
      name: "login-form",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    } as VisualTestItem;

    result.confirmDelete();

    expect(mockMutate).toHaveBeenCalledWith({
      testName: "login-form",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    });
  });

  it("confirmDelete calls mutation with correct parameters", () => {
    mockMutate.mockClear();

    const options = createOptions();
    const result = useVisualTestDelete(options);

    result.pendingVariant.value = {
      name: "login-form",
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    } as VisualTestItem;

    result.confirmDelete();

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [callArgs] = mockMutate.mock.calls[0];
    expect(callArgs.testName).toBe("login-form");
    expect(callArgs.viewport).toBe("1920x1080");
    expect(callArgs.browser).toBe("chrome");
    expect(callArgs.environment).toBe("prod");
  });

  it("invalidates the project detail and project list after deletion", () => {
    useVisualTestDelete(createOptions());

    mutationOptions.current!.onSuccess!(
      undefined,
      { testName: "login-form" },
      undefined,
    );

    expect(mockInvalidateProjectDetail).toHaveBeenCalledWith(
      mockQueryClient,
      "test-project",
    );
    expect(mockInvalidateProjectList).toHaveBeenCalledWith(mockQueryClient);
  });
});

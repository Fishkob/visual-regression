import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEntityDeleteMutation } from "@/composables/useEntityDeleteMutation";

interface SdkMutationConfig {
  mutationFn: (args: unknown) => Promise<unknown>;
  successMessage: (data: unknown, args: unknown) => string;
  errorMessage: string;
  invalidate: (client: unknown, data: unknown, args: unknown) => void;
  onSuccess: (data: unknown, args: unknown, context: unknown) => void;
  onSettled: (
    data: unknown,
    error: unknown,
    args: unknown,
    context: unknown,
  ) => void;
}

const mockMutate = vi.hoisted(() => vi.fn());

const { mockUseSdkMutation, mutationConfig } = vi.hoisted(() => {
  const mutationConfig: { current?: SdkMutationConfig } = {};
  const mockUseSdkMutation = vi.fn((opts: SdkMutationConfig) => {
    mutationConfig.current = opts;
    return { mutate: mockMutate };
  });
  return { mockUseSdkMutation, mutationConfig };
});

vi.mock("@/composables/useSdkMutation", () => ({
  useSdkMutation: mockUseSdkMutation,
}));

interface Entity {
  id: string;
}

interface Args {
  id: string;
}

function create(options: { deletable?: boolean } = {}) {
  const { deletable = true } = options;
  return useEntityDeleteMutation<Entity, Args>({
    mutationFn: async () => ({}),
    argsOf: (entity) => (deletable ? { id: entity.id } : null),
    successMessage: ({ id }) => `Deleted ${id}`,
    errorMessage: "Delete failed",
    invalidate: vi.fn(),
  });
}

describe("useEntityDeleteMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationConfig.current = undefined;
  });

  it("opens the confirm dialog for the requested entity", () => {
    const { pendingEntity, showConfirm, requestDelete } = create();

    requestDelete({ id: "a" });

    expect(pendingEntity.value).toEqual({ id: "a" });
    expect(showConfirm.value).toBe(true);
  });

  it("confirms by building args and mutating once", () => {
    const { requestDelete, confirmDelete, deleting } = create();

    requestDelete({ id: "a" });
    confirmDelete();

    expect(deleting.value).toBe(true);
    expect(mockMutate).toHaveBeenCalledOnce();
    expect(mockMutate).toHaveBeenCalledWith({ id: "a" });
  });

  it("is a no-op when no entity is pending", () => {
    const { confirmDelete, deleting } = create();

    confirmDelete();

    expect(deleting.value).toBe(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("is a no-op for an entity the argsOf rejects", () => {
    const { requestDelete, confirmDelete, deleting } = create({
      deletable: false,
    });

    requestDelete({ id: "a" });
    confirmDelete();

    expect(deleting.value).toBe(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("ignores a confirm while a delete is already in flight", () => {
    const { requestDelete, confirmDelete, deleting } = create();

    requestDelete({ id: "a" });
    confirmDelete();
    confirmDelete();

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(deleting.value).toBe(true);
  });

  it("cancels and resets all dialog state", () => {
    const {
      requestDelete,
      confirmDelete,
      cancelDelete,
      pendingEntity,
      showConfirm,
      deleting,
    } = create();

    requestDelete({ id: "a" });
    confirmDelete();
    cancelDelete();

    expect(pendingEntity.value).toBeNull();
    expect(showConfirm.value).toBe(false);
    expect(deleting.value).toBe(false);
  });

  it("closes the dialog on success and clears the in-flight flag on settle", () => {
    const {
      requestDelete,
      confirmDelete,
      pendingEntity,
      showConfirm,
      deleting,
    } = create();

    requestDelete({ id: "a" });
    confirmDelete();
    expect(deleting.value).toBe(true);

    mutationConfig.current!.onSuccess!(undefined, { id: "a" }, undefined);
    expect(pendingEntity.value).toBeNull();
    expect(showConfirm.value).toBe(false);

    mutationConfig.current!.onSettled!(undefined, null, { id: "a" }, undefined);
    expect(deleting.value).toBe(false);
  });
});

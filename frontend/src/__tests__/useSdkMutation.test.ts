import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "vue-sonner";
import { useSdkMutation } from "@/composables/useSdkMutation";

interface MutationOptionsShape {
  mutationFn: (variables: unknown) => Promise<unknown>;
  onMutate?: (variables: unknown) => unknown;
  onSuccess?: (data: unknown, variables: unknown, context: unknown) => void;
  onError?: (error: unknown, variables: unknown, context: unknown) => void;
  onSettled?: (
    data: unknown,
    error: unknown,
    variables: unknown,
    context: unknown,
  ) => void;
}

const { mockUseMutation, mutationOptions } = vi.hoisted(() => {
  const mutationOptions: { current?: MutationOptionsShape } = {};
  const mockUseMutation = vi.fn((opts: MutationOptionsShape) => {
    mutationOptions.current = opts;
    return { mutate: vi.fn() };
  });
  return { mockUseMutation, mutationOptions };
});

const mockQueryClient = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

vi.mock("@tanstack/vue-query", () => ({
  useMutation: mockUseMutation,
  useQueryClient: vi.fn(() => mockQueryClient),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("useSdkMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationOptions.current = undefined;
  });

  it("unwraps the SDK payload through unwrapSdkData", async () => {
    useSdkMutation({
      mutationFn: async () => ({ data: { ok: true } }),
    });

    const result = await mutationOptions.current!.mutationFn({});

    expect(result).toEqual({ ok: true });
  });

  it("surfaces the SDK error message instead of treating it as empty", async () => {
    useSdkMutation({
      mutationFn: async () => ({
        error: { message: "Group name already exists" },
      }),
    });

    await expect(mutationOptions.current!.mutationFn({})).rejects.toThrow(
      "Group name already exists",
    );
  });

  it("rejects an empty response so callers cannot proceed on undefined data", async () => {
    useSdkMutation({
      mutationFn: async () => ({}),
    });

    await expect(mutationOptions.current!.mutationFn({})).rejects.toThrow(
      "Empty response from endpoint",
    );
  });

  it("accepts a 204-style empty response when allowEmptyResponse is set", async () => {
    useSdkMutation({
      mutationFn: async () => ({}),
      allowEmptyResponse: true,
    });

    await expect(mutationOptions.current!.mutationFn({})).resolves.toBe(
      undefined,
    );
  });

  it("fires a success toast and invalidation on success", () => {
    const invalidate = vi.fn();
    useSdkMutation({
      mutationFn: async () => ({ data: { ok: true } }),
      successMessage: "Done",
      invalidate,
    });

    mutationOptions.current!.onSuccess!({ ok: true }, { id: 1 }, undefined);

    expect(toast.success).toHaveBeenCalledWith("Done");
    expect(invalidate).toHaveBeenCalledWith(
      mockQueryClient,
      { ok: true },
      { id: 1 },
      undefined,
    );
  });

  it("resolves a function successMessage from data/variables/context", () => {
    const successMessage = vi.fn(() => "custom");
    useSdkMutation({
      mutationFn: async () => ({ data: 42 }),
      successMessage,
    });

    mutationOptions.current!.onSuccess!(42, { id: 2 }, { tag: "ctx" });

    expect(successMessage).toHaveBeenCalledWith(42, { id: 2 }, { tag: "ctx" });
    expect(toast.success).toHaveBeenCalledWith("custom");
  });

  it("skips the success toast when no message is configured", () => {
    useSdkMutation({
      mutationFn: async () => ({ data: 1 }),
    });

    mutationOptions.current!.onSuccess!(1, {}, undefined);

    expect(toast.success).not.toHaveBeenCalled();
  });

  it("channels success into the caller's onSuccess", () => {
    const onSuccess = vi.fn();
    useSdkMutation({
      mutationFn: async () => ({ data: 1 }),
      onSuccess,
    });

    mutationOptions.current!.onSuccess!(1, { a: 1 }, { c: 1 });

    expect(onSuccess).toHaveBeenCalledWith(1, { a: 1 }, { c: 1 });
  });

  it("fires an error toast with the configured message", () => {
    const onError = vi.fn();
    useSdkMutation({
      mutationFn: async () => ({ data: 1 }),
      errorMessage: "Could not save",
      onError,
    });

    mutationOptions.current!.onError!(new Error("boom"), {}, undefined);

    expect(toast.error).toHaveBeenCalledWith("Could not save");
    expect(onError).toHaveBeenCalledWith(new Error("boom"), {}, undefined);
  });

  it("falls back to a default error message", () => {
    useSdkMutation({
      mutationFn: async () => ({ data: 1 }),
    });

    mutationOptions.current!.onError!(new Error("boom"), {}, undefined);

    expect(toast.error).toHaveBeenCalledWith("Operation failed");
  });

  it("passes onMutate and onSettled through to the mutation", () => {
    const onMutate = vi.fn(() => "ctx");
    const onSettled = vi.fn();
    useSdkMutation({
      mutationFn: async () => ({ data: 1 }),
      onMutate,
      onSettled,
    });

    expect(mutationOptions.current!.onMutate!({ id: 1 })).toBe("ctx");
    mutationOptions.current!.onSettled!(1, null, { id: 1 }, "ctx");

    expect(onMutate).toHaveBeenCalledWith({ id: 1 });
    expect(onSettled).toHaveBeenCalledWith(1, null, { id: 1 }, "ctx");
  });
});

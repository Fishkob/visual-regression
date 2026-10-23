import type { QueryClient } from "@tanstack/vue-query";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { unwrapSdkData } from "@/lib/sdk";

interface SdkMutationOptions<TData, TVariables, TContext> {
  /** The raw SDK call — returns the SDK response object, unwrapped inside. */
  mutationFn: (variables: TVariables) => Promise<unknown>;
  successMessage?:
    | string
    | ((
        data: TData,
        variables: TVariables,
        context: TContext | undefined,
      ) => string);
  errorMessage?:
    | string
    | ((
        error: unknown,
        variables: TVariables,
        context: TContext | undefined,
      ) => string);
  invalidate?: (
    client: QueryClient,
    data: TData,
    variables: TVariables,
    context: TContext | undefined,
  ) => void;
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined,
  ) => void;
  onError?: (
    error: unknown,
    variables: TVariables,
    context: TContext | undefined,
  ) => void;
  onSettled?: (
    data: TData | undefined,
    error: unknown | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void;
}

// Deep module over the mutation ceremony: unwraps the SDK payload with
// unwrapSdkData (the query seam already absorbs this — a caller would otherwise
// re-type the unwrap + empty-check at every payload-reading call site), then
// adds toast + invalidation. Callers become a declaration: sdkFn + messages +
// invalidate.
export function useSdkMutation<TData, TVariables, TContext = undefined>(
  config: SdkMutationOptions<TData, TVariables, TContext>,
) {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVariables, TContext>({
    mutationFn: async (variables) => {
      const response = await config.mutationFn(variables);
      const data = unwrapSdkData<TData>(response);
      if (data === undefined) {
        throw new Error("Empty response from endpoint");
      }
      return data as TData;
    },

    onMutate: config.onMutate,

    onSuccess: (data, variables, context) => {
      const msg =
        typeof config.successMessage === "function"
          ? config.successMessage(data, variables, context)
          : config.successMessage;
      if (msg) toast.success(msg);
      config.invalidate?.(queryClient, data, variables, context);
      config.onSuccess?.(data, variables, context);
    },

    onError: (error, variables, context) => {
      const msg =
        typeof config.errorMessage === "function"
          ? config.errorMessage(error, variables, context)
          : config.errorMessage;
      toast.error(msg ?? "Operation failed");
      config.onError?.(error, variables, context);
    },

    onSettled: config.onSettled,
  });
}

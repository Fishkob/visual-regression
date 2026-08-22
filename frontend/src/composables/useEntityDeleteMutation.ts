import { ref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { useSdkMutation } from "@/composables/useSdkMutation";

interface EntityDeleteMutationOptions<TEntity, TArgs> {
  /** The raw SDK delete call. */
  mutationFn: (args: TArgs) => Promise<unknown>;
  /**
   * Builds the mutation args from the entity awaiting confirmation. Return
   * null when the entity is not deletable (the confirm is a no-op).
   */
  argsOf: (entity: TEntity) => TArgs | null;
  successMessage: (args: TArgs) => string;
  errorMessage: string;
  invalidate: (client: QueryClient, args: TArgs) => void;
}

// Deep module over confirm-and-delete: dialog state (pending entity, open
// dialog, in-flight flag) + the delete mutation + toast + invalidation + flag
// resets all behind one call. Callers become a declaration — entity type,
// args builder, messages, invalidate — instead of re-wiring the same
// confirm → mutate → toast → invalidate → reset orchestration (which used to
// double-reset `deleting` across two files).
export function useEntityDeleteMutation<TEntity, TArgs>(
  options: EntityDeleteMutationOptions<TEntity, TArgs>,
) {
  const pendingEntity = ref<TEntity | null>(null);
  const showConfirm = ref(false);
  const deleting = ref(false);

  const { mutate } = useSdkMutation<unknown, TArgs>({
    mutationFn: options.mutationFn,

    successMessage: (_, args) => options.successMessage(args),

    errorMessage: options.errorMessage,

    invalidate: (client, _data, args) => options.invalidate(client, args),

    onSuccess: () => {
      pendingEntity.value = null;
      showConfirm.value = false;
    },

    onSettled: () => {
      deleting.value = false;
    },
  });

  function requestDelete(entity: TEntity) {
    pendingEntity.value = entity;
    showConfirm.value = true;
  }

  function confirmDelete() {
    const entity: TEntity | null = pendingEntity.value;
    if (!entity || deleting.value) return;
    const args = options.argsOf(entity);
    if (args === null) return;
    deleting.value = true;
    mutate(args);
  }

  function cancelDelete() {
    pendingEntity.value = null;
    showConfirm.value = false;
    deleting.value = false;
  }

  return {
    pendingEntity,
    showConfirm,
    deleting,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
}

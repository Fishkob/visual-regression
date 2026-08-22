<script setup lang="ts">
import ErrorAlert from "@/components/ErrorAlert.vue";
import EmptyState from "@/components/EmptyState.vue";

// One owner of the view-state tree: loading → error → content → empty. Every
// page-level view composes this instead of re-typing the branch, so the retry
// wiring and the fallback order can't drift per view. Views supply a loading
// skeleton via the `loading` slot and an optional custom `empty` slot (default:
// EmptyState); content goes in the default slot.
defineProps<{
  isLoading: boolean;
  error?: Error | null;
  errorTitle: string;
  empty: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  retry?: () => void;
}>();

defineSlots<{
  loading?: () => unknown;
  empty?: () => unknown;
  default: () => unknown;
}>();
</script>

<template>
  <slot v-if="isLoading" name="loading" />
  <ErrorAlert
    v-else-if="error"
    variant="error"
    :title="errorTitle"
    :message="error.message"
    retry
    :on-retry="retry"
  />
  <slot v-else-if="!empty" />
  <slot v-else name="empty">
    <EmptyState :title="emptyTitle" :description="emptyDescription" />
  </slot>
</template>

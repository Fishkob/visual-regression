<script setup lang="ts">
import { Button } from "@/components/ui/button";

defineProps<{
  // When the comparison is already APPROVED, the skip button becomes a
  // "Back to project" affordance and the Approve button is hidden — the test
  // is done and the reviewer should navigate on. One behavior for both kinds.
  approved: boolean;
  // While an approval is in flight, both buttons are disabled so a double-click
  // cannot fire two concurrent approves (the second is a guaranteed CONFLICT).
  isApproving?: boolean;
}>();

defineEmits<{
  skip: [];
  approve: [];
}>();
</script>

<template>
  <div class="flex gap-4 mt-10 w-full">
    <Button
      variant="outline"
      class="flex-1 py-4 text-base rounded-xl border-border hover:bg-muted"
      data-testid="skip"
      :disabled="isApproving"
      @click="$emit('skip')"
    >
      {{ approved ? "Back to project" : "Skip" }}
    </Button>

    <Button
      v-if="!approved"
      class="flex-1 py-4 text-base rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
      data-testid="approve-changes"
      :disabled="isApproving"
      @click="$emit('approve')"
    >
      Approve changes
    </Button>
  </div>
</template>

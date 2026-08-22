<script setup lang="ts">
import InteractiveImageViewer from "@/components/detail-panels/InteractiveImageViewer.vue";
import ApproveSkipFooter from "@/components/ApproveSkipFooter.vue";
import { isApproved } from "@/domains/test-status";
import type { Comparison } from "@/domains/visual-test/visual-test.model";

const props = defineProps<{
  comparison: Comparison;
  isApproving?: boolean;
}>();

defineEmits<{
  skip: [];
  approve: [];
}>();
</script>

<template>
  <Transition
    mode="out-in"
    enter-active-class="transition-all duration-200 ease-out"
    leave-active-class="transition-all duration-150 ease-in"
    enter-from-class="opacity-0 translate-x-4"
    leave-to-class="opacity-0 -translate-x-4"
  >
    <div class="w-full" data-testid="comparison-view">
      <InteractiveImageViewer
        :baseline-url="comparison.baseline?.imageUrl"
        :candidate-url="comparison.candidate?.imageUrl"
        :diff-url="comparison.diffImageUrl"
      />

      <ApproveSkipFooter
        :approved="isApproved(props.comparison.status)"
        :is-approving="props.isApproving"
        @skip="$emit('skip')"
        @approve="$emit('approve')"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import ApprovalDecisionDialog from "@/components/approvals/ApprovalDecisionDialog.vue";
import InteractiveImageViewer from "@/components/detail-panels/InteractiveImageViewer.vue";
import ApproveSkipFooter from "@/components/ApproveSkipFooter.vue";
import { isApproved } from "@/domains/test-status";
import { TEST_ID } from "@/lib/test-ids";
import type { Comparison } from "@/domains/visual-test/visual-test.model";
import type { ApprovalDecision } from "@/domains/approvals/approval-reason";

const props = defineProps<{
  comparison: Comparison;
  isApproving?: boolean;
  // Inherited baselines are read-only on this branch: the approve/skip actions
  // belong to the branch that owns the baseline.
  readOnly?: boolean;
}>();

defineEmits<{
  skip: [];
  approve: [decision: ApprovalDecision];
}>();

const decisionOpen = ref(false);

// One entry point for "ask for the approval decision", used by the footer
// button and by the review shortcut. The `A` key must not commit directly:
// approving without the reason/note step is exactly what the button prevents
// (ADR-040), and a keyboard-only reviewer has to get the same dialog.
function openDecision(): void {
  decisionOpen.value = true;
}

defineExpose({ openDecision });

const regions = computed(() => props.comparison.changedRegions ?? []);
</script>

<template>
  <Transition
    mode="out-in"
    enter-active-class="transition-all duration-200 ease-out"
    leave-active-class="transition-all duration-150 ease-in"
    enter-from-class="opacity-0 translate-x-4"
    leave-to-class="opacity-0 -translate-x-4"
  >
    <div class="w-full" :data-testid="TEST_ID.comparisonView">
      <InteractiveImageViewer
        :baseline-url="comparison.baseline?.imageUrl"
        :candidate-url="comparison.candidate?.imageUrl"
        :diff-url="comparison.diffImageUrl"
        :regions="regions"
      />

      <ApproveSkipFooter
        v-if="!readOnly"
        :approved="isApproved(props.comparison.status)"
        :is-approving="props.isApproving"
        @skip="$emit('skip')"
        @approve="openDecision"
      />

      <ApprovalDecisionDialog
        :open="decisionOpen"
        @update:open="decisionOpen = $event"
        @confirm="$emit('approve', $event)"
      />
    </div>
  </Transition>
</template>

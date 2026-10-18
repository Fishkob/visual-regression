<template>
  <div class="flex items-center gap-2 p-2">
    <Badge
      variant="outline"
      class="px-2 py-0.5"
      :data-testid="TEST_ID.badgeViewport"
    >
      {{ variant.viewport ?? "-" }}
    </Badge>

    <Badge
      variant="outline"
      class="px-2 py-0.5"
      :data-testid="TEST_ID.badgeBrowser"
    >
      {{ variant.browser ?? "-" }}
    </Badge>

    <Badge
      variant="outline"
      class="px-2 py-0.5"
      :data-testid="TEST_ID.badgeEnvironment"
    >
      {{ variant.environment ?? "-" }}
    </Badge>

    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Badge
            v-if="comparison"
            variant="destructive"
            class="px-2 py-0.5 cursor-default"
            :data-testid="TEST_ID.badgeMismatch"
          >
            {{ comparison?.mismatchPixelCount }} px
          </Badge>
        </TooltipTrigger>

        <TooltipContent side="top" :side-offset="6" class="text-xs">
          Number of pixels that differ from baseline
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <div
            class="flex items-center gap-1 bg-muted border border-border px-2 py-1 rounded-md"
          >
            <input
              v-model="inputValue"
              @blur="onBlur"
              @keydown.enter.prevent="onBlur"
              type="number"
              aria-label="Mismatch threshold in pixels"
              class="w-12 bg-transparent border-none outline-none text-center text-[13px]"
              :data-testid="TEST_ID.thresholdInput"
            />
            <span class="text-muted-foreground text-xs">px</span>
          </div>
        </TooltipTrigger>

        <TooltipContent side="top" :side-offset="6" class="text-xs">
          Set allowed pixel difference before comparison fails
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <ConfirmDialog
      v-model:open="confirmVisible"
      :pending="updateThresholdPending"
      confirmText="Yes, continue"
      cancelText="Cancel"
      @confirm="handleConfirmThreshold"
      @cancel="handleCancelThreshold"
    >
      <template #title> Replace comparison? </template>
      <template #description>
        <p>
          This will keep the current baseline and remove the pending comparison.
        </p>
        <p class="mt-2 text-sm">
          Mismatch:
          <span class="font-bold text-status-danger"
            >{{ comparison?.mismatchPixelCount }} px</span
          >
          <span class="mx-1">→</span>
          New threshold:
          <span class="font-bold text-status-danger"
            >{{ pendingThreshold ?? "-" }} px</span
          >
        </p>
      </template>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type {
  Screenshot,
  Comparison,
} from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";
import { useThresholdEditor } from "@/composables/useThresholdEditor";

const props = defineProps<{
  comparison?: Comparison | null;
  baseline?: Screenshot;
  projectName: string;
  testName: string;
  viewport?: string;
  browser?: string;
  environment?: string;
}>();

const variant = computed(() => ({
  viewport: props.viewport ?? props.baseline?.viewport,
  browser: props.browser ?? props.baseline?.browser,
  environment: props.environment ?? props.baseline?.environment,
}));

const {
  inputValue,
  confirmVisible,
  pendingThreshold,
  updateThresholdPending,
  onBlur,
  handleCancelThreshold,
  handleConfirmThreshold,
} = useThresholdEditor({
  baseline: props.baseline,
  projectName: props.projectName,
  testName: props.testName,
  variant,
});
</script>

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

    <span v-if="comparison?.createdAt" class="text-xs text-muted-foreground">
      {{ formatRelativeAge(comparison.createdAt) }}
    </span>

    <ApprovalBadge
      :project-name="projectName"
      :test-name="testName"
      :branch="branchName"
      :variant="variant"
    />

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
          {{ t("comparison.mismatchTooltip", { tolerance: toleranceHint }) }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <TooltipProvider v-if="withinTolerance">
      <Tooltip>
        <TooltipTrigger as-child>
          <Badge
            variant="outline"
            class="px-2 py-0.5 cursor-default"
            :data-testid="TEST_ID.badgeWithinTolerance"
          >
            {{ t("comparison.withinTolerance") }}
          </Badge>
        </TooltipTrigger>

        <TooltipContent side="top" :side-offset="6" class="text-xs">
          {{
            t("comparison.withinTooltip", {
              mismatch: comparison?.mismatchPixelCount,
              threshold: baselineThreshold,
            })
          }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <TooltipProvider v-if="!readOnly && isAdmin">
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
              :aria-label="t('comparison.thresholdAria')"
              class="w-12 bg-transparent border-none outline-none text-center text-[13px]"
              :data-testid="TEST_ID.thresholdInput"
            />
            <span class="text-muted-foreground text-xs">px</span>
          </div>
        </TooltipTrigger>

        <TooltipContent side="top" :side-offset="6" class="text-xs">
          {{ t("comparison.thresholdTooltip", { tolerance: toleranceHint }) }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <ConfirmDialog
      v-model:open="confirmVisible"
      :pending="updateThresholdPending"
      :confirmText="t('comparison.confirmContinue')"
      :cancelText="t('common.cancel')"
      @confirm="handleConfirmThreshold"
      @cancel="handleCancelThreshold"
    >
      <template #title> {{ t("comparison.replaceTitle") }} </template>
      <template #description>
        <p>
          {{ t("comparison.replaceDescription") }}
        </p>
        <p class="mt-2 text-sm">
          {{ t("comparison.mismatchLabel") }}
          <span class="font-bold text-status-danger"
            >{{ comparison?.mismatchPixelCount }} px</span
          >
          <span class="mx-1">→</span>
          {{ t("comparison.newThreshold") }}
          <span class="font-bold text-status-danger"
            >{{ pendingThreshold ?? "-" }} px</span
          >
        </p>
      </template>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import ApprovalBadge from "@/components/ApprovalBadge.vue";
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
import { useCurrentRole } from "@/composables/useAuth";
import { formatRelativeAge } from "@/lib/format-date";
import { useThresholdEditor } from "@/composables/useThresholdEditor";

const props = defineProps<{
  comparison?: Comparison | null;
  baseline?: Screenshot;
  projectName: string;
  testName: string;
  viewport?: string;
  browser?: string;
  environment?: string;
  branchName?: string;
  // Inherited baselines belong to another branch: the threshold cannot be
  // edited here (the backend rejects the mutation with 409).
  readOnly?: boolean;
}>();

const { t } = useI18n();
const { isAdmin } = useCurrentRole();

const variant = computed(() => ({
  viewport: props.viewport ?? props.baseline?.viewport,
  browser: props.browser ?? props.baseline?.browser,
  environment: props.environment ?? props.baseline?.environment,
}));

// The tolerance the comparison was accepted against. A pending comparison is
// normally above it (below-threshold diffs are auto-accepted server-side); the
// flag can still be false for a row created before a threshold raise.
const baselineThreshold = computed(
  () => props.baseline?.pixelDiffThreshold ?? 0,
);

const withinTolerance = computed(
  () =>
    props.comparison != null &&
    props.comparison.thresholdExceeded === false &&
    baselineThreshold.value > 0,
);

const toleranceHint = computed(() =>
  baselineThreshold.value > 0
    ? t("comparison.toleranceSet", { threshold: baselineThreshold.value })
    : t("comparison.toleranceNone"),
);

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
  branchName: toRef(props, "branchName"),
  variant,
});
</script>

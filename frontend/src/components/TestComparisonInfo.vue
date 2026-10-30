<template>
  <div
    class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
  >
    <!-- One variant is one fact, not three badges: the three values only mean
         something together, and read as a sentence they cannot be mistaken for
         three independent settings. -->
    <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        class="font-mono text-foreground"
        :data-testid="TEST_ID.badgeViewport"
      >
        {{ variant.viewport ?? "-" }}
      </span>
      <span class="text-muted-foreground" aria-hidden="true">·</span>
      <span :data-testid="TEST_ID.badgeBrowser">{{
        variant.browser ?? "-"
      }}</span>
      <span class="text-muted-foreground" aria-hidden="true">·</span>
      <span :data-testid="TEST_ID.badgeEnvironment">{{
        variant.environment ?? "-"
      }}</span>
    </span>

    <template v-if="comparison?.createdAt">
      <span class="text-muted-foreground" aria-hidden="true">·</span>
      <span class="whitespace-nowrap">
        {{ formatRelativeAge(comparison.createdAt) }}
      </span>
    </template>

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
            class="cursor-default px-1.5 py-0 tabular-nums"
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
            class="cursor-default px-1.5 py-0"
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

    <!-- The threshold the comparison was measured against. It is a number to
         read first and an admin setting second, so the resting state is text:
         the input only shows a field on hover or focus. -->
    <TooltipProvider v-if="!readOnly && isAdmin">
      <Tooltip>
        <TooltipTrigger as-child>
          <label
            class="inline-flex items-center gap-1 whitespace-nowrap text-xs"
          >
            <span>{{ t("comparison.thresholdLabel") }}</span>
            <input
              v-model="inputValue"
              @blur="onBlur"
              @keydown.enter.prevent="onBlur"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              :aria-label="t('comparison.thresholdAria')"
              class="min-w-3 field-sizing-content rounded bg-transparent text-center font-mono text-foreground tabular-nums outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
              :data-testid="TEST_ID.thresholdInput"
            />
            <span>px</span>
          </label>
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

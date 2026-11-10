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

    <!-- The threshold the comparison was measured against, editable by an
         admin. It has to LOOK editable: the value alone in the metadata line
         read as plain text, so the label, number and unit sit in a bordered
         field with a pencil — the affordance is visible at rest, not only on
         hover. Everyone else still gets the number to read, so a reviewer who
         cannot change it never has to guess the tolerance. -->
    <TooltipProvider v-if="canEditThreshold">
      <Tooltip>
        <TooltipTrigger as-child>
          <label
            class="group/threshold inline-flex cursor-text items-center gap-1 whitespace-nowrap rounded-md border border-border bg-background px-1.5 py-0.5 text-xs shadow-xs transition-colors hover:border-ring/60 hover:bg-muted focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50"
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
              class="min-w-3 field-sizing-content cursor-text rounded bg-transparent text-center font-mono text-foreground tabular-nums outline-none"
              :data-testid="TEST_ID.thresholdInput"
            />
            <span>px</span>
            <Pencil
              class="size-3 shrink-0 text-muted-foreground transition-colors group-hover/threshold:text-foreground group-focus-within/threshold:text-foreground"
              aria-hidden="true"
            />
          </label>
        </TooltipTrigger>

        <TooltipContent side="top" :side-offset="6" class="text-xs">
          {{ t("comparison.thresholdTooltip", { tolerance: toleranceHint }) }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <span
      v-else
      class="inline-flex items-center gap-1 whitespace-nowrap text-xs"
      :data-testid="TEST_ID.thresholdReadonly"
    >
      <span>{{ t("comparison.thresholdLabel") }}</span>
      <span class="font-mono text-foreground tabular-nums">{{
        baselineThreshold
      }}</span>
      <span>px</span>
    </span>

    <!-- A variant threshold of 0 is not "no tolerance": the project default
         applies instead. That inheritance lived only in the tooltip, so the
         number on screen read as the effective tolerance when it was not. -->
    <span
      v-if="inheritsProjectDefault"
      class="whitespace-nowrap text-xs text-muted-foreground"
      :data-testid="TEST_ID.thresholdProjectDefault"
    >
      · {{ t("comparison.projectDefault", { threshold: projectThreshold }) }}
    </span>

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
import { Pencil } from "@lucide/vue";
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
  // The project default shown when this variant has no threshold of its own.
  projectPixelDiffThreshold?: number | null;
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

// The tolerance actually applied by the worker: the variant threshold when it
// has one, else the project default. The input below still edits the variant
// value, so clearing it back to 0 returns the variant to "inherits".
const projectThreshold = computed(() => props.projectPixelDiffThreshold ?? 0);
const effectiveThreshold = computed(() =>
  baselineThreshold.value > 0
    ? baselineThreshold.value
    : projectThreshold.value,
);

const withinTolerance = computed(
  () =>
    props.comparison != null &&
    props.comparison.thresholdExceeded === false &&
    effectiveThreshold.value > 0,
);

// Editing is an admin write on an owned baseline. Everyone else — a member,
// a viewer, or an admin looking at an inherited baseline — reads the number.
const canEditThreshold = computed(() => !props.readOnly && isAdmin.value);

const inheritsProjectDefault = computed(
  () => baselineThreshold.value === 0 && projectThreshold.value > 0,
);

const toleranceHint = computed(() =>
  baselineThreshold.value > 0
    ? t("comparison.toleranceSet", { threshold: baselineThreshold.value })
    : projectThreshold.value > 0
      ? t("comparison.toleranceProjectDefault", {
          threshold: projectThreshold.value,
        })
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

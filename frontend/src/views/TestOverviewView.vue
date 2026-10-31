<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouteParams } from "@/composables/useRouteParams";
import { useTestKind } from "@/composables/useTestKind";
import { useTestNavigation } from "@/composables/useTestNavigation";
import { useTestVariantsQuery } from "@/composables/useTestVariants";
import { useProjectDetailQuery } from "@/composables/useProjects";
import { isImageKind, isPdfKind } from "@/domains/test-kind";
import { isPendingApproval } from "@/domains/test-status";
import {
  groupVariantsByViewport,
  type ViewportGroup,
} from "@/domains/visual-test/variant-groups";
import {
  VARIANT_COMPARE_MODES,
  type VariantCompareMode,
} from "@/domains/visual-test/variant-pair";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";
import AsyncState from "@/components/AsyncState.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/components/ui/view-mode-toggle";
import VariantCompareStage from "@/components/variants/VariantCompareStage.vue";
import { TEST_ID } from "@/lib/test-ids";
import { ArrowLeft } from "@lucide/vue";

// The variant surface of one image test: one section per viewport, and inside it
// the browsers of that viewport compared with each other. The question the page
// answers is "how do Chrome, Firefox and Safari render this same resolution",
// so every browser of a section is labelled and available as a layer over the
// reference. Which variant is compared is the stage's own choice; opening one
// still leads to the review page, where a single comparison lives.
const { t } = useI18n();
const { projectName, testName, branch } = useRouteParams();
const { navigateToTest } = useTestNavigation({
  projectName,
  branchName: branch,
});

const { data: project } = useProjectDetailQuery(projectName, branch);
const groupName = computed(() => project.value?.groupName ?? undefined);

const {
  kind,
  isLoading: isKindLoading,
  error: kindError,
} = useTestKind(projectName, testName, branch);
const isImage = computed(() => isImageKind(kind.value));
const isPdf = computed(() => isPdfKind(kind.value));

const { data, isLoading, error, refetch } = useTestVariantsQuery(
  projectName,
  testName,
  branch,
  isImage,
);

const variants = computed(() => data.value?.variants ?? []);
const variantGroups = computed(() => groupVariantsByViewport(variants.value));
const showVariantCount = computed(
  () => isImage.value && variants.value.length > 0,
);

// One mode for every section: the way a reviewer likes to look at a rendering
// difference ("blink" catches a shift best) should not have to be re-picked per
// viewport. The toggle therefore sits above the sections, not inside them.
const compareMode = ref<VariantCompareMode>("side-by-side");

function setCompareMode(next: ViewMode) {
  if ((VARIANT_COMPARE_MODES as readonly string[]).includes(next))
    compareMode.value = next as VariantCompareMode;
}

// A project that captures one browser per viewport has nothing to layer: the
// toolbar would only offer modes that fall back to the plain grid.
const canCompareAny = computed(() =>
  variantGroups.value.some((group) => group.variants.length > 1),
);

// One shared scale makes the size comparison honest: a row is as wide as its
// viewport is relative to the widest one. Two bounds keep it readable — a very
// small viewport stops shrinking (its panes would be postage stamps), and the
// stage stops growing past a full desktop row (a lone variant would otherwise
// become a billboard).
const MIN_RELATIVE_WIDTH = 0.45;
const MAX_ROW_WIDTH_REM = 72;
const MAX_PANE_WIDTH_REM = 24;

function rowStyle(group: ViewportGroup): Record<string, string> {
  const count = group.variants.length;
  const ratio = Math.max(MIN_RELATIVE_WIDTH, group.relativeWidth);
  const maxRowWidth = `min(${MAX_ROW_WIDTH_REM}rem, ${count} * ${MAX_PANE_WIDTH_REM}rem)`;
  return {
    "--variant-row-width": `${(ratio * 100).toFixed(2)}%`,
    "--variant-row-max": `calc(${ratio.toFixed(4)} * ${maxRowWidth})`,
  };
}

const projectRoute = computed(() => ({
  name: "project-detail",
  params: { projectName: projectName.value },
  ...(branch.value ? { query: { branch: branch.value } } : {}),
}));

// The comparison needs a concrete variant (the details endpoint rejects an
// empty variant filter): prefer the variant that is actually waiting for a
// review, otherwise the first tile of the gallery.
const comparisonTarget = computed(
  () =>
    variants.value.find((variant) => isPendingApproval(variant.status)) ??
    variantGroups.value[0]?.variants[0],
);

function openVariant(variant: VariantSummary) {
  navigateToTest({ name: testName.value, ...variant });
}
</script>

<template>
  <div class="space-y-6 p-6" :data-testid="TEST_ID.testOverview">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 space-y-2">
        <Breadcrumbs :group-name="groupName" />
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="truncate text-lg font-semibold">{{ testName }}</h1>
          <Badge v-if="branch" variant="outline" class="font-mono text-[10px]">
            {{ branch }}
          </Badge>
          <Badge
            v-if="showVariantCount"
            variant="secondary"
            :data-testid="TEST_ID.testOverviewVariantCount"
          >
            {{ t("detail.variantCount", variants.length) }}
          </Badge>
        </div>
      </div>

      <Button
        v-if="comparisonTarget"
        variant="outline"
        size="sm"
        :data-testid="TEST_ID.testOverviewBack"
        @click="openVariant(comparisonTarget)"
      >
        <ArrowLeft />
        {{ t("detail.comparison") }}
      </Button>
    </div>

    <div
      v-if="canCompareAny && !isKindLoading && !kindError && !isPdf"
      class="flex flex-wrap items-center gap-3"
    >
      <ViewModeToggle
        :model-value="compareMode"
        :show-diff="false"
        :show-layered="true"
        :show-blink="true"
        @update:model-value="setCompareMode"
      />
      <span class="text-xs text-muted-foreground">
        {{ t("overview.modeHint") }}
      </span>
    </div>

    <template v-if="isKindLoading">
      <div class="space-y-8">
        <div v-for="group in 2" :key="group" class="space-y-3">
          <div class="h-4 w-28 animate-pulse rounded bg-muted" />
          <div class="flex gap-4">
            <div
              v-for="tile in 3"
              :key="tile"
              class="h-60 flex-1 animate-pulse rounded-xl bg-muted"
            />
          </div>
        </div>
      </div>
    </template>

    <div
      v-else-if="kindError"
      class="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-status-danger"
    >
      {{ t("detail.errorKind", { message: kindError.message }) }}
    </div>

    <div
      v-else-if="isPdf"
      class="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
      :data-testid="TEST_ID.testOverviewPdfNote"
    >
      {{ t("detail.pdfNote") }}
      <RouterLink :to="projectRoute" class="underline hover:text-foreground">
        {{ t("detail.openProject") }}
      </RouterLink>
    </div>

    <AsyncState
      v-else
      :is-loading="isLoading"
      :error="error"
      :error-title="t('overview.errorTitle')"
      :retry="() => refetch()"
      :empty="!isLoading && variants.length === 0"
      :empty-title="t('overview.emptyTitle')"
      :empty-description="t('overview.emptyDescription')"
    >
      <template #loading>
        <div class="space-y-8">
          <div v-for="group in 2" :key="group" class="space-y-3">
            <div class="h-4 w-28 animate-pulse rounded bg-muted" />
            <div class="flex gap-4">
              <div
                v-for="tile in 3"
                :key="tile"
                class="h-60 flex-1 animate-pulse rounded-xl bg-muted"
              />
            </div>
          </div>
        </div>
      </template>

      <div class="space-y-8">
        <section
          v-for="group in variantGroups"
          :key="group.viewport"
          class="space-y-3"
          :data-testid="TEST_ID.testOverviewViewportGroup"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="font-mono text-sm font-semibold text-foreground">
              {{ group.viewport }}
            </h2>
            <span class="text-xs text-muted-foreground">
              {{ t("detail.variantCount", group.variants.length) }}
            </span>
          </div>

          <div
            class="lg:w-[var(--variant-row-width)] lg:max-w-[var(--variant-row-max)]"
            :style="rowStyle(group)"
          >
            <VariantCompareStage
              :variants="group.variants"
              :aspect-ratio="group.aspectRatio"
              :mode="compareMode"
              @open="openVariant"
            />
          </div>
        </section>
      </div>
    </AsyncState>
  </div>
</template>

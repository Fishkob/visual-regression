<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouteParams } from "@/composables/useRouteParams";
import { useTestKind } from "@/composables/useTestKind";
import { useTestNavigation } from "@/composables/useTestNavigation";
import { useTestVariantsQuery } from "@/composables/useTestVariants";
import { useProjectDetailQuery } from "@/composables/useProjects";
import { isImageKind, isPdfKind } from "@/domains/test-kind";
import { isPendingApproval } from "@/domains/test-status";
import { sortVariantSummaries } from "@/domains/visual-test/variant-order";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";
import AsyncState from "@/components/AsyncState.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";
import { ArrowLeft, ArrowRight } from "@lucide/vue";

// The browse view for one image test: the BASELINE of every variant at full
// size. No review state, no candidate image, no approve/skip — pending changes
// belong to the review page, which a card opens for its variant. A variant
// without a baseline yet stays visible as a placeholder.
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

const variants = computed(() =>
  sortVariantSummaries(data.value?.variants ?? []),
);

const projectRoute = computed(() => ({
  name: "project-detail",
  params: { projectName: projectName.value },
  ...(branch.value ? { query: { branch: branch.value } } : {}),
}));

// The comparison needs a concrete variant (the details endpoint rejects an
// empty variant filter): prefer the variant that is actually waiting for a
// review, otherwise the first one.
const comparisonTarget = computed(
  () =>
    variants.value.find((variant) => isPendingApproval(variant.status)) ??
    variants.value[0],
);

function openVariant(variant: VariantSummary) {
  navigateToTest({ name: testName.value, ...variant });
}

function imageUrl(variant: VariantSummary): string | undefined {
  return variant.baselineUrl;
}

function variantLabel(variant: VariantSummary): string {
  return [variant.viewport, variant.browser, variant.environment]
    .filter(Boolean)
    .join(", ");
}

function cardLabel(variant: VariantSummary): string {
  return variantLabel(variant);
}
</script>

<template>
  <div class="space-y-6 p-6" :data-testid="TEST_ID.testOverview">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 space-y-1">
        <Breadcrumbs :group-name="groupName" />
        <h1 class="flex items-center gap-2 truncate text-lg font-semibold">
          {{ testName }}
          <Badge v-if="branch" variant="outline" class="font-mono text-[10px]">
            {{ branch }}
          </Badge>
        </h1>
        <p class="text-sm text-muted-foreground">
          {{ t("detail.variantCount", variants.length) }} ·
          {{ t("detail.baselines") }}
        </p>
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

    <template v-if="isKindLoading">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <div
          v-for="index in 3"
          :key="index"
          class="h-72 animate-pulse rounded-xl bg-muted"
        />
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
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <div
            v-for="index in 3"
            :key="index"
            class="h-72 animate-pulse rounded-xl bg-muted"
          />
        </div>
      </template>

      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <li
          v-for="variant in variants"
          :key="`${variant.viewport}|${variant.browser}|${variant.environment}`"
          class="min-w-0"
        >
          <button
            type="button"
            class="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="cardLabel(variant)"
            :data-testid="TEST_ID.testOverviewCard"
            :data-variant-key="`${variant.viewport}|${variant.browser}|${variant.environment}`"
            @click="openVariant(variant)"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"
            >
              <span class="font-mono text-xs font-medium text-foreground">
                {{ variant.viewport }}
              </span>
              <span class="truncate text-xs text-muted-foreground">
                {{ variant.browser }} · {{ variant.environment }}
              </span>
            </div>

            <div class="h-56 w-full overflow-hidden bg-image-canvas">
              <img
                v-if="imageUrl(variant)"
                :src="imageUrl(variant)"
                :alt="variantLabel(variant)"
                loading="lazy"
                class="block h-auto w-full select-none"
              />
              <span
                v-else
                class="flex h-full items-center justify-center text-xs text-muted-foreground"
              >
                {{ t("overview.noBaseline") }}
              </span>
            </div>

            <div
              class="flex items-center justify-end gap-1 px-3 py-2 text-xs text-muted-foreground group-hover:text-foreground"
            >
              {{ t("detail.openComparison") }}
              <ArrowRight class="h-3.5 w-3.5" aria-hidden />
            </div>
          </button>
        </li>
      </ul>
    </AsyncState>
  </div>
</template>

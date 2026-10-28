<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useVisualTestDetailsPage } from "@/composables/useTestDetailsPage";
import { useTestVariantsQuery } from "@/composables/useTestVariants";
import { useRouteParams } from "@/composables/useRouteParams";
import { useReviewShortcuts } from "@/composables/useReviewShortcuts";
import { useProjectDetailQuery } from "@/composables/useProjects";
import { isInheritedOrigin } from "@/domains/branches/branch-origin";
import { isApproved } from "@/domains/test-status";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";
import { passMarkState } from "@/lib/review-pass";

import { Badge } from "@/components/ui/badge";
import TestComparisonView from "@/components/detail-panels/TestComparisonView.vue";
import TestBaselineView from "@/components/detail-panels/TestBaselineView.vue";
import BaselineHistoryPanel from "@/components/detail-panels/BaselineHistoryPanel.vue";
import TestVariantGallery from "@/components/detail-panels/TestVariantGallery.vue";
import TestComparisonInfo from "@/components/TestComparisonInfo.vue";
import BulkApproveButton from "@/components/BulkApproveButton.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import CommentsPanel from "@/components/comments/CommentsPanel.vue";
import TestMetadataPanel from "@/components/test-lifecycle/TestMetadataPanel.vue";
import AsyncState from "@/components/AsyncState.vue";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{ kind?: string }>();

/* ------------------------------------------------------------- */
/* ROUTE + PARAMS                                                */
/* ------------------------------------------------------------- */

const { t } = useI18n();
const { projectName, testName, filters, branch, fromInbox, assignedToMe } =
  useRouteParams();
const router = useRouter();
const route = useRoute();

const { data: project } = useProjectDetailQuery(projectName, branch);
const groupName = computed(() => project.value?.groupName ?? undefined);

/* ------------------------------------------------------------- */
/* PAGE LOGIC (EXTRACTED)                                        */
/* ------------------------------------------------------------- */

const {
  data,
  isLoading,
  error,
  refetch,
  viewKey,
  handleApprove,
  handleSkip,
  isApproving,
  progress,
} = useVisualTestDetailsPage({
  projectName,
  testName,
  branchName: branch,
  filters,
  returnToInbox: fromInbox,
  assignedToMe,
});

// A test inherited from another branch has no reviewable baseline of its own
// here: approve/skip belong to the branch that owns it (the backend rejects
// mutations with 409 regardless).
const isInherited = computed(() => isInheritedOrigin(data.value?.origin));

/* ------------------------------------------------------------- */
/* VARIANT GALLERY                                               */
/* ------------------------------------------------------------- */

const { data: variantsData } = useTestVariantsQuery(
  projectName,
  testName,
  branch,
);
const variantSummaries = computed(() => variantsData.value?.variants ?? []);
const hasPendingVariants = computed(() =>
  variantSummaries.value.some(
    (variant) => variant.status === "PENDING_APPROVAL",
  ),
);

// The active tile is the variant the detail panel resolved, not the raw query
// params: a partial filter (only viewport) still resolves to exactly one
// variant server-side, and the loaded comparison names it.
const activeVariant = computed(() => {
  const resolved = data.value?.comparison?.baseline ?? data.value?.baseline;
  return {
    viewport: resolved?.viewport ?? filters.value.viewport,
    browser: resolved?.browser ?? filters.value.browser,
    environment: resolved?.environment ?? filters.value.environment,
  };
});

function selectVariant(variant: VariantSummary) {
  router.replace({
    query: {
      ...route.query,
      viewport: variant.viewport,
      browser: variant.browser,
      environment: variant.environment,
    },
    state: passMarkState(),
  });
}

useReviewShortcuts({
  onApprove: handleApprove,
  onSkip: handleSkip,
  onBack: () => router.back(),
  enabled: () =>
    !!data.value?.comparison &&
    !isInherited.value &&
    !isApproving.value &&
    !isApproved(data.value.comparison.status),
  canBack: () => !!data.value?.comparison && !isApproving.value,
});
</script>

<template>
  <!-- Header: Breadcrumb + Info -->
  <div
    class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 py-3"
  >
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <Breadcrumbs
        class="text-sm text-muted-foreground"
        :group-name="groupName"
      />
      <Badge v-if="kind" variant="outline">
        {{ kind === "pdf" ? t("detail.pdf") : t("detail.image") }}
      </Badge>
      <Badge
        v-if="isInherited"
        variant="secondary"
        class="font-mono text-[10px]"
        :data-testid="TEST_ID.inheritedBadge"
      >
        {{ t("detail.inherited", { branch: data?.inheritedFrom }) }}
      </Badge>
      <!-- The baseline can be inherited even when the test itself is owned:
           it then tracks the target branch until an approval pins it here.
           Without this the reviewer sees a diff against a picture that points at
           another branch with no indication that it does. -->
      <Badge
        v-else-if="data?.baselineInherited"
        variant="outline"
        class="font-mono text-[10px]"
        :title="
          t('detail.baselineFollowsTitle', {
            target:
              data?.inheritTarget ??
              t('detail.baselineFollows', {
                target: '',
              }),
          })
        "
        :data-testid="TEST_ID.baselineInheritedBadge"
      >
        {{
          t("detail.baselineFollows", {
            target: data?.inheritTarget ?? "target",
          })
        }}
      </Badge>
      <span
        v-if="!fromInbox && progress.total > 0"
        class="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
        :data-testid="TEST_ID.reviewProgress"
      >
        {{
          progress.total > 0
            ? t("detail.progress", {
                current: progress.current,
                total: progress.total,
              })
            : ""
        }}
      </span>
      <BulkApproveButton
        v-if="hasPendingVariants && !isInherited"
        :project-name="projectName"
        :test-name="testName"
        :branch="branch"
        :required-approvals="project?.requiredApprovals"
        :disabled="isApproving"
      />
    </div>

    <TestComparisonInfo
      v-if="data"
      :comparison="data.comparison"
      :baseline="data.comparison?.baseline || data.baseline"
      :projectName="projectName"
      :testName="testName"
      :viewport="filters.viewport"
      :browser="filters.browser"
      :environment="filters.environment"
      :branch-name="branch"
      :read-only="isInherited"
    />
  </div>

  <TestMetadataPanel class="px-6 pb-1" />

  <div class="p-6 pt-0">
    <TestVariantGallery
      v-if="variantSummaries.length > 1"
      :variants="variantSummaries"
      :active="activeVariant"
      class="mb-6"
      @select="selectVariant"
    />

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('detail.errorTitle')"
      :retry="() => refetch()"
      :empty="!data?.comparison && !data?.baseline"
      :empty-title="t('detail.emptyTitle')"
      :empty-description="t('detail.emptyDescription')"
    >
      <template #loading>
        <TestComparisonSkeleton />
      </template>

      <TestComparisonView
        v-if="data?.comparison"
        :key="viewKey"
        :comparison="data.comparison"
        :is-approving="isApproving"
        :read-only="isInherited"
        @approve="handleApprove"
        @skip="handleSkip"
      />
      <TestBaselineView v-else-if="data?.baseline" :baseline="data.baseline" />
    </AsyncState>

    <p
      v-if="
        data?.comparison &&
        !isInherited &&
        !isApproved(data.comparison.status) &&
        !isApproving
      "
      class="mt-2 text-center text-xs text-muted-foreground"
      :data-testid="TEST_ID.shortcutsHint"
    >
      {{ t("detail.shortcuts") }}
    </p>

    <!-- The thread annotates the diff it sits under; the panel is collapsed
         while empty so the comparison stays in view. -->
    <CommentsPanel
      class="mt-6"
      :project-name="projectName"
      :test-name="testName"
      :branch="branch"
      :comparison-id="data?.comparison?.id"
      :read-only="isInherited"
    />

    <!-- The history belongs to the variant the details resolved, not to the
         route filter: a partial filter still resolves to exactly one variant
         server-side. Hidden for an inherited test — the history lives on the
         branch that owns it, and the read answers 409 here (ADR-028) — and
         read-only while the baseline is still an inherited clone. -->
    <BaselineHistoryPanel
      v-if="data?.baseline && !isInherited"
      class="mt-6"
      :project-name="projectName"
      :test-name="testName"
      :branch="branch"
      :variant="activeVariant"
      :current-hash="data?.baseline?.imageHash"
      :read-only="isInherited || !!data?.baselineInherited"
    />
  </div>
</template>

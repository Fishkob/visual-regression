<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useRouteParams } from "@/composables/useRouteParams";
import { usePdfTestDetailsPage } from "@/composables/useTestDetailsPage";
import { useReviewShortcuts } from "@/composables/useReviewShortcuts";
import { useProjectDetailQuery } from "@/composables/useProjects";
import { isInheritedOrigin } from "@/domains/branches/branch-origin";
import { isApproved } from "@/domains/test-status";
import type { TestKind } from "@/domains/test-kind";
import PdfComparisonView from "@/components/pdf/PdfComparisonView.vue";
import PdfBaselineView from "@/components/pdf/PdfBaselineView.vue";
import DetailActivityRail from "@/components/detail-panels/DetailActivityRail.vue";
import TestDetailsHeader from "@/components/TestDetailsHeader.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import TestMetadataPanel from "@/components/test-lifecycle/TestMetadataPanel.vue";
import AsyncState from "@/components/AsyncState.vue";
import ApprovalBadge from "@/components/ApprovalBadge.vue";
import BulkApproveButton from "@/components/BulkApproveButton.vue";
import { TEST_ID } from "@/lib/test-ids";
import { formatRelativeAge } from "@/lib/format-date";

defineProps<{ kind?: TestKind }>();

const { t } = useI18n();
const {
  projectName,
  testName,
  filters,
  branch,
  fromInbox,
  assignedToMe,
  inboxFilters,
} = useRouteParams();
const router = useRouter();

const { data: project } = useProjectDetailQuery(projectName, branch);
const groupName = computed(() => project.value?.groupName ?? undefined);

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
} = usePdfTestDetailsPage({
  projectName,
  testName,
  branchName: branch,
  filters,
  returnToInbox: fromInbox,
  assignedToMe,
  pendingFilters: inboxFilters,
});

// A test inherited from another branch has no reviewable baseline of its own
// here: approve/skip belong to the branch that owns it (the backend rejects
// mutations with 409 regardless).
const isInherited = computed(() => isInheritedOrigin(data.value?.origin));
const hasPendingComparison = computed(
  () => data.value?.comparison?.status === "PENDING_APPROVAL",
);

// The approval badge and the baseline history are per variant: resolve the
// variant the details actually show, with the route filter as the fallback when
// the payload has not landed yet.
const resolvedVariant = computed(() => {
  const source = data.value?.comparison?.candidate ?? data.value?.baseline;
  return {
    viewport: source?.viewport ?? filters.value.viewport,
    browser: source?.browser ?? filters.value.browser,
    environment: source?.environment ?? filters.value.environment,
  };
});

// Both lines under the page pair describe the decision the reviewer is about to
// make, so they render next to Skip/Approve instead of in the page header.
const showProgress = computed(
  () => !fromInbox.value && progress.value.total > 0,
);
const showShortcuts = computed(
  () =>
    !!data.value?.comparison &&
    !isInherited.value &&
    !isApproving.value &&
    !isApproved(data.value.comparison.status),
);

// The decision dialog lives inside the PDF comparison panel, so the shortcut
// opens it there instead of committing an approval without a reason — the same
// path the Approve button takes (ADR-040).
const comparisonView = ref<InstanceType<typeof PdfComparisonView> | null>(null);

useReviewShortcuts({
  onApprove: () => comparisonView.value?.openDecision(),
  onSkip: handleSkip,
  onBack: () => router.back(),
  enabled: () => showShortcuts.value,
  canBack: () => !!data.value?.comparison && !isApproving.value,
});
</script>

<template>
  <!-- Same shape as the image review page: the trail and the test name own the
       top, the review action sits opposite the name. -->
  <TestDetailsHeader
    :test-name="testName"
    :group-name="groupName"
    :branch="branch"
    :kind="kind"
    :is-inherited="isInherited"
    :inherited-from="data?.inheritedFrom"
    :baseline-inherited="data?.baselineInherited"
    :inherit-target="data?.inheritTarget"
  >
    <template #actions>
      <BulkApproveButton
        v-if="hasPendingComparison && !isInherited"
        :project-name="projectName"
        :test-name="testName"
        :branch="branch"
        :disabled="isApproving"
      />
    </template>
  </TestDetailsHeader>

  <TestMetadataPanel class="px-6 pb-3" />

  <div class="p-6 pt-0">
    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('detail.pdfErrorTitle')"
      :retry="() => refetch()"
      :empty="!data?.baseline"
      :empty-title="t('detail.pdfEmptyTitle')"
      :empty-description="t('detail.emptyDescription')"
    >
      <template #loading>
        <TestComparisonSkeleton />
      </template>

      <!-- What am I looking at: the age of the pair and who approved it last,
           directly above the document it describes. -->
      <div
        v-if="data"
        class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      >
        <span
          v-if="data.comparison?.createdAt"
          class="whitespace-nowrap"
          :data-testid="TEST_ID.pdfComparisonAge"
        >
          {{ formatRelativeAge(data.comparison.createdAt) }}
        </span>
        <ApprovalBadge
          :project-name="projectName"
          :test-name="testName"
          :branch="branch"
          :variant="resolvedVariant"
        />
      </div>

      <PdfComparisonView
        v-if="data?.comparison && data?.baseline"
        ref="comparisonView"
        :key="viewKey"
        :project-name="projectName"
        :test-name="testName"
        :branch-name="branch"
        :baseline="data.baseline"
        :comparison="data.comparison"
        :is-approving="isApproving"
        :read-only="isInherited"
        @approve="handleApprove"
        @skip="handleSkip"
      />

      <PdfBaselineView
        v-else-if="
          data?.baseline &&
          data.baseline.pageCount != null &&
          data.baseline.pageCount > 0
        "
        :project-name="projectName"
        :test-name="testName"
        :branch-name="branch"
        :pdf-url="data.baseline.pdfUrl"
        :page-count="data.baseline.pageCount"
      />
      <div
        v-else-if="data?.baseline"
        :data-testid="TEST_ID.pdfPageCountUnknown"
        class="flex items-center justify-center min-h-[200px] text-muted-foreground"
      >
        {{ t("detail.pdfPageUnknown") }}
      </div>
    </AsyncState>

    <!-- The pass position belongs next to the decision it describes. -->
    <div
      v-if="showProgress || showShortcuts"
      class="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted-foreground"
    >
      <span
        v-if="showProgress"
        role="status"
        aria-live="polite"
        :data-testid="TEST_ID.reviewProgress"
      >
        {{
          t("detail.progress", {
            current: progress.current,
            total: progress.total,
          })
        }}
      </span>
      <span v-if="showProgress && showShortcuts" aria-hidden="true">·</span>
      <span v-if="showShortcuts" :data-testid="TEST_ID.shortcutsHint">
        {{ t("detail.shortcuts") }}
      </span>
    </div>

    <!-- The thread, the baseline trail and the approval trail sit below the
         page pair: the document needs the full width. The page count of each
         revision travels in the DTO. -->
    <DetailActivityRail
      class="mt-6"
      kind="pdf"
      :project-name="projectName"
      :test-name="testName"
      :branch="branch"
      :comparison-id="data?.comparison?.id"
      :read-only="isInherited"
      :history-read-only="isInherited || !!data?.baselineInherited"
      :history-enabled="!!data?.baseline && !isInherited"
      :variant="resolvedVariant"
      :current-hash="data?.baseline?.imageHash"
    />
  </div>
</template>

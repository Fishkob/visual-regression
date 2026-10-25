<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useRouteParams } from "@/composables/useRouteParams";
import { usePdfTestDetailsPage } from "@/composables/useTestDetailsPage";
import { useReviewShortcuts } from "@/composables/useReviewShortcuts";
import { useProjectDetailQuery } from "@/composables/useProjects";
import { isInheritedOrigin } from "@/domains/branches/branch-origin";
import { isApproved } from "@/domains/test-status";
import { Badge } from "@/components/ui/badge";
import PdfComparisonView from "@/components/pdf/PdfComparisonView.vue";
import PdfBaselineView from "@/components/pdf/PdfBaselineView.vue";
import BaselineHistoryPanel from "@/components/detail-panels/BaselineHistoryPanel.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import AsyncState from "@/components/AsyncState.vue";
import ApprovalBadge from "@/components/ApprovalBadge.vue";
import BulkApproveButton from "@/components/BulkApproveButton.vue";
import { TEST_ID } from "@/lib/test-ids";
import { formatRelativeAge } from "@/lib/format-date";

defineProps<{ kind?: string }>();

const { projectName, testName, filters, branch, fromInbox } = useRouteParams();
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
  <div class="flex justify-between items-start px-6 py-3">
    <div class="flex items-center gap-2">
      <Breadcrumbs
        class="text-sm text-muted-foreground"
        :group-name="groupName"
      />
      <Badge v-if="kind" variant="outline">
        {{ kind === "pdf" ? "PDF" : "Image" }}
      </Badge>
      <Badge
        v-if="isInherited"
        variant="secondary"
        class="font-mono text-[10px]"
        :data-testid="TEST_ID.inheritedBadge"
      >
        inherited from {{ data?.inheritedFrom }}
      </Badge>
      <!-- The baseline can be inherited even when the test itself is owned:
           it then tracks the target branch until an approval pins it here.
           Without this the reviewer sees a diff against a picture that points at
           another branch with no indication that it does. -->
      <Badge
        v-else-if="data?.baselineInherited"
        variant="outline"
        class="font-mono text-[10px]"
        :title="`This baseline follows ${data?.inheritTarget ?? 'the target branch'} until it is approved on this branch`"
        :data-testid="TEST_ID.baselineInheritedBadge"
      >
        baseline follows {{ data?.inheritTarget ?? "target" }}
      </Badge>
      <span
        v-if="data?.comparison?.createdAt"
        class="text-xs text-muted-foreground"
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
      <BulkApproveButton
        v-if="hasPendingComparison && !isInherited"
        :project-name="projectName"
        :test-name="testName"
        :branch="branch"
        :disabled="isApproving"
      />
      <span
        v-if="!fromInbox && progress.total > 0"
        class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
        :data-testid="TEST_ID.reviewProgress"
      >
        {{
          progress.total > 0 ? `${progress.current} of ${progress.total}` : ""
        }}
      </span>
    </div>
  </div>

  <div class="p-6 pt-0">
    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load PDF test"
      :retry="() => refetch()"
      :empty="!data?.baseline"
      empty-title="No PDF test data available"
      empty-description="This test has no baseline or comparison data yet."
    >
      <template #loading>
        <TestComparisonSkeleton />
      </template>

      <PdfComparisonView
        v-if="data?.comparison && data?.baseline"
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
        :pdf-url="data.baseline.pdfUrl"
        :page-count="data.baseline.pageCount"
        :branch-name="branch"
      />
      <div
        v-else-if="data?.baseline"
        :data-testid="TEST_ID.pdfPageCountUnknown"
        class="flex items-center justify-center min-h-[200px] text-muted-foreground"
      >
        Page count unknown — upload a comparison
      </div>
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
      Press A to approve, S to skip, Esc to go back.
    </p>

    <!-- Restoring replaces the baseline of the resolved variant and retires its
         pending comparison, so the panel needs the same read-only flag as the
         approve actions. Hidden for an inherited test (the read answers 409 —
         the history lives on the branch that owns it) and read-only while the
         baseline is still an inherited clone. The page count of each revision
         travels in the DTO. -->
    <BaselineHistoryPanel
      v-if="data?.baseline && !isInherited"
      class="mt-6"
      kind="pdf"
      :project-name="projectName"
      :test-name="testName"
      :branch="branch"
      :variant="resolvedVariant"
      :current-hash="data?.baseline?.imageHash"
      :read-only="isInherited || !!data?.baselineInherited"
    />
  </div>
</template>

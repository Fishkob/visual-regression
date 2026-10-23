<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useRouteParams } from "@/composables/useRouteParams";
import { usePdfTestDetailsPage } from "@/composables/useTestDetailsPage";
import { useReviewShortcuts } from "@/composables/useReviewShortcuts";
import { useProjectDetailQuery } from "@/composables/useProjects";
import { isApproved } from "@/domains/test-status";
import { Badge } from "@/components/ui/badge";
import PdfComparisonView from "@/components/pdf/PdfComparisonView.vue";
import PdfBaselineView from "@/components/pdf/PdfBaselineView.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import AsyncState from "@/components/AsyncState.vue";
import { TEST_ID } from "@/lib/test-ids";
import { formatRelativeAge } from "@/lib/format-date";

defineProps<{ kind?: string }>();

const { projectName, testName, filters, fromInbox } = useRouteParams();
const router = useRouter();

const { data: project } = useProjectDetailQuery(projectName);
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
  filters,
  returnToInbox: fromInbox,
});

useReviewShortcuts({
  onApprove: handleApprove,
  onSkip: handleSkip,
  onBack: () => router.back(),
  enabled: () =>
    !!data.value?.comparison &&
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
      <span
        v-if="data?.comparison?.createdAt"
        class="text-xs text-muted-foreground"
        :data-testid="TEST_ID.pdfComparisonAge"
      >
        {{ formatRelativeAge(data.comparison.createdAt) }}
      </span>
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
        :baseline="data.baseline"
        :comparison="data.comparison"
        :is-approving="isApproving"
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
        data?.comparison && !isApproved(data.comparison.status) && !isApproving
      "
      class="mt-2 text-center text-xs text-muted-foreground"
      :data-testid="TEST_ID.shortcutsHint"
    >
      Press A to approve, S to skip, Esc to go back.
    </p>
  </div>
</template>

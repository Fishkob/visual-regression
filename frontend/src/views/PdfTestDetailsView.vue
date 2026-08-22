<script setup lang="ts">
import { useRouteParams } from "@/composables/useRouteParams";
import { usePdfTestDetailsPage } from "@/composables/useTestDetailsPage";
import PdfComparisonView from "@/components/pdf/PdfComparisonView.vue";
import PdfBaselineView from "@/components/pdf/PdfBaselineView.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import AsyncState from "@/components/AsyncState.vue";

const { projectName, testName, filters } = useRouteParams();

const {
  data,
  isLoading,
  error,
  refetch,
  viewKey,
  handleApprove,
  handleSkip,
  isApproving,
} = usePdfTestDetailsPage({
  projectName,
  testName,
  filters,
});
</script>

<template>
  <div class="flex justify-between items-start px-6 py-3">
    <Breadcrumbs class="text-sm text-muted-foreground" />
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
        class="flex items-center justify-center min-h-[200px] text-muted-foreground"
      >
        Page count unknown — upload a comparison
      </div>
    </AsyncState>
  </div>
</template>

<script setup lang="ts">
import { useVisualTestDetailsPage } from "@/composables/useTestDetailsPage";
import { useRouteParams } from "@/composables/useRouteParams";

import TestComparisonView from "@/components/detail-panels/TestComparisonView.vue";
import TestBaselineView from "@/components/detail-panels/TestBaselineView.vue";
import TestComparisonInfo from "@/components/TestComparisonInfo.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import AsyncState from "@/components/AsyncState.vue";

/* ------------------------------------------------------------- */
/* ROUTE + PARAMS                                                */
/* ------------------------------------------------------------- */

const { projectName, testName, filters } = useRouteParams();

/* ------------------------------------------------------------- */
/* PAGE LOGIC (EXTRACTED)                                        */
/* ------------------------------------------------------------- */

const { data, isLoading, error, refetch, viewKey, handleApprove, handleSkip } =
  useVisualTestDetailsPage({
    projectName,
    testName,
    filters,
  });
</script>

<template>
  <!-- Header: Breadcrumb + Info -->
  <div class="flex justify-between items-start px-6 py-3">
    <Breadcrumbs class="text-sm text-muted-foreground" />

    <TestComparisonInfo
      v-if="data"
      :comparison="data.comparison"
      :baseline="data.comparison?.baseline || data.baseline"
      :projectName="projectName"
      :testName="testName"
      :viewport="filters.viewport"
      :browser="filters.browser"
      :environment="filters.environment"
    />
  </div>

  <div class="p-6 pt-0">
    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load test"
      :retry="() => refetch()"
      :empty="!data?.comparison && !data?.baseline"
      empty-title="No visual test data available"
      empty-description="This test has no baseline or comparison data yet."
    >
      <template #loading>
        <TestComparisonSkeleton />
      </template>

      <TestComparisonView
        v-if="data?.comparison"
        :key="viewKey"
        :comparison="data.comparison"
        @approve="handleApprove"
        @skip="handleSkip"
      />
      <TestBaselineView v-else-if="data?.baseline" :baseline="data.baseline" />
    </AsyncState>
  </div>
</template>

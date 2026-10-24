<script setup lang="ts">
import { useRouteParams } from "@/composables/useRouteParams";
import { useTestKind } from "@/composables/useTestKind";
import { isImageKind, isPdfKind, isTestKind } from "@/domains/test-kind";
import VisualTestDetailsView from "@/views/VisualTestDetailsView.vue";
import PdfTestDetailsView from "@/views/PdfTestDetailsView.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import ErrorAlert from "@/components/ErrorAlert.vue";
import AsyncState from "@/components/AsyncState.vue";

const { projectName, testName, branch } = useRouteParams();

// The kind lookup is branch-scoped: a test that only exists on the branch must
// resolve there, not against the project default.
const { kind, isLoading, error, refetch } = useTestKind(
  projectName,
  testName,
  branch,
);
</script>

<template>
  <AsyncState
    :is-loading="isLoading"
    :error="error"
    error-title="Failed to load test"
    :retry="refetch"
    :empty="!isTestKind(kind)"
  >
    <template #loading>
      <TestComparisonSkeleton />
    </template>
    <VisualTestDetailsView v-if="isImageKind(kind)" :kind="kind" />
    <PdfTestDetailsView v-else-if="isPdfKind(kind)" :kind="kind" />
    <template #empty>
      <ErrorAlert
        variant="error"
        title="Test not found"
        message="The requested test does not exist."
      />
    </template>
  </AsyncState>
</template>

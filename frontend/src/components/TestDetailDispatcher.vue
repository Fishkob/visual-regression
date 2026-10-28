<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouteParams } from "@/composables/useRouteParams";
import { useTestKind } from "@/composables/useTestKind";
import { useVariantResolution } from "@/composables/useVariantResolution";
import { isImageKind, isPdfKind, isTestKind } from "@/domains/test-kind";
import VisualTestDetailsView from "@/views/VisualTestDetailsView.vue";
import PdfTestDetailsView from "@/views/PdfTestDetailsView.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorAlert from "@/components/ErrorAlert.vue";
import AsyncState from "@/components/AsyncState.vue";

const { t } = useI18n();
const { projectName, testName, branch, filters } = useRouteParams();

// The kind lookup is branch-scoped: a test that only exists on the branch must
// resolve there, not against the project default.
const { kind, isLoading, error, refetch } = useTestKind(
  projectName,
  testName,
  branch,
);

// Deep links without variant coordinates (search hits, bookmarks, pasted URLs)
// resolve to the pending variant before either details view queries.
const {
  isResolvingVariant,
  hasNoVariants,
  error: variantsError,
  refetch: refetchVariants,
} = useVariantResolution({
  projectName,
  testName,
  branch,
  filters,
  enabled: computed(() => isTestKind(kind.value)),
});

const isEmpty = computed(() => !isTestKind(kind.value) || hasNoVariants.value);

const shownError = computed(() => error.value ?? variantsError.value ?? null);

function retry(): void {
  refetch();
  if (hasNoVariants.value || variantsError.value) refetchVariants();
}
</script>

<template>
  <AsyncState
    :is-loading="isLoading || isResolvingVariant"
    :error="shownError"
    :error-title="t('detail.errorTitle')"
    :retry="retry"
    :empty="isEmpty"
  >
    <template #loading>
      <TestComparisonSkeleton />
    </template>
    <VisualTestDetailsView
      v-if="isTestKind(kind) && isImageKind(kind) && !isResolvingVariant"
      :kind="kind"
    />
    <PdfTestDetailsView
      v-else-if="isTestKind(kind) && isPdfKind(kind) && !isResolvingVariant"
      :kind="kind"
    />
    <template #empty>
      <ErrorAlert
        v-if="!isTestKind(kind)"
        variant="error"
        :title="t('detail.notFoundTitle')"
        :message="t('detail.notFoundBody')"
      />
      <EmptyState
        v-else
        :title="t('detail.noVariantsTitle')"
        :description="t('detail.noVariantsBody')"
      />
    </template>
  </AsyncState>
</template>

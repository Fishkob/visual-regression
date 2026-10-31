<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouteParams } from "@/composables/useRouteParams";
import { useTestKind } from "@/composables/useTestKind";
import { useVariantResolution } from "@/composables/useVariantResolution";
import { isImageKind, isPdfKind, isTestKind } from "@/domains/test-kind";
import VisualTestDetailsView from "@/views/VisualTestDetailsView.vue";
import PdfTestDetailsView from "@/views/PdfTestDetailsView.vue";
import TestDetailsHeader from "@/components/TestDetailsHeader.vue";
import DetailActivityRail from "@/components/detail-panels/DetailActivityRail.vue";
import TestComparisonSkeleton from "@/components/cards/TestComparisonSkeleton.vue";
import TestMetadataPanel from "@/components/test-lifecycle/TestMetadataPanel.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorAlert from "@/components/ErrorAlert.vue";
import AsyncState from "@/components/AsyncState.vue";
import { useProjectDetailQuery } from "@/composables/useProjects";

const { t } = useI18n();
const { projectName, testName, branch, filters } = useRouteParams();

// The loading frame shows the real trail, so it needs the group of the project
// it sits in. It shares the key the details views read, so this adds no request.
const { data: project } = useProjectDetailQuery(projectName, branch);
const groupName = computed(() => project.value?.groupName ?? undefined);

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
    <!-- The kind (and, on a variant-less deep link, the variant) is still on
         its way, but the page around the comparison is already known: the
         trail, the test name and its metadata come from the route. Only the
         comparison body is a placeholder, so entering a test or skipping to
         the next one never blanks the page. -->
    <template #loading>
      <TestDetailsHeader
        :test-name="testName"
        :group-name="groupName"
        :branch="branch"
        :kind="kind"
      />
      <TestMetadataPanel class="px-6 pb-3" />
      <div class="p-6 pt-0">
        <TestComparisonSkeleton />
        <DetailActivityRail
          class="mt-6"
          :project-name="projectName"
          :test-name="testName"
          :branch="branch"
          :variant="filters"
          :history-enabled="false"
        />
      </div>
    </template>
    <VisualTestDetailsView
      v-if="isTestKind(kind) && isImageKind(kind) && !isResolvingVariant"
      :kind="kind ?? undefined"
    />
    <PdfTestDetailsView
      v-else-if="isTestKind(kind) && isPdfKind(kind) && !isResolvingVariant"
      :kind="kind ?? undefined"
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

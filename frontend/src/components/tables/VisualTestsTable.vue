<script setup lang="ts">
import { computed, h, ref, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import TestFilterBar from "@/components/tables/TestFilterBar.vue";
import TestAccordionGroups from "@/components/tables/TestAccordionGroups.vue";
import RowActionsCell from "@/components/tables/RowActionsCell.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import BulkFailureDialog from "@/components/bulk-actions/BulkFailureDialog.vue";

import type { ColumnDef } from "@tanstack/vue-table";
import type { AppTableFeatures } from "@/components/ui/table/table-features";
import type { VisualTestItem } from "@/domains/projects/project.model";

import { getStatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IMAGE_TEST_KIND } from "@/domains/test-kind";
import { useVisualTestsTable } from "@/composables/useVisualTestsTable";
import { useVisualTestDelete } from "@/composables/useVisualTestDelete";
import { useBulkDeleteTests } from "@/composables/useBulkActions";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useTestNavigation } from "@/composables/useTestNavigation";
import { isInheritedOrigin } from "@/domains/branches/branch-origin";
import {
  bulkFailureRows,
  type BulkFailureRow,
} from "@/domains/bulk-actions/bulk-action.model";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();

const props = defineProps<{
  tests: VisualTestItem[];
  projectName: string;
  branchName?: string;
  syncUrl?: boolean;
  serverFiltered?: boolean;
  selectable?: boolean;
  filterOptions?: {
    viewports: string[];
    browsers: string[];
    environments: string[];
  };
}>();

const testsRef = toRef(props, "tests");
const filterOptionsRef = toRef(props, "filterOptions");

const {
  filters,
  viewports,
  browsers,
  environments,
  groups,
  defaultAccordionValues,
  resetFilters,
} = useVisualTestsTable({
  tests: testsRef,
  syncUrl: props.syncUrl,
  serverFiltered: props.serverFiltered,
  filterOptions: filterOptionsRef,
});

const {
  showConfirm,
  deleting,
  variantLabel,
  requestDelete,
  confirmDelete,
  cancelDelete,
} = useVisualTestDelete({
  projectName: props.projectName,
  branchName: toRef(props, "branchName"),
});

const { navigateToTest, navigateToTestOverview } = useTestNavigation({
  projectName: toRef(props, "projectName"),
  branchName: toRef(props, "branchName"),
});

// A row is "show me this variant": it opens the baseline, or the comparison
// waiting for review. The variant gallery is an explicit detour (row actions,
// or the Variants button on the detail page), not the default destination.
function handleRowClick(t: VisualTestItem) {
  navigateToTest(t);
}

function inheritedBadge(inheritedFrom: string | null | undefined) {
  return h(
    Badge,
    {
      variant: "secondary",
      class: "font-mono text-[10px]",
      "data-testid": TEST_ID.inheritedBadge,
    },
    () => `inherited from ${inheritedFrom ?? ""}`,
  );
}

/* ------------------------ BULK TEST DELETION ----------------------- */

// The delete endpoint takes test names, so the selection is the groups (tests),
// not their variant rows. A group whose rows all come from an ancestor branch
// has no test on this branch to delete, so it is not selectable and "select all"
// leaves it out.
const deletableNames = computed(() =>
  groups.value
    .filter((group) =>
      group.items.some((item) => !isInheritedOrigin(item.origin)),
    )
    .map((group) => group.name),
);

const {
  selectedIds,
  count: selectedCount,
  toggle,
  selectAll,
  clear: clearSelection,
  prune,
} = useBulkSelection();

// A filter, a page change or a refetch removes rows; a stale test name must not
// be deleted by a later bulk action.
watch(deletableNames, (names) => prune(names));

const allSelected = computed(
  () =>
    deletableNames.value.length > 0 &&
    selectedCount.value === deletableNames.value.length,
);

// The visible text and the accessible name say the same thing in both states:
// a control that reads "Select all" while clicking it clears the selection is
// a trap for screen-reader and pointer users alike.
const selectAllLabel = computed(() =>
  allSelected.value
    ? t("testBulk.clearSelection")
    : t("testBulk.selectAllText"),
);

function toggleAllSelection() {
  if (allSelected.value) clearSelection();
  else selectAll(deletableNames.value);
}

const bulkDelete = useBulkDeleteTests({
  projectName: toRef(props, "projectName"),
  branchName: toRef(props, "branchName"),
});

const bulkDeleteOpen = ref(false);
const failureOpen = ref(false);
const failureRows = ref<BulkFailureRow[]>([]);

function openBulkDelete() {
  failureRows.value = [];
  bulkDelete.reset();
  bulkDeleteOpen.value = true;
}

function confirmBulkDelete() {
  // Sorted for a stable request payload regardless of the click order.
  const testNames = [...selectedIds.value].sort();
  // The label is captured before the request: the refreshed list no longer
  // carries a test that was deleted, but a failed one still needs its name.
  const labels = new Map(testNames.map((name) => [name, name]));
  bulkDelete.mutate(testNames, {
    onSuccess: (result) => {
      bulkDeleteOpen.value = false;
      clearSelection();
      if (result.failed.length > 0) {
        failureRows.value = bulkFailureRows(result.failed, labels);
        failureOpen.value = true;
      }
    },
  });
}

/* ------------------------- TABLE COLUMNS -------------------------- */

const columns = computed<ColumnDef<AppTableFeatures, VisualTestItem>[]>(() => [
  { accessorKey: "viewport", header: t("tables.viewport") },
  { accessorKey: "browser", header: t("tables.browser") },
  { accessorKey: "environment", header: t("tables.env") },
  {
    accessorKey: "kind",
    header: t("tables.kind"),
    cell: ({ row }) =>
      h(
        "span",
        { class: "text-xs uppercase text-muted-foreground" },
        row.original.kind ?? IMAGE_TEST_KIND,
      ),
  },
  {
    accessorKey: "latestStatus",
    header: t("tables.status"),
    cell: ({ row }) =>
      h("div", { class: "flex items-center gap-2" }, [
        getStatusBadge(row.original.latestStatus),
        isInheritedOrigin(row.original.origin)
          ? inheritedBadge(row.original.inheritedFrom)
          : null,
      ]),
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    cell: ({ row }) =>
      h(RowActionsCell, {
        deleteLabel: t("tables.deleteVariant"),
        overviewLabel: t("tables.variants"),
        testId: TEST_ID.testActionsButton,
        readOnly: isInheritedOrigin(row.original.origin),
        onRequestDelete: () => requestDelete(row.original),
        onRequestOverview: () => navigateToTestOverview(row.original),
      }),
  },
]);
</script>

<template>
  <div class="space-y-8">
    <TestFilterBar
      v-model:filters="filters"
      :viewports="viewports"
      :browsers="browsers"
      :environments="environments"
      @reset="resetFilters"
    />

    <div
      v-if="selectable && deletableNames.length > 0"
      class="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-2 shadow-sm"
      :data-testid="TEST_ID.testBulkBar"
    >
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="h-4 w-4"
          :checked="allSelected"
          :aria-label="selectAllLabel"
          :data-testid="TEST_ID.testBulkSelectAll"
          @change="toggleAllSelection"
        />
        <span>{{ selectAllLabel }}</span>
      </label>
      <span class="text-sm text-muted-foreground">
        {{ t("testBulk.selectedCount", { count: selectedCount }) }}
      </span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        :disabled="selectedCount === 0 || bulkDelete.isPending.value"
        :data-testid="TEST_ID.testBulkDelete"
        @click="openBulkDelete"
      >
        {{ t("testBulk.deleteSelected") }}
      </Button>
    </div>

    <TestAccordionGroups
      :groups="groups"
      :columns="columns"
      :default-accordion-values="defaultAccordionValues"
      :selectable="selectable"
      :selected-names="selectedIds"
      @toggle="toggle"
      @row-click="handleRowClick"
    />

    <ConfirmDialog
      :open="showConfirm"
      :pending="deleting"
      confirmVariant="destructive"
      :title="t('tables.deleteTitle')"
      :confirmText="t('tables.deleteTitle')"
      :cancelText="t('common.cancel')"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
      @update:open="showConfirm = $event"
    >
      <template #description>
        Delete <strong>{{ variantLabel }}</strong
        >?
      </template>
    </ConfirmDialog>

    <ConfirmDialog
      :open="bulkDeleteOpen"
      :pending="bulkDelete.isPending.value"
      confirmVariant="destructive"
      :title="t('testBulk.deleteTitle')"
      :confirmText="t('testBulk.deleteSelected')"
      :cancelText="t('common.cancel')"
      :required-text="projectName"
      :required-text-label="t('testBulk.confirmPrompt', { name: projectName })"
      @confirm="confirmBulkDelete"
      @update:open="bulkDeleteOpen = $event"
    >
      <template #description>
        {{ t("testBulk.deleteBody", { count: selectedCount }) }}
      </template>
    </ConfirmDialog>

    <BulkFailureDialog
      :open="failureOpen"
      :rows="failureRows"
      :title="t('testBulk.failureTitle')"
      :description="t('testBulk.failureBody')"
      @update:open="failureOpen = $event"
    />
  </div>
</template>

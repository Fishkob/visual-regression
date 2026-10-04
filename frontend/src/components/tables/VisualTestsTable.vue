<script setup lang="ts">
import { h, toRef } from "vue";

import TestFilterBar from "@/components/tables/TestFilterBar.vue";
import TestAccordionGroups from "@/components/tables/TestAccordionGroups.vue";
import RowActionsCell from "@/components/tables/RowActionsCell.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";

import type { ColumnDef } from "@tanstack/vue-table";
import type { AppTableFeatures } from "@/components/ui/table/table-features";
import type { VisualTestItem } from "@/domains/projects/project.model";

import { getStatusBadge } from "@/components/StatusBadge";
import { useVisualTestsTable } from "@/composables/useVisualTestsTable";
import { useVisualTestDelete } from "@/composables/useVisualTestDelete";
import { useTestNavigation } from "@/composables/useTestNavigation";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  tests: VisualTestItem[];
  projectName: string;
}>();

const testsRef = toRef(props, "tests");

const {
  filters,
  viewports,
  browsers,
  environments,
  groups,
  defaultAccordionValues,
  resetFilters,
} = useVisualTestsTable({ tests: testsRef });

const {
  showConfirm,
  deleting,
  variantLabel,
  requestDelete,
  confirmDelete,
  cancelDelete,
} = useVisualTestDelete({
  projectName: props.projectName,
});

const { navigateToTest } = useTestNavigation({
  projectName: toRef(props, "projectName"),
});

function handleRowClick(t: VisualTestItem) {
  navigateToTest(t);
}

/* ------------------------- TABLE COLUMNS -------------------------- */

const columns: ColumnDef<AppTableFeatures, VisualTestItem>[] = [
  { accessorKey: "viewport", header: "Viewport" },
  { accessorKey: "browser", header: "Browser" },
  { accessorKey: "environment", header: "Env" },
  {
    accessorKey: "latestStatus",
    header: "Status",
    cell: ({ row }) => getStatusBadge(row.original.latestStatus),
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    cell: ({ row }) =>
      h(RowActionsCell, {
        deleteLabel: "Delete variant",
        testId: TEST_ID.testActionsButton,
        onRequestDelete: () => requestDelete(row.original),
      }),
  },
];
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

    <TestAccordionGroups
      :groups="groups"
      :columns="columns"
      :default-accordion-values="defaultAccordionValues"
      @row-click="handleRowClick"
    />

    <ConfirmDialog
      :open="showConfirm"
      :pending="deleting"
      confirmVariant="destructive"
      title="Delete test"
      confirmText="Delete"
      cancelText="Cancel"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
      @update:open="showConfirm = $event"
    >
      <template #description>
        Delete <strong>{{ variantLabel }}</strong
        >?
      </template>
    </ConfirmDialog>
  </div>
</template>

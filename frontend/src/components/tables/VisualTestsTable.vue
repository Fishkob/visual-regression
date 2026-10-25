<script setup lang="ts">
import { computed, h, toRef } from "vue";
import { useI18n } from "vue-i18n";

import TestFilterBar from "@/components/tables/TestFilterBar.vue";
import TestAccordionGroups from "@/components/tables/TestAccordionGroups.vue";
import RowActionsCell from "@/components/tables/RowActionsCell.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";

import type { ColumnDef } from "@tanstack/vue-table";
import type { AppTableFeatures } from "@/components/ui/table/table-features";
import type { VisualTestItem } from "@/domains/projects/project.model";

import { getStatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { IMAGE_TEST_KIND } from "@/domains/test-kind";
import { useVisualTestsTable } from "@/composables/useVisualTestsTable";
import { useVisualTestDelete } from "@/composables/useVisualTestDelete";
import { useTestNavigation } from "@/composables/useTestNavigation";
import { isInheritedOrigin } from "@/domains/branches/branch-origin";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();

const props = defineProps<{
  tests: VisualTestItem[];
  projectName: string;
  branchName?: string;
  syncUrl?: boolean;
  serverFiltered?: boolean;
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

const { navigateToTestOverview } = useTestNavigation({
  projectName: toRef(props, "projectName"),
  branchName: toRef(props, "branchName"),
});

// A row is "show me this test": the overview lists every variant, and the
// comparison (review) is one click further in. The review loop from the inbox
// still navigates straight to the detail page.
function handleRowClick(t: VisualTestItem) {
  navigateToTestOverview(t);
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
        overviewLabel: t("tables.overview"),
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
  </div>
</template>

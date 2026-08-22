<script setup lang="ts">
import { h } from "vue";
import { useRouter } from "vue-router";

import DataTable from "@/components/ui/table/DataTable.vue";
import RowActionsCell from "@/components/tables/RowActionsCell.vue";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "@lucide/vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { getProjectStatusBadge } from "@/components/StatusBadge";
import { useProjectDelete } from "@/composables/useProjectDelete";

import type { ColumnDef } from "@tanstack/vue-table";
import type { Project } from "@/domains/projects/project.model";

const router = useRouter();

const { projects, loading } = defineProps<{
  projects: Project[];
  loading?: boolean;
}>();

const {
  showConfirm,
  deleting,
  deleteDescription,
  requestDelete,
  confirmDelete,
  cancelDelete,
} = useProjectDelete();

/* Format date */
const formatDate = (date: string | Date | undefined) =>
  !date
    ? "—"
    : new Date(date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

/* Row navigation */
function handleRowClick(project: Project) {
  if (!project?.name) return;

  router.push({
    name: "project-detail",
    params: { projectName: project.name },
  });
}

/* TABLE COLUMNS */
const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "name",
    header: "Project",
    cell: ({ row }) =>
      h("span", { class: "font-medium text-foreground/90" }, row.original.name),
  },
  {
    accessorKey: "pending",
    header: "Status",
    cell: ({ row }) =>
      getProjectStatusBadge(Boolean(row.original.hasPendingTests)),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.createdAt),
  },

  /* ACTIONS COLUMN */
  {
    id: "actions",
    header: "",
    enableSorting: false,
    cell: ({ row }) =>
      h(
        RowActionsCell,
        {
          deleteLabel: "Delete project",
          testId: "project-actions-button",
          onRequestDelete: () => requestDelete(row.original),
        },
        {
          trigger: () =>
            h(
              Button,
              { variant: "ghost", size: "icon", class: "h-7 w-7 p-0" },
              () => h(MoreVertical, { class: "w-4 h-4" }),
            ),
        },
      ),
  },
];
</script>

<template>
  <div class="rounded-xl border bg-card shadow-sm overflow-hidden">
    <DataTable
      :columns="columns"
      :data="projects"
      :loading="loading"
      @rowClick="handleRowClick"
      data-testid="project-table"
    />

    <ConfirmDialog
      v-model:open="showConfirm"
      :pending="deleting"
      confirmVariant="destructive"
      title="Delete project"
      :description="deleteDescription"
      confirmText="Delete"
      cancelText="Cancel"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

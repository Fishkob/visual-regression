<script setup lang="ts">
import { RouterLink } from "vue-router";
import { getStatusCountBadge } from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import RowActionsCell from "@/components/tables/RowActionsCell.vue";
import { useProjectDelete } from "@/composables/useProjectDelete";
import { STATUS } from "@/domains/test-status";
import type { ProjectGroupSection } from "@/domains/projects/group-projects-by-group";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{ section: ProjectGroupSection }>();

const {
  showConfirm,
  deleting,
  deleteDescription,
  requestDelete,
  confirmDelete,
  cancelDelete,
} = useProjectDelete();
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-muted-foreground">
        {{ section.name }}
      </h2>
      <span class="text-xs text-muted-foreground">
        {{ section.items.length }}
        {{ section.items.length === 1 ? "project" : "projects" }}
      </span>
    </div>

    <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div
        v-for="project in section.items"
        :key="project.id"
        class="flex items-center justify-between gap-4 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50"
      >
        <RouterLink
          :to="{
            name: 'project-detail',
            params: { projectName: project.name },
          }"
          class="min-w-0 flex-1"
          :data-testid="TEST_ID.tableRow"
        >
          <p class="truncate font-medium">{{ project.name }}</p>
          <p class="text-xs text-muted-foreground">
            {{ project.testCount ?? 0 }}
            {{ (project.testCount ?? 0) === 1 ? "test" : "tests" }}
          </p>
        </RouterLink>

        <div class="flex items-center gap-2">
          <span
            v-if="(project.pendingCount ?? 0) > 0"
            :aria-label="`${project.pendingCount ?? 0} pending`"
          >
            <component
              :is="
                getStatusCountBadge(
                  STATUS.PENDING_APPROVAL,
                  project.pendingCount ?? 0,
                  { className: 'py-0.5 px-1.5' },
                )
              "
            />
          </span>
          <RowActionsCell
            delete-label="Delete project"
            :test-id="TEST_ID.projectActionsButton"
            @request-delete="requestDelete(project)"
          />
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="showConfirm"
      :pending="deleting"
      confirm-variant="destructive"
      title="Delete project"
      :description="deleteDescription"
      confirm-text="Delete"
      cancel-text="Cancel"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </section>
</template>

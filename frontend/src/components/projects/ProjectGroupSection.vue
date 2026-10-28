<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { getStatusCountBadge } from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import RowActionsCell from "@/components/tables/RowActionsCell.vue";
import { useProjectDelete } from "@/composables/useProjectDelete";
import { STATUS } from "@/domains/test-status";
import type { ProjectGroupSection } from "@/domains/projects/group-projects-by-group";
import { TEST_ID } from "@/lib/test-ids";

const props = withDefaults(
  defineProps<{
    section: ProjectGroupSection;
    // Multi-select is a writer action; a VIEWER gets no checkboxes.
    selectable?: boolean;
    selectedNames?: string[];
  }>(),
  { selectable: false, selectedNames: () => [] },
);

const { t } = useI18n();

const emit = defineEmits<{
  toggle: [projectName: string];
}>();

function isSelected(projectName: string): boolean {
  return props.selectedNames.includes(projectName);
}

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
        {{ t("projects.projectCount", section.items.length) }}
      </span>
    </div>

    <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div
        v-for="project in section.items"
        :key="project.id"
        class="flex items-center justify-between gap-4 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50"
      >
        <input
          v-if="selectable"
          type="checkbox"
          class="h-4 w-4 shrink-0"
          :checked="isSelected(project.name)"
          :aria-label="t('projects.selectProject', { project: project.name })"
          :data-testid="TEST_ID.projectSelectRow"
          @change="emit('toggle', project.name)"
        />
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
            {{ t("projects.testCount", project.testCount ?? 0) }}
          </p>
        </RouterLink>

        <div class="flex items-center gap-2">
          <span
            v-if="(project.pendingCount ?? 0) > 0"
            :aria-label="
              t('projects.pendingAria', { count: project.pendingCount ?? 0 })
            "
            :title="
              t('projects.pendingAria', { count: project.pendingCount ?? 0 })
            "
          >
            <component
              :is="
                getStatusCountBadge(
                  STATUS.PENDING_APPROVAL,
                  project.pendingCount ?? 0,
                  {
                    className: 'py-0.5 px-1.5',
                    label: t('projects.pendingLabel'),
                  },
                )
              "
            />
          </span>
          <RowActionsCell
            :delete-label="t('projects.deleteProject')"
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
      :title="t('projects.deleteTitle')"
      :description="deleteDescription"
      :confirm-text="t('projects.deleteButton')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </section>
</template>

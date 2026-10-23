<script setup lang="ts">
import { computed, ref } from "vue";
import {
  useGroupsQuery,
  useCreateGroup,
  useRenameGroup,
  useDeleteGroup,
} from "@/composables/useGroups";
import { Button } from "@/components/ui/button";
import GroupFormDialog from "@/components/groups/GroupFormDialog.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import AsyncState from "@/components/AsyncState.vue";
import { TEST_ID } from "@/lib/test-ids";
import type { ProjectGroup } from "@/domains/groups/group.model";

const { data: groups, isLoading, error, refetch } = useGroupsQuery();
const createGroup = useCreateGroup();
const renameGroup = useRenameGroup();
const deleteGroup = useDeleteGroup();

const formOpen = ref(false);
const editing = ref<ProjectGroup | null>(null);
const deleteOpen = ref(false);
const pendingDelete = ref<ProjectGroup | null>(null);

const formPending = computed(
  () => createGroup.isPending.value || renameGroup.isPending.value,
);
const formError = computed(() =>
  editing.value ? renameGroup.error.value : createGroup.error.value,
);
const deletePending = computed(() => deleteGroup.isPending.value);

function openCreate() {
  createGroup.reset();
  renameGroup.reset();
  editing.value = null;
  formOpen.value = true;
}
function openRename(group: ProjectGroup) {
  createGroup.reset();
  renameGroup.reset();
  editing.value = group;
  formOpen.value = true;
}
function submit(name: string) {
  if (!name) return;
  const close = { onSuccess: () => (formOpen.value = false) };
  if (editing.value) {
    renameGroup.mutate({ id: editing.value.id, name }, close);
  } else {
    createGroup.mutate({ name }, close);
  }
}
function requestDelete(group: ProjectGroup) {
  pendingDelete.value = group;
  deleteOpen.value = true;
}
function cancelDelete() {
  pendingDelete.value = null;
  deleteOpen.value = false;
}
function onDeleteOpenChange(open: boolean) {
  if (!open) pendingDelete.value = null;
  deleteOpen.value = open;
}
function confirmDelete() {
  if (!pendingDelete.value) return;
  deleteGroup.mutate(pendingDelete.value.id, {
    onSuccess: () => {
      deleteOpen.value = false;
      pendingDelete.value = null;
    },
  });
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight">Groups</h1>
      <Button type="button" :data-testid="TEST_ID.newGroup" @click="openCreate">
        New group
      </Button>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load groups"
      :retry="refetch"
      :empty="(groups ?? []).length === 0"
      empty-title="No groups yet"
      empty-description="Create a group to organize projects."
    >
      <template #loading>
        <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div
            v-for="i in 3"
            :key="i"
            class="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div class="space-y-2">
              <div class="h-4 w-24 animate-pulse rounded bg-muted" />
              <div class="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
            <div class="flex gap-2">
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </template>

      <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          v-for="group in groups"
          :key="group.id"
          class="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          :data-testid="TEST_ID.groupRow"
        >
          <div>
            <p class="font-medium">{{ group.name }}</p>
            <p
              class="text-sm text-muted-foreground"
              :data-testid="TEST_ID.groupProjectCount"
            >
              {{ group.projectCount }}
              {{ group.projectCount === 1 ? "project" : "projects" }}
            </p>
          </div>
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :aria-label="`Rename ${group.name}`"
              @click="openRename(group)"
            >
              Rename
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              :aria-label="`Delete ${group.name}`"
              @click="requestDelete(group)"
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </AsyncState>

    <GroupFormDialog
      v-model:open="formOpen"
      :group="editing"
      :pending="formPending"
      :error="formError"
      @submit="submit"
    />

    <ConfirmDialog
      :open="deleteOpen"
      :pending="deletePending"
      confirm-variant="destructive"
      title="Delete group"
      confirm-text="Delete"
      cancel-text="Cancel"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
      @update:open="onDeleteOpenChange"
    >
      <template #description>
        Projects in this group will move to Unassigned. Projects and tests are
        not deleted.
      </template>
    </ConfirmDialog>
  </div>
</template>

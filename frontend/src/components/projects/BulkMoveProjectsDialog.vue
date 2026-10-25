<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FormDialog from "@/components/FormDialog.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNASSIGNED_GROUP_LABEL } from "@/domains/groups/group-section";
import type { ProjectGroup } from "@/domains/groups/group.model";
import { TEST_ID } from "@/lib/test-ids";

const NO_GROUP = "no-group";

const props = defineProps<{
  open: boolean;
  groups: ProjectGroup[];
  selectedCount: number;
  pending?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: { groupId: string | null }): void;
}>();

const group = ref<string>(NO_GROUP);

watch(
  () => props.open,
  (open) => {
    if (open) group.value = NO_GROUP;
  },
);

const description = computed(
  () =>
    `Move ${props.selectedCount} selected ${
      props.selectedCount === 1 ? "project" : "projects"
    } to the chosen group. The projects keep their tests and pending reviews.`,
);

function submit() {
  emit("submit", {
    groupId: group.value === NO_GROUP ? null : group.value,
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    title="Move projects to a group"
    :description="description"
    confirm-text="Move projects"
    :pending="pending"
    :confirm-test-id="TEST_ID.projectBulkMoveConfirm"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>Group</span>
      <Select v-model="group">
        <SelectTrigger :data-testid="TEST_ID.projectBulkMoveGroup">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="NO_GROUP">{{
            UNASSIGNED_GROUP_LABEL
          }}</SelectItem>
          <SelectItem
            v-for="option in groups"
            :key="option.id"
            :value="option.id"
          >
            {{ option.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
  </FormDialog>
</template>

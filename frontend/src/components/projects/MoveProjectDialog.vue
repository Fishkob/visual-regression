<script setup lang="ts">
import { ref, watch } from "vue";
import FormDialog from "@/components/FormDialog.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { ProjectGroup } from "@/domains/groups/group.model";

const props = defineProps<{
  open: boolean;
  groups: ProjectGroup[];
  currentGroupId?: string | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", groupId: string | null): void;
}>();

const selection = ref("none");

watch(
  [() => props.open, () => props.currentGroupId],
  () => {
    selection.value = props.currentGroupId ?? "none";
  },
  { immediate: true },
);

function submit() {
  emit("submit", selection.value === "none" ? null : selection.value);
}
</script>

<template>
  <FormDialog
    :open="open"
    title="Move project"
    description="Choose the group this project belongs to."
    :pending="pending"
    :confirm-test-id="TEST_ID.moveProjectSubmit"
    confirm-text="Move"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>Group</span>
      <Select v-model="selection">
        <SelectTrigger :data-testid="TEST_ID.moveProjectSelect">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, "Could not move project") }}
    </p>
  </FormDialog>
</template>

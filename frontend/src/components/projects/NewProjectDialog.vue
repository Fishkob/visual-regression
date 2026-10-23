<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FormDialog from "@/components/FormDialog.vue";
import { useCreateGroup } from "@/composables/useGroups";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { ProjectGroup } from "@/domains/groups/group.model";

const props = defineProps<{
  open: boolean;
  groups: ProjectGroup[];
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: { name: string; groupId?: string }): void;
}>();

const createGroup = useCreateGroup();
const name = ref("");
const groupId = ref("none");
const newGroupName = ref("");
const invalid = computed(() => !name.value.trim());
const newGroupInvalid = computed(() => !newGroupName.value.trim());
const createGroupPending = computed(() => createGroup.isPending.value);
const createGroupError = computed(() => createGroup.error.value);

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = "";
      groupId.value = "none";
      newGroupName.value = "";
      createGroup.reset();
    }
  },
);

function submit() {
  if (invalid.value) return;
  emit("submit", {
    name: name.value.trim(),
    ...(groupId.value === "none" ? {} : { groupId: groupId.value }),
  });
}

function addGroup() {
  if (newGroupInvalid.value) return;
  createGroup.mutate(
    { name: newGroupName.value.trim() },
    {
      onSuccess: (group) => {
        newGroupName.value = "";
        if (group?.id) groupId.value = group.id;
      },
    },
  );
}
</script>

<template>
  <FormDialog
    :open="open"
    title="New project"
    description="Projects are usually created by the first CI upload. You can also create one manually."
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.projectFormSubmit"
    confirm-text="Create"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>Name</span>
      <Input
        v-model="name"
        :data-testid="TEST_ID.projectNameInput"
        :aria-invalid="invalid || undefined"
      />
    </label>
    <p v-if="invalid" class="text-sm text-muted-foreground" role="alert">
      Project name is required.
    </p>
    <label class="block space-y-1 text-sm">
      <span>Group</span>
      <Select v-model="groupId">
        <SelectTrigger :data-testid="TEST_ID.projectGroupSelect">
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
    <div class="flex items-end gap-2">
      <Input
        v-model="newGroupName"
        placeholder="New group name"
        aria-label="New group name"
        :data-testid="TEST_ID.projectNewGroupName"
      />
      <Button
        type="button"
        :disabled="newGroupInvalid || createGroupPending"
        :data-testid="TEST_ID.projectAddGroup"
        @click="addGroup"
      >
        Add
      </Button>
    </div>
    <p v-if="createGroupError" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(createGroupError, "Could not create group") }}
    </p>
    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, "Could not create project") }}
    </p>
  </FormDialog>
</template>

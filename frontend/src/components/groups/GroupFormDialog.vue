<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Input } from "@/components/ui/input";
import FormDialog from "@/components/FormDialog.vue";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { ProjectGroup } from "@/domains/groups/group.model";

const props = defineProps<{
  open: boolean;
  group?: ProjectGroup | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", name: string): void;
}>();

const name = ref("");
const invalid = computed(() => !name.value.trim());

watch(
  () => [props.open, props.group?.name],
  () => {
    name.value = props.group?.name ?? "";
  },
  { immediate: true },
);
</script>

<template>
  <FormDialog
    :open="open"
    :title="group ? 'Rename group' : 'New group'"
    :description="
      group
        ? 'Update the display name.'
        : 'Groups organize projects. They do not restrict access.'
    "
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.groupFormSubmit"
    @update:open="emit('update:open', $event)"
    @submit="emit('submit', name.trim())"
  >
    <label class="block space-y-1 text-sm">
      <span>Name</span>
      <Input
        v-model="name"
        :aria-invalid="invalid"
        :data-testid="TEST_ID.groupNameInput"
      />
    </label>
    <p v-if="invalid" class="text-sm text-muted-foreground" role="alert">
      Name is required
    </p>
    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, "Could not save group") }}
    </p>
  </FormDialog>
</template>

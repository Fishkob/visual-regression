<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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

const { t } = useI18n();
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
    :title="t('newProject.title')"
    :description="t('newProject.description')"
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.projectFormSubmit"
    :confirm-text="t('newProject.create')"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>{{ t("newProject.name") }}</span>
      <Input
        v-model="name"
        :data-testid="TEST_ID.projectNameInput"
        :aria-invalid="invalid || undefined"
      />
    </label>
    <p v-if="invalid" class="text-sm text-muted-foreground" role="alert">
      {{ t("newProject.nameRequired") }}
    </p>
    <label class="block space-y-1 text-sm">
      <span>{{ t("newProject.group") }}</span>
      <Select v-model="groupId">
        <SelectTrigger :data-testid="TEST_ID.projectGroupSelect">
          <SelectValue :placeholder="t('newProject.unassigned')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{{ t("newProject.unassigned") }}</SelectItem>
          <SelectItem v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
    <div class="flex items-end gap-2">
      <Input
        v-model="newGroupName"
        :placeholder="t('newProject.newGroupName')"
        :aria-label="t('newProject.newGroupName')"
        :data-testid="TEST_ID.projectNewGroupName"
      />
      <Button
        type="button"
        :disabled="newGroupInvalid || createGroupPending"
        :data-testid="TEST_ID.projectAddGroup"
        @click="addGroup"
      >
        {{ t("newProject.add") }}
      </Button>
    </div>
    <p v-if="createGroupError" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(createGroupError, t("newProject.createGroupError")) }}
    </p>
    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, t("newProject.createError")) }}
    </p>
  </FormDialog>
</template>

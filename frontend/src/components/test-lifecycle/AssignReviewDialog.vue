<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import { useCreateAssignment } from "@/composables/useAssignments";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  projectName: string;
  testName: string;
  branch?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { t } = useI18n();
const create = useCreateAssignment(props.projectName);
const assignee = ref("");
const dueAt = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    assignee.value = "";
    dueAt.value = "";
    create.reset();
  },
);

const dueInvalid = computed(() => {
  if (!dueAt.value) return false;
  return Number.isNaN(new Date(`${dueAt.value}T23:59:59`).getTime());
});
const invalid = computed(() => !assignee.value.trim() || dueInvalid.value);

function submit() {
  if (invalid.value) return;
  create.mutate(
    {
      testName: props.testName,
      ...(props.branch ? { branch: props.branch } : {}),
      assignee: assignee.value.trim(),
      ...(dueAt.value
        ? { dueAt: new Date(`${dueAt.value}T23:59:59`).toISOString() }
        : {}),
    },
    {
      onSuccess: () => {
        emit("update:open", false);
      },
    },
  );
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('assign.title')"
    :description="t('assign.description')"
    :confirm-text="t('assign.save')"
    :pending="create.isPending.value"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.assignSave"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div :data-testid="TEST_ID.assignDialog" class="space-y-3">
      <label class="block space-y-1 text-sm">
        <span>{{ t("assign.assignee") }}</span>
        <Input
          v-model="assignee"
          autocomplete="off"
          :aria-invalid="!assignee.trim()"
          :data-testid="TEST_ID.assignAssignee"
        />
      </label>
      <p v-if="!assignee.trim()" class="text-sm text-muted-foreground">
        {{ t("assign.required") }}
      </p>

      <label class="block space-y-1 text-sm">
        <span>{{ t("assign.dueAt") }}</span>
        <Input
          v-model="dueAt"
          type="date"
          :aria-invalid="dueInvalid"
          :data-testid="TEST_ID.assignDueAt"
        />
      </label>
      <p v-if="dueInvalid" class="text-sm text-destructive" role="alert">
        {{ t("assign.invalidDue") }}
      </p>

      <p
        v-if="create.error.value"
        class="text-sm text-destructive"
        role="alert"
      >
        {{ sdkErrorMessage(create.error.value, t("assign.createError")) }}
      </p>
    </div>
  </FormDialog>
</template>

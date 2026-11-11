<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import { useRenameProject } from "@/composables/useProjectRename";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  projectName: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "renamed", name: string): void;
}>();

const { t } = useI18n();
const rename = useRenameProject(props.projectName);
const name = ref(props.projectName);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.projectName;
    rename.reset();
  },
);

// The dialog decides only whether the submit can change anything. Whether a
// name is *allowed* belongs to the server, which answers with the exact reason
// (charset, reserved word, duplicate) and renders it below the input.
const trimmed = computed(() => name.value.trim());
const empty = computed(() => trimmed.value.length === 0);
const touched = computed(() => name.value !== props.projectName);
const disabled = computed(
  () => empty.value || trimmed.value === props.projectName,
);
const hint = computed(() => {
  if (empty.value) return t("renameProject.nameRequired");
  // The input opens with the current name; only a deliberate re-entry (extra
  // spaces, the same name typed again) is worth a hint.
  if (touched.value && trimmed.value === props.projectName) {
    return t("renameProject.unchanged");
  }
  return "";
});

function submit() {
  if (disabled.value) return;
  rename.mutate(trimmed.value, {
    onSuccess: (project) => {
      // The server's name is the route param afterwards: it trims, and a rule
      // change must not be masked by echoing what was typed.
      emit("renamed", project?.name || trimmed.value);
      emit("update:open", false);
    },
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('renameProject.title')"
    :description="t('renameProject.description')"
    :confirm-text="t('renameProject.action')"
    :pending="rename.isPending.value"
    :submit-disabled="disabled"
    :confirm-test-id="TEST_ID.projectRenameSave"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div :data-testid="TEST_ID.projectRenameDialog" class="space-y-2">
      <label class="block space-y-1 text-sm">
        <span>{{ t("renameProject.name") }}</span>
        <Input
          v-model="name"
          maxlength="100"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :aria-invalid="empty || undefined"
          :data-testid="TEST_ID.projectRenameInput"
        />
      </label>
      <p class="text-xs text-muted-foreground">
        {{ t("renameProject.help") }}
      </p>
      <p v-if="hint" class="text-sm text-muted-foreground" role="alert">
        {{ hint }}
      </p>
      <p
        v-if="rename.error.value"
        class="text-sm text-destructive"
        role="alert"
      >
        {{ sdkErrorMessage(rename.error.value, t("renameProject.saveError")) }}
      </p>
    </div>
  </FormDialog>
</template>

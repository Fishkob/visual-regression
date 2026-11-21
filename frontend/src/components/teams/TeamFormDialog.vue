<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Input } from "@/components/ui/input";
import FormDialog from "@/components/FormDialog.vue";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { Team } from "@/domains/teams/team.model";

// Mirrors the backend rule (CreateTeamDto): letters, digits, space, dash and
// underscore, at most 80 characters.
const NAME_MAX_LENGTH = 80;
const NAME_PATTERN = /^[\p{L}\p{N} _-]+$/u;

const props = defineProps<{
  open: boolean;
  team?: Team | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", name: string): void;
}>();

const { t } = useI18n();
const name = ref("");

watch(
  () => [props.open, props.team?.name],
  () => {
    name.value = props.team?.name ?? "";
  },
  { immediate: true },
);

const trimmed = computed(() => name.value.trim());
const empty = computed(() => trimmed.value.length === 0);
const tooLong = computed(() => trimmed.value.length > NAME_MAX_LENGTH);
const charsetInvalid = computed(
  () => !empty.value && !NAME_PATTERN.test(trimmed.value),
);
const invalid = computed(
  () => empty.value || tooLong.value || charsetInvalid.value,
);
const hint = computed(() => {
  if (empty.value) return t("teamForm.nameRequired");
  if (tooLong.value || charsetInvalid.value) return t("teamForm.nameCharset");
  return "";
});

function submit() {
  if (invalid.value) return;
  emit("submit", trimmed.value);
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="team ? t('teamForm.renameTitle') : t('teamForm.newTitle')"
    :description="
      team ? t('teamForm.renameDescription') : t('teamForm.newDescription')
    "
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.teamFormSubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div class="space-y-2">
      <label class="block space-y-1 text-sm">
        <span>{{ t("teamForm.name") }}</span>
        <Input
          v-model="name"
          :maxlength="NAME_MAX_LENGTH"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :aria-invalid="invalid || undefined"
          :data-testid="TEST_ID.teamNameInput"
        />
      </label>
      <p class="text-xs text-muted-foreground">{{ t("teamForm.nameHelp") }}</p>
      <p v-if="invalid" class="text-sm text-muted-foreground" role="alert">
        {{ hint }}
      </p>
      <p v-if="error" class="text-sm text-destructive" role="alert">
        {{ sdkErrorMessage(error, t("teamForm.errorFallback")) }}
      </p>
    </div>
  </FormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import { useUpdateProjectThreshold } from "@/composables/useProjectThresholdSettings";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  projectName: string;
  pixelDiffThreshold: number | null;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { t } = useI18n();
const update = useUpdateProjectThreshold(props.projectName);
// The empty string is the "no project default" state, not zero: a project
// default of 0 and no default both mean "tolerate nothing", but the read
// distinguishes them and the dialog should round-trip what the API returned.
const value = ref(
  props.pixelDiffThreshold === null ? "" : String(props.pixelDiffThreshold),
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    value.value =
      props.pixelDiffThreshold === null ? "" : String(props.pixelDiffThreshold);
    update.reset();
  },
);

const trimmed = computed(() => value.value.trim());
const parsed = computed(() =>
  trimmed.value === "" ? null : Number(trimmed.value),
);
const invalid = computed(
  () =>
    parsed.value !== null &&
    (!Number.isInteger(parsed.value) || parsed.value < 0),
);

function submit() {
  if (invalid.value) return;
  update.mutate(parsed.value, {
    onSuccess: () => {
      emit("update:open", false);
    },
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('thresholdSettings.title')"
    :description="t('thresholdSettings.description')"
    :confirm-text="t('common.save')"
    :pending="update.isPending.value"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.projectThresholdSave"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div :data-testid="TEST_ID.thresholdSettingsDialog" class="space-y-2">
      <label class="block space-y-1 text-sm">
        <span>{{ t("thresholdSettings.label") }}</span>
        <Input
          v-model="value"
          type="number"
          min="0"
          step="1"
          placeholder="—"
          :aria-invalid="invalid"
          :data-testid="TEST_ID.projectThresholdInput"
        />
      </label>
      <p class="text-xs text-muted-foreground">
        {{ t("thresholdSettings.help") }}
      </p>
      <p class="text-xs text-muted-foreground">
        {{ t("thresholdSettings.futureOnly") }}
      </p>
      <p v-if="invalid" class="text-sm text-destructive" role="alert">
        {{ t("thresholdSettings.invalid") }}
      </p>
      <p
        v-if="update.error.value"
        class="text-sm text-destructive"
        role="alert"
      >
        {{
          sdkErrorMessage(update.error.value, t("thresholdSettings.saveError"))
        }}
      </p>
    </div>
  </FormDialog>
</template>

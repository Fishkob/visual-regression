<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import { useUpdateProjectReviewSettings } from "@/composables/useProjectReviewSettings";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  projectName: string;
  requiredApprovals: number;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { t } = useI18n();
const update = useUpdateProjectReviewSettings(props.projectName);
const value = ref(String(props.requiredApprovals));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    value.value = String(props.requiredApprovals);
    update.reset();
  },
);

const parsed = computed(() => Number(value.value));
const invalid = computed(
  () =>
    !Number.isInteger(parsed.value) || parsed.value < 1 || parsed.value > 10,
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
    :title="t('reviewSettings.title')"
    :description="t('reviewSettings.description')"
    :confirm-text="t('common.save')"
    :pending="update.isPending.value"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.reviewSettingsSave"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div :data-testid="TEST_ID.reviewSettingsDialog" class="space-y-2">
      <label class="block space-y-1 text-sm">
        <span>{{ t("reviewSettings.requiredLabel") }}</span>
        <Input
          v-model="value"
          type="number"
          min="1"
          max="10"
          step="1"
          :aria-invalid="invalid"
          :data-testid="TEST_ID.reviewRequiredApprovals"
        />
      </label>
      <p class="text-xs text-muted-foreground">
        {{ t("reviewSettings.help") }}
      </p>
      <p v-if="invalid" class="text-sm text-destructive" role="alert">
        {{ t("reviewSettings.invalid") }}
      </p>
      <p
        v-if="update.error.value"
        class="text-sm text-destructive"
        role="alert"
      >
        {{ sdkErrorMessage(update.error.value, t("reviewSettings.saveError")) }}
      </p>
    </div>
  </FormDialog>
</template>

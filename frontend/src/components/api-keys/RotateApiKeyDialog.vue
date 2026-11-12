<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import { API_KEY_GRACE_MAX_MINUTES } from "@/domains/api-keys/api-key.model";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  keyName?: string;
  pending?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: { graceMinutes: number }): void;
}>();

const { t } = useI18n();

// An hour covers the common "swap the CI secret on the next run" case without
// making the old key live for a whole day. The field stays editable so both
// ends are reachable: 0 kills it at once, 1440 (the DTO's maximum) buys a day.
const DEFAULT_GRACE_MINUTES = 60;
const grace = ref(String(DEFAULT_GRACE_MINUTES));

watch(
  () => props.open,
  (open) => {
    if (open) grace.value = String(DEFAULT_GRACE_MINUTES);
  },
);

// An empty or fractional field must not silently become 0, which would stop
// the predecessor at once — the opposite of what a grace period is for.
// Vue casts a number input's v-model to a number, so the raw value is read
// through String() before the digits-only check.
const invalid = computed(() => {
  const raw = String(grace.value).trim();
  return !/^\d+$/.test(raw) || Number(raw) > API_KEY_GRACE_MAX_MINUTES;
});

function submit() {
  if (invalid.value) return;
  emit("submit", { graceMinutes: Number(String(grace.value).trim()) });
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('apiKeys.rotateTitle')"
    :description="t('apiKeys.rotateDescription', { name: keyName ?? '' })"
    :confirm-text="t('apiKeys.rotateSubmit')"
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.rotateApiKeySubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>{{ t("apiKeys.rotateGrace") }}</span>
      <Input
        v-model="grace"
        type="number"
        min="0"
        :max="API_KEY_GRACE_MAX_MINUTES"
        inputmode="numeric"
        :aria-invalid="invalid"
        :data-testid="TEST_ID.rotateApiKeyGrace"
      />
      <span class="block text-xs text-muted-foreground">
        {{ t("apiKeys.rotateGraceHint") }}
      </span>
    </label>

    <p v-if="invalid" class="text-sm text-destructive" role="alert">
      {{ t("apiKeys.rotateInvalid", { max: API_KEY_GRACE_MAX_MINUTES }) }}
    </p>
  </FormDialog>
</template>

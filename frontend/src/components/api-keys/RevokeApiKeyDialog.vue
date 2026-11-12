<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import { API_KEY_REVOKE_REASON_MAX_LENGTH } from "@/domains/api-keys/api-key.model";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  keyName?: string;
  pending?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: { reason?: string }): void;
}>();

const { t } = useI18n();

const reason = ref("");
const trimmedReason = computed(() => reason.value.trim());

watch(
  () => props.open,
  (open) => {
    if (open) reason.value = "";
  },
);

function submit() {
  emit("submit", trimmedReason.value ? { reason: trimmedReason.value } : {});
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('apiKeys.revokeTitle')"
    :description="t('apiKeys.revokeDescription', { name: keyName ?? '' })"
    :confirm-text="t('apiKeys.revokeSubmit')"
    confirm-variant="destructive"
    :pending="pending"
    :confirm-test-id="TEST_ID.revokeApiKeySubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>{{ t("apiKeys.revokeReason") }}</span>
      <Input
        v-model="reason"
        :maxlength="API_KEY_REVOKE_REASON_MAX_LENGTH"
        :data-testid="TEST_ID.revokeApiKeyReason"
      />
      <span class="block text-xs text-muted-foreground">
        {{ t("apiKeys.revokeReasonHint") }}
      </span>
    </label>
  </FormDialog>
</template>

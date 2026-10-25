<script setup lang="ts">
import { ref, watch } from "vue";
import { Input } from "@/components/ui/input";
import FormDialog from "@/components/FormDialog.vue";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { ApiKey } from "@/domains/api-keys/api-key.model";

const props = defineProps<{
  open: boolean;
  apiKey?: ApiKey | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", reason: string | undefined): void;
}>();

const reason = ref("");

watch(
  () => props.open,
  (open) => {
    if (open) reason.value = "";
  },
);

function submit() {
  const trimmed = reason.value.trim();
  emit("submit", trimmed ? trimmed : undefined);
}
</script>

<template>
  <FormDialog
    :open="open"
    title="Revoke API key"
    :description="
      apiKey?.keyHint
        ? `…${apiKey.keyHint} stops authenticating immediately. The key stays listed for the audit trail.`
        : 'The key stops authenticating immediately and stays listed for the audit trail.'
    "
    confirm-text="Revoke"
    :pending="pending"
    :confirm-test-id="TEST_ID.revokeApiKeySubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>Reason (optional)</span>
      <Input
        v-model="reason"
        placeholder="pipeline migrated to new key"
        :data-testid="TEST_ID.revokeApiKeyReason"
      />
    </label>

    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, "Could not revoke API key") }}
    </p>
  </FormDialog>
</template>

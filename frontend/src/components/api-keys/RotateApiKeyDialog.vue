<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FormDialog from "@/components/FormDialog.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  (
    e: "submit",
    payload: { graceMinutes: number; expiresInDays?: number | null },
  ): void;
}>();

const GRACE_OPTIONS = [
  { value: "0", label: "Immediately" },
  { value: "30", label: "After 30 minutes" },
  { value: "60", label: "After 1 hour" },
  { value: "1440", label: "After 24 hours" },
];

const EXPIRY_OPTIONS = [
  { value: "inherit", label: "Like the current key" },
  { value: "never", label: "Never" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

const grace = ref("0");
const expiry = ref("inherit");

const graceMinutes = computed(() => Number(grace.value));
const inheritsExpiry = computed(() => expiry.value === "inherit");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    grace.value = "0";
    expiry.value = "inherit";
  },
);

const expiryHint = computed(() => {
  if (inheritsExpiry.value) {
    return props.apiKey?.expiresAt
      ? "The new key inherits what is left of the current key's lifetime."
      : "The current key does not expire, so neither does the new one.";
  }
  if (expiry.value === "never") return "The new key never expires.";
  return `The new key expires in ${expiry.value} days.`;
});

function submit() {
  emit("submit", {
    graceMinutes: graceMinutes.value,
    // Omitted means "inherit" on the server; only an explicit null turns the
    // expiry off, so the two must not be collapsed here.
    ...(inheritsExpiry.value
      ? {}
      : {
          expiresInDays: expiry.value === "never" ? null : Number(expiry.value),
        }),
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    title="Rotate API key"
    :description="
      apiKey?.keyHint
        ? `A new key replaces …${apiKey.keyHint}. The new key is shown once.`
        : 'A new key replaces the current one. The new key is shown once.'
    "
    confirm-text="Rotate"
    :pending="pending"
    :confirm-test-id="TEST_ID.rotateApiKeySubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>Keep the old key working</span>
      <Select v-model="grace">
        <SelectTrigger :data-testid="TEST_ID.rotateApiKeyGrace">
          <SelectValue placeholder="Immediately" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in GRACE_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>

    <p class="text-sm text-muted-foreground">
      {{
        graceMinutes > 0
          ? "Update the CI secret before the grace window ends — the old key stops working afterwards."
          : "The old key stops working as soon as you rotate."
      }}
    </p>

    <label class="block space-y-1 text-sm">
      <span>Expires</span>
      <Select v-model="expiry">
        <SelectTrigger :data-testid="TEST_ID.rotateApiKeyExpiry">
          <SelectValue placeholder="Like the current key" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in EXPIRY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <span class="block text-muted-foreground">{{ expiryHint }}</span>
    </label>

    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, "Could not rotate API key") }}
    </p>
  </FormDialog>
</template>

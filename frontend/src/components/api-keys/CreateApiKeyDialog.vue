<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Input } from "@/components/ui/input";
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

const props = defineProps<{
  open: boolean;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: { name: string; expiresInDays?: number }): void;
}>();

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

const name = ref("");
const expiry = ref("never");

const invalid = computed(() => !name.value.trim());

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = "";
    expiry.value = "never";
  },
);

function submit() {
  if (invalid.value) return;
  emit("submit", {
    name: name.value.trim(),
    ...(expiry.value === "never"
      ? {}
      : { expiresInDays: Number(expiry.value) }),
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    title="New API key"
    description="The key is shown once. Store it in your CI secret store right away."
    confirm-text="Create"
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.createApiKeySubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>Name</span>
      <Input
        v-model="name"
        placeholder="ci-upload"
        :aria-invalid="invalid"
        :data-testid="TEST_ID.createApiKeyName"
      />
    </label>

    <label class="block space-y-1 text-sm">
      <span>Expires</span>
      <Select v-model="expiry">
        <SelectTrigger :data-testid="TEST_ID.createApiKeyExpiry">
          <SelectValue placeholder="Never" />
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
    </label>

    <p v-if="invalid" class="text-sm text-muted-foreground" role="alert">
      Name is required
    </p>
    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, "Could not create API key") }}
    </p>
  </FormDialog>
</template>

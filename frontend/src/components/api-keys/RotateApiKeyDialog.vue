<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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

const { t } = useI18n();
const GRACE_OPTIONS = [
  { value: "0", labelKey: "apiKeyRotate.immediately" },
  { value: "30", labelKey: "apiKeyRotate.after30" },
  { value: "60", labelKey: "apiKeyRotate.after60" },
  { value: "1440", labelKey: "apiKeyRotate.after1440" },
];

const EXPIRY_OPTIONS = [
  { value: "inherit", labelKey: "apiKeyRotate.inherit" },
  { value: "never", labelKey: "apiKeyRotate.never" },
  { value: "30", labelKey: "apiKeyRotate.days30" },
  { value: "90", labelKey: "apiKeyRotate.days90" },
  { value: "365", labelKey: "apiKeyRotate.year" },
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
      ? t("apiKeyRotate.inheritHintExpiring")
      : t("apiKeyRotate.inheritHintNoExpiry");
  }
  if (expiry.value === "never") return t("apiKeyRotate.neverHint");
  return t("apiKeyRotate.expiresHint", { days: expiry.value });
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
    :title="t('apiKeyRotate.title')"
    :description="
      apiKey?.keyHint
        ? t('apiKeyRotate.descriptionHint', { hint: apiKey.keyHint })
        : t('apiKeyRotate.description')
    "
    :confirm-text="t('apiKeyRotate.confirm')"
    :pending="pending"
    :confirm-test-id="TEST_ID.rotateApiKeySubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>{{ t("apiKeyRotate.grace") }}</span>
      <Select v-model="grace">
        <SelectTrigger :data-testid="TEST_ID.rotateApiKeyGrace">
          <SelectValue :placeholder="t('apiKeyRotate.immediately')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in GRACE_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ t(option.labelKey) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>

    <p class="text-sm text-muted-foreground">
      {{ t("apiKeyRotate.inheritHelp") }}
    </p>

    <p class="text-sm text-muted-foreground">
      {{
        graceMinutes > 0
          ? t("apiKeyRotate.graceWarning")
          : t("apiKeyRotate.immediateWarning")
      }}
    </p>

    <label class="block space-y-1 text-sm">
      <span>{{ t("apiKeyRotate.expires") }}</span>
      <Select v-model="expiry">
        <SelectTrigger :data-testid="TEST_ID.rotateApiKeyExpiry">
          <SelectValue :placeholder="t('apiKeyRotate.inherit')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in EXPIRY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ t(option.labelKey) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <span class="block text-muted-foreground">{{ expiryHint }}</span>
    </label>

    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, t("apiKeyRotate.error")) }}
    </p>
  </FormDialog>
</template>

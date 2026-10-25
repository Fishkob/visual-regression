<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABEL,
  WEBHOOK_FORMATS,
  WEBHOOK_FORMAT_LABEL,
  type CreateWebhookInput,
  type WebhookEndpoint,
  type WebhookEvent,
} from "@/domains/webhooks/webhook.model";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  /** The endpoint being edited; absent means "create". */
  endpoint?: WebhookEndpoint | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: CreateWebhookInput): void;
}>();

const url = ref("");
const events = ref<WebhookEvent[]>([]);
// Kept as a plain string for the Select's model; submit narrows it to the two
// formats the API accepts.
const format = ref("json");
const secret = ref("");
const submitted = ref(false);

const isEdit = computed(() => Boolean(props.endpoint));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const endpoint = props.endpoint;
    url.value = endpoint?.url ?? "";
    events.value = endpoint
      ? endpoint.events.filter(isWebhookEvent)
      : [...WEBHOOK_EVENTS];
    format.value = endpoint?.format ?? "json";
    secret.value = "";
    submitted.value = false;
  },
);

function isWebhookEvent(event: string): event is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(event);
}

const urlMissing = computed(() => !url.value.trim());
const eventsMissing = computed(() => events.value.length === 0);
const invalid = computed(() => urlMissing.value || eventsMissing.value);
const showValidation = computed(() => submitted.value && invalid.value);

function submit() {
  submitted.value = true;
  if (invalid.value) return;
  emit("submit", {
    url: url.value.trim(),
    events: [...events.value],
    format: format.value === "slack" ? "slack" : "json",
    ...(secret.value.trim() ? { secret: secret.value.trim() } : {}),
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="isEdit ? 'Edit webhook endpoint' : 'Add webhook endpoint'"
    :description="
      isEdit
        ? 'Change where this project delivers review and approval events. Leave the secret blank to keep the current one.'
        : 'Deliveries are signed, retried five times and at-least-once. Only review and approval events are available.'
    "
    :confirm-text="isEdit ? 'Save' : 'Create endpoint'"
    :pending="pending"
    :confirm-test-id="TEST_ID.webhookSubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>Endpoint URL</span>
      <Input
        v-model="url"
        type="url"
        required
        placeholder="https://hooks.example.com/visual-regression"
        autocomplete="off"
        :aria-invalid="showValidation && urlMissing"
        :data-testid="TEST_ID.webhookUrlInput"
      />
    </label>
    <p
      v-if="showValidation && urlMissing"
      class="text-sm text-destructive"
      role="alert"
    >
      URL is required
    </p>

    <fieldset class="space-y-2">
      <legend class="text-sm">Events</legend>
      <label
        v-for="event in WEBHOOK_EVENTS"
        :key="event"
        class="flex items-center gap-2 text-sm"
      >
        <input
          v-model="events"
          type="checkbox"
          :value="event"
          class="h-4 w-4 rounded border-input accent-primary"
          :data-testid="TEST_ID.webhookEventCheckbox"
        />
        <span>{{ WEBHOOK_EVENT_LABEL[event] }}</span>
      </label>
      <p
        v-if="showValidation && eventsMissing"
        class="text-sm text-destructive"
        role="alert"
      >
        Select at least one event
      </p>
    </fieldset>

    <label class="block space-y-1 text-sm">
      <span>Format</span>
      <Select v-model="format">
        <SelectTrigger :data-testid="TEST_ID.webhookFormatSelect">
          <SelectValue placeholder="JSON" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in WEBHOOK_FORMATS"
            :key="option"
            :value="option"
          >
            {{ WEBHOOK_FORMAT_LABEL[option] }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>

    <label class="block space-y-1 text-sm">
      <span>
        {{
          isEdit
            ? "Rotate signing secret (leave blank to keep)"
            : "Signing secret (leave blank to generate one)"
        }}
      </span>
      <Input
        v-model="secret"
        type="password"
        autocomplete="new-password"
        :data-testid="TEST_ID.webhookSecretInput"
      />
    </label>
    <p class="text-xs text-muted-foreground">
      The secret signs every request; it is shown once and cannot be read back.
      A custom secret must be at least 16 characters.
    </p>

    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{
        sdkErrorMessage(
          error,
          isEdit
            ? "Could not update webhook endpoint"
            : "Could not create webhook endpoint",
        )
      }}
    </p>
  </FormDialog>
</template>

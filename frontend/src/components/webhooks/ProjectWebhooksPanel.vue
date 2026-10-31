<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Plus } from "@lucide/vue";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import WebhookDeliveriesPanel from "@/components/webhooks/WebhookDeliveriesPanel.vue";
import WebhookEndpointDialog from "@/components/webhooks/WebhookEndpointDialog.vue";
import RevealWebhookSecretDialog from "@/components/webhooks/RevealWebhookSecretDialog.vue";
import { useWebhookMutations, useWebhooks } from "@/composables/useWebhooks";
import {
  WEBHOOK_FORMAT_LABEL,
  type CreateWebhookInput,
  type WebhookEndpoint,
} from "@/domains/webhooks/webhook.model";
import { webhookEventLabelI18n } from "@/domains/webhooks/webhook.labels";
import { webhookSecretOf } from "@/domains/webhooks/webhook.mapper";
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{ projectName: string }>();

const { t } = useI18n();

// Read through a ref, not a snapshot: the routed stories push their initial
// route during render, so the prop can arrive one tick after setup.
const projectName = computed(() => props.projectName);

const { data, isLoading, error, refetch } = useWebhooks(projectName);
const { create, update, remove, test } = useWebhookMutations(projectName);

const endpoints = computed(() => data.value ?? []);

// The delivery log is per endpoint and only fetched once expanded, so the
// expanded set (not a single id) is what the panel tracks: several endpoints can
// be inspected at once without refetching the others.
const expandedIds = ref<string[]>([]);

function isExpanded(endpointId: string): boolean {
  return expandedIds.value.includes(endpointId);
}

function toggleDeliveries(endpointId: string) {
  expandedIds.value = isExpanded(endpointId)
    ? expandedIds.value.filter((id) => id !== endpointId)
    : [...expandedIds.value, endpointId];
}

const formOpen = ref(false);
const editTarget = ref<WebhookEndpoint | null>(null);
const formPending = computed(() =>
  editTarget.value ? update.isPending.value : create.isPending.value,
);
const formError = computed(() =>
  editTarget.value ? update.error.value : create.error.value,
);

const revealOpen = ref(false);
const revealUrl = ref("");
const revealSecret = ref("");

function showSecret(url: string, secret: string) {
  revealUrl.value = url;
  revealSecret.value = secret;
  revealOpen.value = true;
}

function openCreate() {
  create.reset();
  update.reset();
  editTarget.value = null;
  formOpen.value = true;
}

function openEdit(endpoint: WebhookEndpoint) {
  create.reset();
  update.reset();
  editTarget.value = endpoint;
  formOpen.value = true;
}

function handleFormOpen(open: boolean) {
  formOpen.value = open;
  if (!open) editTarget.value = null;
}

// One form for both modes: an edit target turns the same payload into a patch.
function submitForm(payload: CreateWebhookInput) {
  const target = editTarget.value;
  if (!target) {
    create.mutate(payload, {
      onSuccess: (created) => {
        formOpen.value = false;
        showSecret(created.url, created.secret);
      },
    });
    return;
  }

  update.mutate(
    { id: target.id, ...payload },
    {
      onSuccess: (updated) => {
        formOpen.value = false;
        editTarget.value = null;
        // A rotate answer carries the new secret once; an ordinary edit does
        // not, and must not open the reveal dialog.
        const secret = webhookSecretOf(updated);
        if (secret) showSecret(updated.url, secret);
      },
    },
  );
}

// Which row's switch is in flight: the mutation is shared, so the flag is per
// endpoint instead of "any update pending" (otherwise every row looks busy).
const pendingActiveId = ref<string | null>(null);

// The checkbox is bound to the row, so a rejected toggle re-renders the old
// state; resetting the element keeps the DOM honest until that happens.
function onActiveChange(endpoint: WebhookEndpoint, event: Event) {
  const input = event.target as HTMLInputElement;
  pendingActiveId.value = endpoint.id;
  update.mutate(
    { id: endpoint.id, active: input.checked },
    {
      onError: () => {
        input.checked = endpoint.active;
      },
      onSettled: () => {
        pendingActiveId.value = null;
      },
    },
  );
}

function runTest(endpoint: WebhookEndpoint) {
  test.mutate(endpoint.id);
}

const deleteOpen = ref(false);
const deleteTarget = ref<WebhookEndpoint | null>(null);

const deleteDescription = computed(() => {
  const target = deleteTarget.value;
  if (!target) return "";
  return t("webhooks.deleteDescription", { url: target.url });
});

function requestDelete(endpoint: WebhookEndpoint) {
  remove.reset();
  deleteTarget.value = endpoint;
  deleteOpen.value = true;
}

function confirmDelete() {
  const target = deleteTarget.value;
  if (!target) return;
  remove.mutate(target.id, {
    onSuccess: () => {
      deleteOpen.value = false;
      deleteTarget.value = null;
      expandedIds.value = expandedIds.value.filter((id) => id !== target.id);
    },
  });
}
</script>

<template>
  <div class="space-y-3" :data-testid="TEST_ID.projectWebhooksPanel">
    <div class="flex justify-end">
      <Button
        type="button"
        :data-testid="TEST_ID.webhookAdd"
        @click="openCreate"
      >
        <Plus class="h-4 w-4" />
        {{ t("webhooks.addEndpoint") }}
      </Button>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('webhooks.errorTitle')"
      :retry="refetch"
      :empty="endpoints.length === 0"
    >
      <template #loading>
        <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div
            v-for="row in 3"
            :key="row"
            class="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div class="space-y-2">
              <div class="h-4 w-56 animate-pulse rounded bg-muted" />
              <div class="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div class="h-8 w-24 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </template>

      <template #empty>
        <div
          class="rounded-xl border bg-card p-8 text-center shadow-sm"
          :data-testid="TEST_ID.webhooksEmpty"
        >
          <p class="text-sm text-muted-foreground">
            {{ t("webhooks.empty") }}
          </p>
        </div>
      </template>

      <ul class="overflow-hidden rounded-xl border bg-card shadow-sm">
        <li
          v-for="endpoint in endpoints"
          :key="endpoint.id"
          class="border-b last:border-b-0"
          :data-testid="TEST_ID.webhookRow"
        >
          <div
            class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div class="min-w-0 space-y-1">
              <p
                class="truncate font-medium"
                :title="endpoint.url"
                :data-testid="TEST_ID.webhookEndpointUrl"
              >
                {{ endpoint.url }}
              </p>

              <div class="flex flex-wrap items-center gap-2">
                <Badge
                  v-for="event in endpoint.events"
                  :key="event"
                  variant="secondary"
                >
                  {{ webhookEventLabelI18n(event) }}
                </Badge>
                <Badge variant="outline">
                  {{ WEBHOOK_FORMAT_LABEL[endpoint.format] }}
                </Badge>
                <code class="font-mono text-xs text-muted-foreground">
                  {{ endpoint.secretPreview }}
                </code>
              </div>

              <p class="text-xs text-muted-foreground">
                <span
                  :title="formatDateTime(new Date(endpoint.createdAt))"
                  :data-testid="TEST_ID.webhookCreated"
                >
                  {{
                    t("webhooks.created", {
                      age: formatRelativeAge(endpoint.createdAt),
                    })
                  }}
                </span>
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2 sm:shrink-0">
              <label
                class="inline-flex cursor-pointer items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  role="switch"
                  class="peer sr-only"
                  :checked="endpoint.active"
                  :disabled="pendingActiveId === endpoint.id"
                  :aria-busy="pendingActiveId === endpoint.id"
                  :aria-label="t('webhooks.activeAria', { url: endpoint.url })"
                  :data-testid="TEST_ID.webhookActiveToggle"
                  @change="onActiveChange(endpoint, $event)"
                />
                <span
                  class="relative h-5 w-9 rounded-full border bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-background after:transition-transform after:content-[''] peer-checked:after:translate-x-4"
                />
                <span class="text-muted-foreground">
                  {{
                    pendingActiveId === endpoint.id
                      ? t("webhooks.saving")
                      : endpoint.active
                        ? t("webhooks.active")
                        : t("webhooks.inactive")
                  }}
                </span>
              </label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                :aria-label="t('webhooks.editAria', { url: endpoint.url })"
                :data-testid="TEST_ID.webhookEdit"
                @click="openEdit(endpoint)"
              >
                {{ t("webhooks.edit") }}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="test.isPending.value"
                :aria-label="t('webhooks.testAria', { url: endpoint.url })"
                :data-testid="TEST_ID.webhookTest"
                @click="runTest(endpoint)"
              >
                {{ t("webhooks.test") }}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :aria-expanded="isExpanded(endpoint.id)"
                :aria-controls="`webhook-deliveries-${endpoint.id}`"
                :aria-label="
                  t('webhooks.deliveriesAria', { url: endpoint.url })
                "
                :data-testid="TEST_ID.webhookDeliveries"
                @click="toggleDeliveries(endpoint.id)"
              >
                {{ t("webhooks.deliveries") }}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                :aria-label="t('webhooks.deleteAria', { url: endpoint.url })"
                :data-testid="TEST_ID.webhookDelete"
                @click="requestDelete(endpoint)"
              >
                {{ t("webhooks.delete") }}
              </Button>
            </div>
          </div>

          <WebhookDeliveriesPanel
            :project-name="projectName"
            :endpoint-id="endpoint.id"
            :expanded="isExpanded(endpoint.id)"
          />
        </li>
      </ul>
    </AsyncState>

    <WebhookEndpointDialog
      :open="formOpen"
      :endpoint="editTarget"
      :pending="formPending"
      :error="formError"
      @update:open="handleFormOpen"
      @submit="submitForm"
    />

    <RevealWebhookSecretDialog
      :open="revealOpen"
      :url="revealUrl"
      :secret="revealSecret"
      @update:open="revealOpen = $event"
    />

    <ConfirmDialog
      :open="deleteOpen"
      :pending="remove.isPending.value"
      confirm-variant="destructive"
      :title="t('webhooks.deleteTitle')"
      :description="deleteDescription"
      :confirm-text="t('webhooks.delete')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmDelete"
      @cancel="
        () => {
          deleteOpen = false;
          deleteTarget = null;
        }
      "
      @update:open="deleteOpen = $event"
    />
  </div>
</template>

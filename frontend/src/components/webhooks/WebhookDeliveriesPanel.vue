<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { formatDateTime } from "@/lib/format-date";
import { RefreshCw } from "@lucide/vue";
import ErrorAlert from "@/components/ErrorAlert.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWebhookDeliveries } from "@/composables/useWebhooks";
import {
  WEBHOOK_MAX_ATTEMPTS,
  type WebhookDeliveryStatus,
} from "@/domains/webhooks/webhook.model";
import {
  webhookEventLabelI18n,
  webhookStatusLabel,
} from "@/domains/webhooks/webhook.labels";
import { formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  projectName: string;
  endpointId: string;
  expanded: boolean;
}>();

const { t } = useI18n();
const { data, isLoading, error, refetch, replay, isReplaying } =
  useWebhookDeliveries(
    toRef(props, "projectName"),
    toRef(props, "endpointId"),
    toRef(props, "expanded"),
  );

const deliveries = computed(() => data.value ?? []);

// Mirrors the status-badge convention in domains/test-status: an outline plus
// the status text color, no filled background (a tinted background drops the
// text below the 4.5:1 contrast the a11y suite enforces). The label always
// spells the status out, so colour is never the only signal.
const statusClass: Record<WebhookDeliveryStatus, string> = {
  PENDING: "border-status-neutral text-status-neutral",
  PROCESSING: "border-status-info text-status-info",
  DELIVERED: "border-status-success text-status-success",
  FAILED: "border-status-danger text-status-danger",
};

function replayLabel(event: string, createdAt: string): string {
  return t("webhookDeliveries.replayAria", {
    event: webhookEventLabelI18n(event),
    age: formatRelativeAge(createdAt),
  });
}
</script>

<template>
  <div
    v-if="expanded"
    :id="`webhook-deliveries-${endpointId}`"
    class="border-t px-4 py-3"
  >
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">{{ t("webhookDeliveries.recent") }}</h3>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        :disabled="isLoading"
        :aria-label="t('webhookDeliveries.refreshAria')"
        :data-testid="TEST_ID.webhookDeliveriesRefresh"
        @click="refetch()"
      >
        <RefreshCw class="h-4 w-4" />
        {{ t("webhookDeliveries.refresh") }}
      </Button>
    </div>

    <div
      v-if="isLoading"
      class="space-y-2 py-2"
      role="status"
      aria-live="polite"
    >
      <div
        v-for="row in 2"
        :key="row"
        class="h-12 animate-pulse rounded-md bg-muted"
      />
      <span class="sr-only">{{ t("webhookDeliveries.loading") }}</span>
    </div>

    <ErrorAlert
      v-else-if="error"
      variant="error"
      :title="t('webhookDeliveries.errorTitle')"
      :message="error.message"
      retry
      :on-retry="() => refetch()"
    />

    <p
      v-else-if="deliveries.length === 0"
      class="py-2 text-sm text-muted-foreground"
      :data-testid="TEST_ID.webhookDeliveriesEmpty"
    >
      {{ t("webhookDeliveries.empty") }}
    </p>

    <ul v-else class="divide-y">
      <li
        v-for="delivery in deliveries"
        :key="delivery.id"
        class="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
        :data-testid="TEST_ID.webhookDeliveryRow"
      >
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              :class="statusClass[delivery.status]"
              :data-testid="TEST_ID.webhookDeliveryStatus"
            >
              {{ webhookStatusLabel(delivery.status) }}
            </Badge>
            <span class="text-sm font-medium">
              {{ webhookEventLabelI18n(delivery.event) }}
            </span>
            <span class="text-xs text-muted-foreground">
              {{
                t("webhookDeliveries.attempts", {
                  done: delivery.attempts,
                  max: WEBHOOK_MAX_ATTEMPTS,
                })
              }}
            </span>
            <span
              v-if="delivery.responseStatus !== null"
              class="text-xs text-muted-foreground"
            >
              HTTP {{ delivery.responseStatus }}
            </span>
            <span
              v-if="delivery.deliveredAt"
              class="text-xs text-muted-foreground"
            >
              {{
                t("webhookDeliveries.delivered", {
                  age: formatRelativeAge(delivery.deliveredAt),
                })
              }}
            </span>
          </div>

          <p
            v-if="delivery.lastError"
            class="truncate text-xs text-destructive"
            :title="delivery.lastError"
            :data-testid="TEST_ID.webhookDeliveryError"
          >
            {{ delivery.lastError }}
          </p>

          <p class="text-xs text-muted-foreground">
            <span :title="formatDateTime(new Date(delivery.createdAt))">
              {{ formatRelativeAge(delivery.createdAt) }}
            </span>
            <template v-if="delivery.nextAttemptAt">
              {{
                t("webhookDeliveries.nextAttempt", {
                  age: formatRelativeAge(delivery.nextAttemptAt),
                })
              }}
            </template>
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="isReplaying"
          :aria-label="replayLabel(delivery.event, delivery.createdAt)"
          :data-testid="TEST_ID.webhookReplay"
          @click="replay(delivery.id)"
        >
          {{ t("webhookDeliveries.replay") }}
        </Button>
      </li>
    </ul>
  </div>
</template>

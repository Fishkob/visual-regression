<script setup lang="ts">
import { AlertTriangle, XCircle, Info, RefreshCw } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{
  title?: string;
  message?: string;
  variant?: "error" | "warning" | "info";
  retry?: boolean;
  onRetry?: () => void;
}>();

const { t } = useI18n();
</script>

<template>
  <Alert
    :variant="variant === 'error' ? 'destructive' : 'default'"
    class="my-4"
  >
    <div class="flex items-start gap-3">
      <XCircle v-if="variant === 'error'" class="w-5 h-5 shrink-0 mt-0.5" />
      <AlertTriangle
        v-else-if="variant === 'warning'"
        class="w-5 h-5 shrink-0 mt-0.5"
      />
      <Info v-else class="w-5 h-5 shrink-0 mt-0.5" />

      <div class="flex-1">
        <AlertTitle v-if="title">{{ title }}</AlertTitle>
        <AlertDescription v-if="message">
          {{ message }}
        </AlertDescription>

        <button
          v-if="retry && onRetry"
          class="mt-3 inline-flex items-center gap-2 text-sm font-medium hover:underline"
          @click="onRetry"
          :data-testid="TEST_ID.retry"
        >
          <RefreshCw class="w-4 h-4" />
          {{ t("common.retry") }}
        </button>
      </div>
    </div>
  </Alert>
</template>

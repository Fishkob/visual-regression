<script setup lang="ts">
import { ref, onErrorCaptured } from "vue";
import { useI18n } from "vue-i18n";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();
const hasError = ref(false);
const errorMessage = ref("");
const resetKey = ref(0);

onErrorCaptured((err) => {
  hasError.value = true;
  errorMessage.value =
    err?.message || String(err) || t("errorBoundary.fallback");
  return false;
});

function recover() {
  resetKey.value++;
  hasError.value = false;
  errorMessage.value = "";
}
</script>

<template>
  <div
    v-if="hasError"
    class="min-h-[200px] flex items-center justify-center p-8"
  >
    <div class="text-center space-y-4">
      <div class="text-status-danger text-lg font-semibold">
        {{ t("errorBoundary.title") }}
      </div>
      <div class="text-muted-foreground text-sm">{{ errorMessage }}</div>
      <button
        class="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        @click="recover"
        :data-testid="TEST_ID.retry"
      >
        {{ t("errorBoundary.retry") }}
      </button>
    </div>
  </div>

  <slot v-else :key="resetKey" />
</template>

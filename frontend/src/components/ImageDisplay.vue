<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    label: string;
    url?: string;
    border?: "green" | "blue" | "red";
  }>(),
  {
    url: undefined,
    border: "green",
  },
);

const dotColor = computed(() => {
  return (
    {
      green: "bg-status-success",
      blue: "bg-status-info",
      red: "bg-status-danger",
    } as const
  )[props.border];
});

const failed = ref(false);
const attempt = ref(0);

const retry = () => {
  failed.value = false;
  attempt.value += 1;
};

watch(
  () => props.url,
  () => {
    failed.value = false;
    attempt.value += 1;
  },
);
</script>

<template>
  <div
    class="rounded-3xl border border-border bg-card shadow p-4 flex flex-col gap-4 w-full"
  >
    <div
      class="flex items-center gap-2 text-sm font-medium text-foreground/80 pt-1"
    >
      <span class="w-3 h-3 rounded-full" :class="dotColor" />
      <span>{{ label }}</span>
    </div>

    <div
      v-if="url"
      class="flex items-center justify-center min-h-[300px] overflow-hidden bg-image-canvas rounded-2xl"
    >
      <img
        v-if="!failed"
        :key="attempt"
        :src="url"
        :alt="label"
        loading="lazy"
        class="max-h-[70vh] max-w-full object-contain select-none"
        @error="failed = true"
      />
      <div
        v-else
        class="flex flex-col items-center justify-center gap-2 p-4 text-center"
      >
        <span class="text-sm text-status-danger">{{
          t("imageViewer.unavailable")
        }}</span>
        <Button variant="outline" size="sm" @click="retry">{{
          t("imageViewer.retry")
        }}</Button>
      </div>
    </div>
  </div>
</template>

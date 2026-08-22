<script setup lang="ts">
import { computed } from "vue";

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
      green: "bg-emerald-500",
      blue: "bg-blue-500",
      red: "bg-red-500",
    } as const
  )[props.border];
});
</script>

<template>
  <div
    class="rounded-3xl border border-gray-100 bg-white shadow p-4 flex flex-col gap-4 w-full"
  >
    <div class="flex items-center gap-2 text-sm font-medium text-gray-700 pt-1">
      <span class="w-3 h-3 rounded-full" :class="dotColor" />
      <span>{{ label }}</span>
    </div>

    <div
      v-if="url"
      class="flex items-center justify-center min-h-[300px] overflow-hidden"
    >
      <img
        :src="url"
        :alt="label"
        loading="lazy"
        class="max-h-[70vh] max-w-full object-contain select-none"
      />
    </div>
  </div>
</template>

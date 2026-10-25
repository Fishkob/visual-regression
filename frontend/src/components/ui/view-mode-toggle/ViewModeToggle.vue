<script setup lang="ts">
import { computed } from "vue";
import { TEST_ID } from "@/lib/test-ids";

export type ViewMode = "side-by-side" | "diff-only" | "overlay" | "wipe";

const props = withDefaults(
  defineProps<{
    modelValue: ViewMode;
    showDiff?: boolean;
    showLayered?: boolean;
  }>(),
  {
    showDiff: true,
    showLayered: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [ViewMode];
}>();

const modes: { key: ViewMode; label: string; testId: string }[] = [
  {
    key: "side-by-side",
    label: "Side by Side",
    testId: TEST_ID.modeSidebyside,
  },
  { key: "diff-only", label: "Diff Only", testId: TEST_ID.modeDiff },
  { key: "overlay", label: "Overlay", testId: TEST_ID.modeOverlay },
  { key: "wipe", label: "Wipe", testId: TEST_ID.modeWipe },
];

const visibleModes = computed(() =>
  modes.filter((mode) => {
    if (mode.key === "side-by-side") return true;
    if (!props.showDiff) return false;
    if (mode.key === "diff-only") return true;
    return props.showLayered;
  }),
);
</script>

<template>
  <div
    class="flex gap-1 p-1 bg-muted rounded-lg"
    role="group"
    aria-label="View mode"
  >
    <button
      v-for="mode in visibleModes"
      :key="mode.key"
      :data-testid="mode.testId"
      :aria-pressed="modelValue === mode.key"
      class="px-3 py-1.5 text-sm rounded-md transition-colors"
      :class="
        modelValue === mode.key
          ? 'bg-background shadow-sm font-medium'
          : 'text-muted-foreground hover:text-foreground'
      "
      @click="emit('update:modelValue', mode.key)"
    >
      {{ mode.label }}
    </button>
  </div>
</template>

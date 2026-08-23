<script setup lang="ts">
import { TEST_ID } from "@/lib/test-ids";

export type ViewMode = "side-by-side" | "diff-only";

const props = withDefaults(
  defineProps<{
    modelValue: ViewMode;
    showDiff?: boolean;
  }>(),
  {
    showDiff: true,
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
];

const visibleModes = () => (props.showDiff ? modes : [modes[0]]);
</script>

<template>
  <div class="flex gap-1 p-1 bg-muted rounded-lg">
    <button
      v-for="mode in visibleModes()"
      :key="mode.key"
      :data-testid="mode.testId"
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

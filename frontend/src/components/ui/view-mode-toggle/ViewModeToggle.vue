<script setup lang="ts">
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

// The mode vocabulary (labels + test IDs) lives here, so the e2e contract and
// the markup have one owner — both the image and PDF viewers compose this.
const modes: { key: ViewMode; label: string; testId: string }[] = [
  { key: "side-by-side", label: "Side by Side", testId: "mode-sidebyside" },
  { key: "diff-only", label: "Diff Only", testId: "mode-diff" },
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

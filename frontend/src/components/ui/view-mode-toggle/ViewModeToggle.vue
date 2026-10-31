<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { TEST_ID } from "@/lib/test-ids";

export type ViewMode =
  "highlight" | "side-by-side" | "diff-only" | "overlay" | "wipe" | "blink";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    modelValue: ViewMode;
    showDiff?: boolean;
    showLayered?: boolean;
    // The diff painted over the candidate: the mode a reviewer lands on when
    // the comparison knows where its changes are.
    showHighlight?: boolean;
    // Alternating baseline/candidate: the eye catches a shift faster than it
    // compares two static pictures.
    showBlink?: boolean;
  }>(),
  {
    showDiff: true,
    showLayered: true,
    showHighlight: false,
    showBlink: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [ViewMode];
}>();

const modes: { key: ViewMode; labelKey: string; testId: string }[] = [
  {
    key: "highlight",
    labelKey: "viewMode.highlight",
    testId: TEST_ID.modeHighlight,
  },
  {
    key: "side-by-side",
    labelKey: "viewMode.sideBySide",
    testId: TEST_ID.modeSidebyside,
  },
  { key: "diff-only", labelKey: "viewMode.diffOnly", testId: TEST_ID.modeDiff },
  { key: "overlay", labelKey: "viewMode.overlay", testId: TEST_ID.modeOverlay },
  { key: "wipe", labelKey: "viewMode.wipe", testId: TEST_ID.modeWipe },
  { key: "blink", labelKey: "viewMode.blink", testId: TEST_ID.modeBlink },
];

const visibleModes = computed(() =>
  modes.filter((mode) => {
    if (mode.key === "side-by-side") return true;
    if (mode.key === "highlight") return props.showHighlight && props.showDiff;
    if (mode.key === "blink") return props.showBlink;
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
    :aria-label="t('viewMode.label')"
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
      {{ t(mode.labelKey) }}
    </button>
  </div>
</template>

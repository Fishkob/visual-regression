<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ChangedRegion } from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";

const props = withDefaults(
  defineProps<{
    regions: ChangedRegion[];
    imageWidth: number;
    imageHeight: number;
    activeIndex?: number | null;
    interactive?: boolean;
  }>(),
  { activeIndex: null, interactive: false },
);

defineEmits<{ select: [index: number] }>();

const { t } = useI18n();

// Percentages keep the boxes correct in fit mode, where the rendered image is
// smaller than its pixel size. The border is counter-scaled by the stage's zoom
// (`--s`) so a box stays a hairline while the image grows.
function boxStyle(region: ChangedRegion) {
  const width = props.imageWidth || 1;
  const height = props.imageHeight || 1;
  return {
    left: `${(region.x / width) * 100}%`,
    top: `${(region.y / height) * 100}%`,
    width: `${(region.width / width) * 100}%`,
    height: `${(region.height / height) * 100}%`,
  };
}
</script>

<template>
  <!-- In the single-picture stage these boxes are the region control: clickable
       and focusable, each named after the area it zooms to. Side by side draws
       the same boxes on every pane, so there they are decorative and the
       keyboard path is the viewer's n/p step-through. -->
  <div class="pointer-events-none absolute inset-0 overflow-hidden">
    <button
      v-for="(region, index) in regions"
      :key="index"
      type="button"
      :tabindex="interactive ? 0 : -1"
      :aria-hidden="interactive ? undefined : 'true'"
      :aria-label="
        interactive
          ? t('imageViewer.focusRegion', { index: index + 1 })
          : undefined
      "
      :data-testid="TEST_ID.changedRegionBox"
      :data-region-index="index"
      :data-active="activeIndex === index ? 'true' : undefined"
      class="group pointer-events-auto absolute cursor-pointer rounded-[2px] border border-status-danger bg-destructive/10 transition-[box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="
        activeIndex === index
          ? 'bg-destructive/25 ring-2 ring-destructive/40'
          : 'hover:bg-destructive/20'
      "
      :style="boxStyle(region)"
      @click.stop="$emit('select', index)"
    >
      <!-- The number sits on the status red, so its text follows the theme
           background instead of the destructive foreground: white on the dark
           light-mode red, near-black on the light dark-mode red (6.4:1 / 10.4:1
           measured, where destructive-foreground dropped to 1.8:1 in dark). -->
      <span
        class="absolute -top-px left-0 -translate-y-full rounded-[2px] bg-status-danger px-1 text-[10px] font-semibold leading-[14px] text-background tabular-nums"
        >{{ index + 1 }}</span
      >
    </button>
  </div>
</template>

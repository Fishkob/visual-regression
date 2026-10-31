<script setup lang="ts">
import type { ChangedRegion } from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";

const props = withDefaults(
  defineProps<{
    regions: ChangedRegion[];
    imageWidth: number;
    imageHeight: number;
    activeIndex?: number | null;
  }>(),
  { activeIndex: null },
);

defineEmits<{ select: [index: number] }>();

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
  <!-- The list beside the image is the accessible control surface; these boxes
       are its visual twin, so they stay out of the tab order on purpose. -->
  <div class="pointer-events-none absolute inset-0 overflow-hidden">
    <button
      v-for="(region, index) in regions"
      :key="index"
      type="button"
      tabindex="-1"
      aria-hidden="true"
      :data-testid="TEST_ID.changedRegionBox"
      :data-region-index="index"
      :data-active="activeIndex === index ? 'true' : undefined"
      class="group pointer-events-auto absolute cursor-pointer rounded-[2px] border border-status-danger bg-destructive/10 transition-[box-shadow,background-color]"
      :class="
        activeIndex === index
          ? 'bg-destructive/25 ring-2 ring-destructive/40'
          : 'hover:bg-destructive/20'
      "
      :style="boxStyle(region)"
      @click.stop="$emit('select', index)"
    >
      <span
        class="absolute -top-px left-0 -translate-y-full rounded-[2px] bg-status-danger px-1 text-[10px] font-semibold leading-[14px] text-destructive-foreground tabular-nums"
        >{{ index + 1 }}</span
      >
    </button>
  </div>
</template>

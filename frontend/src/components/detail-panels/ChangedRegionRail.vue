<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ChangedRegion } from "@/domains/visual-test/visual-test.model";
import { currentLocale } from "@/i18n";
import { TEST_ID } from "@/lib/test-ids";

const props = withDefaults(
  defineProps<{
    regions: ChangedRegion[];
    candidateUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    activeIndex?: number | null;
  }>(),
  {
    candidateUrl: undefined,
    imageWidth: 0,
    imageHeight: 0,
    activeIndex: null,
  },
);

defineEmits<{ select: [index: number] }>();

const { t } = useI18n();

const THUMB_WIDTH = 44;
const THUMB_HEIGHT = 32;

// The crop is the candidate, scaled and offset so the region sits in the middle
// of the thumbnail: a list of numbers alone still leaves you guessing which part
// of the page "Stelle 4" is.
function cropStyle(region: ChangedRegion): Record<string, string> {
  const width = props.imageWidth ?? 0;
  const height = props.imageHeight ?? 0;
  if (!props.candidateUrl || width <= 0 || height <= 0) return {};
  const padding = Math.max(region.width, region.height) * 0.15;
  const scale = Math.max(
    THUMB_WIDTH / (region.width + padding * 2),
    THUMB_HEIGHT / (region.height + padding * 2),
  );
  const centreX = region.x + region.width / 2;
  const centreY = region.y + region.height / 2;
  return {
    backgroundImage: `url("${props.candidateUrl}")`,
    backgroundSize: `${(width * scale).toFixed(2)}px ${(height * scale).toFixed(2)}px`,
    backgroundPosition: `${(THUMB_WIDTH / 2 - centreX * scale).toFixed(2)}px ${(THUMB_HEIGHT / 2 - centreY * scale).toFixed(2)}px`,
  };
}

function shareLabel(region: ChangedRegion): string {
  const width = props.imageWidth ?? 0;
  const height = props.imageHeight ?? 0;
  if (width <= 0 || height <= 0) return `${region.pixelCount} px`;
  const share = (region.pixelCount / (width * height)) * 100;
  const percent = new Intl.NumberFormat(currentLocale(), {
    maximumFractionDigits: share < 1 ? 2 : 1,
  }).format(share);
  return t("imageViewer.regionShare", { percent: `${percent} %` });
}
</script>

<template>
  <aside
    class="rounded-3xl border border-border bg-card p-3 shadow"
    :data-testid="TEST_ID.changedRegionList"
    :aria-label="t('imageViewer.regionList')"
  >
    <div class="mb-2 flex items-baseline justify-between gap-2 px-1">
      <h2 class="text-sm font-medium">{{ t("imageViewer.changedRegions") }}</h2>
      <span
        class="text-xs text-muted-foreground tabular-nums"
        :data-testid="TEST_ID.changedRegionCount"
        >{{ t("imageViewer.regionCount", regions.length) }}</span
      >
    </div>

    <ol class="-mx-1 max-h-[60vh] space-y-0.5 overflow-auto px-1">
      <li v-for="(region, index) in regions" :key="index">
        <button
          type="button"
          :data-testid="TEST_ID.changedRegionItem"
          :data-region-index="index"
          :aria-pressed="activeIndex === index"
          :aria-label="t('imageViewer.focusRegion', { index: index + 1 })"
          class="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="
            activeIndex === index
              ? 'bg-muted ring-1 ring-inset ring-border'
              : 'hover:bg-muted'
          "
          @click="$emit('select', index)"
        >
          <span
            class="grid h-4 w-4 shrink-0 place-items-center rounded bg-destructive text-[10px] font-semibold text-destructive-foreground tabular-nums"
            >{{ index + 1 }}</span
          >
          <span
            class="h-8 w-11 shrink-0 rounded border border-border bg-card bg-no-repeat"
            :style="cropStyle(region)"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-medium tabular-nums">
              {{
                t("imageViewer.regionSize", {
                  width: region.width,
                  height: region.height,
                })
              }}
            </span>
            <span class="block text-[11px] text-muted-foreground tabular-nums">
              {{ shareLabel(region) }}
            </span>
          </span>
        </button>
      </li>
    </ol>

    <p class="mt-2 px-1 text-[11px] text-muted-foreground">
      {{ t("imageViewer.regionHint") }}
    </p>
  </aside>
</template>

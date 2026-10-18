<script setup lang="ts">
import { ref, computed } from "vue";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/components/ui/view-mode-toggle";
import { TEST_ID } from "@/lib/test-ids";

const props = withDefaults(
  defineProps<{
    baselineUrl?: string;
    candidateUrl?: string;
    diffUrl?: string;
  }>(),
  {
    baselineUrl: undefined,
    candidateUrl: undefined,
    diffUrl: undefined,
  },
);

const viewMode = ref<ViewMode>("side-by-side");
const zoomLevel = ref(100);

const ZOOM_STEPS = [50, 75, 100, 150, 200];

const zoomIn = () => {
  const idx = ZOOM_STEPS.indexOf(zoomLevel.value);
  if (idx < ZOOM_STEPS.length - 1) zoomLevel.value = ZOOM_STEPS[idx + 1];
};

const zoomOut = () => {
  const idx = ZOOM_STEPS.indexOf(zoomLevel.value);
  if (idx > 0) zoomLevel.value = ZOOM_STEPS[idx - 1];
};

const zoomReset = () => {
  zoomLevel.value = 100;
};

const hasDiff = computed(() => Boolean(props.diffUrl));

const panels = computed(() => {
  const list: {
    key: string;
    label: string;
    url?: string;
    dotClass: string;
    testId: string;
  }[] = [];

  if (viewMode.value !== "diff-only") {
    if (props.baselineUrl)
      list.push({
        key: "baseline",
        label: "Baseline",
        url: props.baselineUrl,
        dotClass: "bg-status-success",
        testId: TEST_ID.panelBaseline,
      });
    if (props.candidateUrl)
      list.push({
        key: "candidate",
        label: "Candidate",
        url: props.candidateUrl,
        dotClass: "bg-status-info",
        testId: TEST_ID.panelCandidate,
      });
  }

  if (viewMode.value === "diff-only" || viewMode.value === "side-by-side") {
    if (props.diffUrl)
      list.push({
        key: "diff",
        label: "Diff",
        url: props.diffUrl,
        dotClass: "bg-status-danger",
        testId: TEST_ID.panelDiff,
      });
  }

  return list;
});
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-3">
      <ViewModeToggle v-model="viewMode" :show-diff="hasDiff" />

      <div class="flex items-center gap-1">
        <button
          :data-testid="TEST_ID.zoomOut"
          aria-label="Zoom out"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-30"
          :disabled="zoomLevel === ZOOM_STEPS[0]"
          @click="zoomOut"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span
          :data-testid="TEST_ID.zoomLevel"
          class="text-xs text-muted-foreground w-10 text-center tabular-nums"
          >{{ zoomLevel }}%</span
        >
        <button
          :data-testid="TEST_ID.zoomIn"
          aria-label="Zoom in"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-30"
          :disabled="zoomLevel === ZOOM_STEPS[ZOOM_STEPS.length - 1]"
          @click="zoomIn"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          :data-testid="TEST_ID.zoomReset"
          aria-label="Reset zoom"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          @click="zoomReset"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>
    </div>

    <div
      class="grid gap-4"
      :class="
        viewMode === 'diff-only'
          ? 'grid-cols-1 mx-auto max-w-5xl'
          : hasDiff
            ? 'grid-cols-3'
            : 'grid-cols-2'
      "
    >
      <div
        v-for="panel in panels"
        :key="panel.key"
        :data-testid="panel.testId"
        class="rounded-3xl border border-border bg-card shadow p-4"
      >
        <div
          class="flex items-center gap-2 text-sm font-medium text-foreground/80 mb-3"
        >
          <span class="w-3 h-3 rounded-full" :class="panel.dotClass" />
          <span>{{ panel.label }}</span>
        </div>
        <div
          class="flex items-center justify-center min-h-[300px] max-h-[70vh] overflow-hidden bg-image-canvas rounded-2xl"
          :style="{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top left',
          }"
        >
          <img
            v-if="panel.url"
            :src="panel.url"
            :alt="panel.label"
            loading="lazy"
            class="max-h-full max-w-full object-contain select-none"
          />
        </div>
      </div>
    </div>
  </div>
</template>

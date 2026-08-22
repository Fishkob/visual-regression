<script setup lang="ts">
import { ref, computed } from "vue";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/components/ui/view-mode-toggle";

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

const rightPanelUrl = computed(() => {
  if (viewMode.value === "diff-only" && props.diffUrl) return props.diffUrl;
  return props.candidateUrl;
});

const rightPanelLabel = computed(() => {
  return viewMode.value === "diff-only" ? "Diff" : "Candidate";
});

const rightPanelBorder = computed<"blue" | "red">(() => {
  return viewMode.value === "diff-only" ? "red" : "blue";
});
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-3">
      <ViewModeToggle v-model="viewMode" />

      <div class="flex items-center gap-1">
        <button
          data-testid="zoom-out"
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
          data-testid="zoom-level"
          class="text-xs text-muted-foreground w-10 text-center tabular-nums"
          >{{ zoomLevel }}%</span
        >
        <button
          data-testid="zoom-in"
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
          data-testid="zoom-reset"
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

    <div class="flex gap-4">
      <div
        data-testid="panel-baseline"
        class="flex-1 rounded-3xl border border-gray-100 bg-white shadow p-4"
      >
        <div
          class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3"
        >
          <span class="w-3 h-3 rounded-full bg-emerald-500" />
          <span>Baseline</span>
        </div>
        <div
          v-if="baselineUrl"
          class="flex items-center justify-center min-h-[300px] max-h-[70vh] overflow-hidden"
          :style="{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top left',
          }"
        >
          <img
            :src="baselineUrl"
            alt="Baseline"
            loading="lazy"
            class="max-h-full max-w-full object-contain select-none"
          />
        </div>
      </div>

      <div
        data-testid="panel-candidate"
        class="flex-1 rounded-3xl border border-gray-100 bg-white shadow p-4 relative"
      >
        <div
          class="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3"
        >
          <span
            class="w-3 h-3 rounded-full"
            :class="
              rightPanelBorder === 'red'
                ? 'bg-red-500'
                : rightPanelBorder === 'blue'
                  ? 'bg-blue-500'
                  : 'bg-emerald-500'
            "
          />
          <span>{{ rightPanelLabel }}</span>
        </div>
        <div
          class="flex items-center justify-center min-h-[300px] max-h-[70vh] overflow-hidden relative"
          :style="{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top left',
          }"
        >
          <img
            v-if="rightPanelUrl"
            :src="rightPanelUrl"
            :alt="rightPanelLabel"
            loading="lazy"
            class="max-h-full max-w-full object-contain select-none"
          />
        </div>
      </div>
    </div>
  </div>
</template>

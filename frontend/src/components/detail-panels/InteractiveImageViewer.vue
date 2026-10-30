<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
  ref,
  computed,
  reactive,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/components/ui/view-mode-toggle";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";
import { cn } from "@/lib/utils";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    baselineUrl?: string;
    candidateUrl?: string;
    diffUrl?: string;
    mismatchPixelCount?: number;
  }>(),
  {
    baselineUrl: undefined,
    candidateUrl: undefined,
    diffUrl: undefined,
    mismatchPixelCount: undefined,
  },
);

const ZOOM_STEPS = [50, 75, 100, 150, 200];
const MODE_STORAGE_KEY = "vrt:viewer:mode";
const ZOOM_STORAGE_KEY = "vrt:viewer:zoom";
const PAN_STEP = 40;
const WIPE_STEP = 2;

const VIEW_MODES: ViewMode[] = ["side-by-side", "diff-only", "overlay", "wipe"];

const controlClass =
  "p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const readStoredMode = (): ViewMode => {
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (!raw) return "side-by-side";
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "string") return "side-by-side";
    return (VIEW_MODES as readonly string[]).includes(value)
      ? (value as ViewMode)
      : "side-by-side";
  } catch {
    return "side-by-side";
  }
};

const readStoredZoom = (): number => {
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) return 100;
    const value: unknown = JSON.parse(raw);
    return typeof value === "number" && ZOOM_STEPS.includes(value)
      ? value
      : 100;
  } catch {
    return 100;
  }
};

const viewMode = ref<ViewMode>(readStoredMode());
const zoomLevel = ref(readStoredZoom());
const fitToScreen = ref(zoomLevel.value === 100);
const pan = reactive({ x: 0, y: 0 });

const failed = reactive<Record<string, boolean>>({});
const attempts = reactive<Record<string, number>>({});
const sizes = reactive<Record<string, { width: number; height: number }>>({});

const isFailed = (key: string) => failed[key] === true;

const markFailed = (key: string) => {
  failed[key] = true;
};

const retry = (key: string) => {
  failed[key] = false;
  attempts[key] = (attempts[key] ?? 0) + 1;
};

const imageKey = (key: string) => `${key}-${attempts[key] ?? 0}`;

const onImageLoad = (key: string, event: Event) => {
  const img = event.target as HTMLImageElement;
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    sizes[key] = { width: img.naturalWidth, height: img.naturalHeight };
  }
};

watch(
  () => [props.baselineUrl, props.candidateUrl, props.diffUrl],
  () => {
    for (const key of Object.keys(failed)) delete failed[key];
    for (const key of Object.keys(sizes)) delete sizes[key];
  },
);

const hasDiff = computed(() => Boolean(props.diffUrl));

if (!hasDiff.value && viewMode.value !== "side-by-side") {
  viewMode.value = "side-by-side";
}

watch(
  () => props.diffUrl,
  (url) => {
    if (!url && viewMode.value !== "side-by-side") {
      viewMode.value = "side-by-side";
    }
  },
);

const persist = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is optional: storage may be unavailable or full.
  }
};

watch(viewMode, (mode) => persist(MODE_STORAGE_KEY, mode));
watch(zoomLevel, (zoom) => persist(ZOOM_STORAGE_KEY, zoom));

const mismatchPercent = computed(() => {
  const count = props.mismatchPixelCount;
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  const size = sizes.baseline;
  if (!size) return null;
  const area = size.width * size.height;
  if (area <= 0) return null;
  // The count itself lives in the comparison facts above the viewer; here only
  // the share of the image is added, because that is the number plain pixels
  // cannot tell.
  return `${((count / area) * 100).toFixed(1)}%`;
});

const resetPan = () => {
  pan.x = 0;
  pan.y = 0;
};

const panBy = (dx: number, dy: number) => {
  pan.x += dx;
  pan.y += dy;
};

const setZoom = (next: number) => {
  zoomLevel.value = next;
  fitToScreen.value = false;
};

const zoomAtPoint = (nextZoom: number, pointX: number, pointY: number) => {
  const previousScale = zoomLevel.value / 100;
  const nextScale = nextZoom / 100;
  const contentX = (pointX - pan.x) / previousScale;
  const contentY = (pointY - pan.y) / previousScale;
  pan.x = pointX - contentX * nextScale;
  pan.y = pointY - contentY * nextScale;
  zoomLevel.value = nextZoom;
};

const zoomIn = () => {
  const idx = ZOOM_STEPS.indexOf(zoomLevel.value);
  if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]);
};

const zoomOut = () => {
  const idx = ZOOM_STEPS.indexOf(zoomLevel.value);
  if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]);
};

const zoomReset = () => {
  zoomLevel.value = 100;
  resetPan();
};

const enableFit = () => {
  fitToScreen.value = true;
  zoomLevel.value = 100;
  resetPan();
};

const enableActualSize = () => {
  fitToScreen.value = false;
  zoomLevel.value = 100;
  resetPan();
};

const isActualSize = computed(
  () => !fitToScreen.value && zoomLevel.value === 100,
);

const wheelZoom = (event: WheelEvent) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const direction = event.deltaY < 0 ? 1 : -1;
  const idx = ZOOM_STEPS.indexOf(zoomLevel.value);
  const next = ZOOM_STEPS[idx + direction];
  if (next === undefined || next === zoomLevel.value) return;
  zoomAtPoint(next, event.clientX - rect.left, event.clientY - rect.top);
  fitToScreen.value = false;
};

const doubleClickZoom = (event: MouseEvent) => {
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  const idx = ZOOM_STEPS.indexOf(zoomLevel.value);
  const next = ZOOM_STEPS[idx + 1];
  if (next === undefined) return;
  const rect = el.getBoundingClientRect();
  zoomAtPoint(next, event.clientX - rect.left, event.clientY - rect.top);
  fitToScreen.value = false;
};

const drag = reactive({
  active: false,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
});

const beginPan = (event: MouseEvent) => {
  if (event.button !== 0) return;
  drag.active = true;
  drag.startX = event.clientX;
  drag.startY = event.clientY;
  drag.originX = pan.x;
  drag.originY = pan.y;
};

const wipePosition = ref(50);
const wipeDragging = ref(false);
const overlayOpacity = ref(50);
const layeredStage = ref<HTMLElement | null>(null);

const updateWipeFromClientX = (clientX: number) => {
  const el = layeredStage.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return;
  const percent = ((clientX - rect.left) / rect.width) * 100;
  wipePosition.value = Math.round(Math.min(100, Math.max(0, percent)));
};

const beginWipeDrag = (event: MouseEvent) => {
  if (event.button !== 0) return;
  wipeDragging.value = true;
  updateWipeFromClientX(event.clientX);
};

const onWipeKeydown = (event: KeyboardEvent) => {
  const step = event.shiftKey ? WIPE_STEP * 5 : WIPE_STEP;
  let next: number | null = null;
  if (event.key === "ArrowLeft") next = wipePosition.value - step;
  else if (event.key === "ArrowRight") next = wipePosition.value + step;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = 100;
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  wipePosition.value = Math.min(100, Math.max(0, next));
};

const onWindowMouseMove = (event: MouseEvent) => {
  if (drag.active) {
    pan.x = drag.originX + (event.clientX - drag.startX);
    pan.y = drag.originY + (event.clientY - drag.startY);
  }
  if (wipeDragging.value) updateWipeFromClientX(event.clientX);
};

const onWindowMouseUp = () => {
  drag.active = false;
  wipeDragging.value = false;
};

const isFullscreen = ref(false);
const fullscreenToggle = ref<HTMLButtonElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

const toggleFullscreen = async () => {
  isFullscreen.value = !isFullscreen.value;
  if (isFullscreen.value) {
    await nextTick();
    closeButton.value?.focus();
  }
};

const closeFullscreen = () => {
  if (!isFullscreen.value) return;
  isFullscreen.value = false;
  void nextTick(() => fullscreenToggle.value?.focus());
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return (
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
};

const isModeAvailable = (mode: ViewMode) =>
  mode === "side-by-side" || hasDiff.value;

const onWindowKeydown = (event: KeyboardEvent) => {
  if (isTypingTarget(event.target)) return;
  if (
    !isFullscreen.value &&
    document.querySelector('[role="dialog"], [role="alertdialog"]')
  ) {
    return;
  }

  if (event.key === "Escape") {
    if (!isFullscreen.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeFullscreen();
    return;
  }

  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomIn();
    return;
  }

  if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    zoomOut();
    return;
  }

  if (event.key === "0") {
    event.preventDefault();
    zoomReset();
    return;
  }

  if (event.key >= "1" && event.key <= "4") {
    const mode = VIEW_MODES[Number(event.key) - 1];
    if (isModeAvailable(mode)) {
      event.preventDefault();
      viewMode.value = mode;
    }
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    panBy(-PAN_STEP, 0);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    panBy(PAN_STEP, 0);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    panBy(0, -PAN_STEP);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    panBy(0, PAN_STEP);
  }
};

onMounted(() => {
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);
  window.addEventListener("keydown", onWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onWindowMouseMove);
  window.removeEventListener("mouseup", onWindowMouseUp);
  window.removeEventListener("keydown", onWindowKeydown);
});

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
        label: t("detail.baselineAlt"),
        url: props.baselineUrl,
        dotClass: "bg-status-success",
        testId: TEST_ID.panelBaseline,
      });
    if (props.candidateUrl)
      list.push({
        key: "candidate",
        label: t("detail.candidateAlt"),
        url: props.candidateUrl,
        dotClass: "bg-status-info",
        testId: TEST_ID.panelCandidate,
      });
  }

  if (viewMode.value === "diff-only" || viewMode.value === "side-by-side") {
    if (props.diffUrl)
      list.push({
        key: "diff",
        label: t("imageViewer.diff"),
        url: props.diffUrl,
        dotClass: "bg-status-danger",
        testId: TEST_ID.panelDiff,
      });
  }

  return list;
});

const isLayered = computed(
  () => viewMode.value === "overlay" || viewMode.value === "wipe",
);

const layeredLabel = computed(() =>
  viewMode.value === "overlay" ? t("viewMode.overlay") : t("viewMode.wipe"),
);

const layeredTestId = computed(() =>
  viewMode.value === "overlay" ? TEST_ID.panelOverlay : TEST_ID.panelWipe,
);

const layeredDotClass = computed(() =>
  viewMode.value === "overlay" ? "bg-status-warning" : "bg-status-info",
);

const gridClass = computed(() => {
  if (viewMode.value === "side-by-side") {
    return hasDiff.value ? "grid-cols-3" : "grid-cols-2";
  }
  if (viewMode.value === "diff-only") return "grid-cols-1 mx-auto max-w-5xl";
  return "grid-cols-1";
});

const contentTransform = computed(() => ({
  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel.value / 100})`,
  transformOrigin: "top left",
}));

const layeredCandidateStyle = computed(() => ({
  opacity: viewMode.value === "overlay" ? overlayOpacity.value / 100 : 1,
  clipPath:
    viewMode.value === "wipe" ? `inset(0 0 0 ${wipePosition.value}%)` : "none",
}));

const imageFitClass = computed(() =>
  fitToScreen.value
    ? "block w-auto h-auto max-w-full max-h-[70vh] object-contain select-none"
    : "block max-w-none max-h-none select-none",
);
</script>

<template>
  <div
    :class="
      cn(
        'w-full',
        isFullscreen && 'fixed inset-0 z-50 overflow-auto bg-background p-4',
      )
    "
    :role="isFullscreen ? 'dialog' : undefined"
    :aria-modal="isFullscreen ? 'true' : undefined"
    :aria-label="isFullscreen ? t('imageViewer.label') : undefined"
  >
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <ViewModeToggle v-model="viewMode" :show-diff="hasDiff" />

      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
        <span
          v-if="mismatchPercent"
          :data-testid="TEST_ID.mismatchPercent"
          class="text-xs text-muted-foreground tabular-nums"
        >
          {{ mismatchPercent }}
        </span>

        <div
          class="flex items-center gap-1"
          role="group"
          :aria-label="t('imageViewer.zoomControls')"
        >
          <button
            :data-testid="TEST_ID.zoomOut"
            :aria-label="t('imageViewer.zoomOut')"
            :class="
              cn(
                controlClass,
                'hover:bg-muted text-muted-foreground disabled:opacity-30',
              )
            "
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
              aria-hidden="true"
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
            :aria-label="t('imageViewer.zoomIn')"
            :class="
              cn(
                controlClass,
                'hover:bg-muted text-muted-foreground disabled:opacity-30',
              )
            "
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
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            :data-testid="TEST_ID.zoomReset"
            :aria-label="t('imageViewer.resetZoom')"
            :class="cn(controlClass, 'hover:bg-muted text-muted-foreground')"
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
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>

        <div
          class="flex items-center gap-1 border-l border-border pl-1"
          role="group"
          :aria-label="t('imageViewer.viewControls')"
        >
          <button
            :data-testid="TEST_ID.fitToggle"
            :aria-label="t('imageViewer.fit')"
            :aria-pressed="fitToScreen"
            :class="
              cn(
                controlClass,
                fitToScreen
                  ? 'bg-muted text-foreground'
                  : 'hover:bg-muted text-muted-foreground',
              )
            "
            @click="enableFit"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button
            :data-testid="TEST_ID.actualSizeToggle"
            :aria-pressed="isActualSize"
            :class="
              cn(
                controlClass,
                isActualSize
                  ? 'bg-muted text-foreground'
                  : 'hover:bg-muted text-muted-foreground',
              )
            "
            @click="enableActualSize"
          >
            <span class="text-xs font-semibold leading-none">1:1</span>
            <span class="sr-only">{{ t("imageViewer.actual") }}</span>
          </button>
          <button
            ref="fullscreenToggle"
            :data-testid="TEST_ID.fullscreenToggle"
            :aria-label="t('imageViewer.fullscreen')"
            :aria-pressed="isFullscreen"
            :class="
              cn(
                controlClass,
                isFullscreen
                  ? 'bg-muted text-foreground'
                  : 'hover:bg-muted text-muted-foreground',
              )
            "
            @click="toggleFullscreen"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            </svg>
          </button>
          <button
            v-if="isFullscreen"
            ref="closeButton"
            :data-testid="TEST_ID.fullscreenClose"
            :aria-label="t('imageViewer.closeFullscreen')"
            :class="cn(controlClass, 'hover:bg-muted text-muted-foreground')"
            @click="closeFullscreen"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="grid gap-4" :class="gridClass">
      <template v-if="isLayered">
        <div
          :data-testid="layeredTestId"
          class="rounded-3xl border border-border bg-card shadow p-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div
              class="flex items-center gap-2 text-sm font-medium text-foreground/80"
            >
              <span class="w-3 h-3 rounded-full" :class="layeredDotClass" />
              <span>{{ layeredLabel }}</span>
            </div>
            <label
              v-if="viewMode === 'overlay'"
              class="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span>{{ t("imageViewer.opacity") }}</span>
              <input
                v-model.number="overlayOpacity"
                :data-testid="TEST_ID.overlayOpacity"
                type="range"
                min="0"
                max="100"
                step="1"
                class="w-24 accent-primary"
              />
              <span class="w-8 text-right tabular-nums" aria-hidden="true"
                >{{ overlayOpacity }}%</span
              >
            </label>
            <p v-else class="text-xs text-muted-foreground">
              Drag the handle or use arrow keys
            </p>
          </div>

          <div
            :data-testid="`${layeredTestId}-zoom`"
            class="relative overflow-auto max-h-[70vh] bg-image-canvas rounded-2xl"
            @wheel="wheelZoom"
          >
            <div
              v-if="isFailed('baseline')"
              class="flex flex-col items-center justify-center gap-2 min-h-[300px] p-4 text-center"
            >
              <span class="text-sm text-status-danger">{{
                t("imageViewer.unavailable")
              }}</span>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`${layeredTestId}-retry`"
                @click="retry('baseline')"
              >
                {{ t("imageViewer.retry") }}
              </Button>
            </div>
            <div
              v-else
              ref="layeredStage"
              class="relative"
              :class="fitToScreen ? 'w-full' : 'inline-block'"
              :style="contentTransform"
              @mousedown="
                viewMode === 'wipe' ? beginWipeDrag($event) : beginPan($event)
              "
              @dblclick="doubleClickZoom"
            >
              <img
                :key="imageKey('baseline')"
                :src="baselineUrl"
                :alt="t('detail.baselineAlt')"
                :width="sizes.baseline?.width"
                :height="sizes.baseline?.height"
                decoding="async"
                draggable="false"
                :class="cn(imageFitClass, fitToScreen && 'w-full max-h-[70vh]')"
                @load="onImageLoad('baseline', $event)"
                @error="markFailed('baseline')"
              />
              <img
                v-if="candidateUrl && !isFailed('candidate')"
                :key="imageKey('candidate')"
                :src="candidateUrl"
                :alt="t('detail.candidateAlt')"
                decoding="async"
                draggable="false"
                class="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                :style="layeredCandidateStyle"
                @load="onImageLoad('candidate', $event)"
                @error="markFailed('candidate')"
              />
              <div
                v-if="viewMode === 'wipe'"
                role="slider"
                :data-testid="TEST_ID.wipeHandle"
                :aria-valuenow="wipePosition"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="t('imageViewer.wipe')"
                tabindex="0"
                class="absolute inset-y-0 w-1 -translate-x-1/2 cursor-ew-resize bg-foreground shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :style="{ left: `${wipePosition}%` }"
                @keydown="onWipeKeydown"
                @mousedown.stop="beginWipeDrag"
              />
            </div>
          </div>
        </div>
      </template>

      <template v-else>
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
            :data-testid="`${panel.testId}-zoom`"
            class="min-h-[300px] max-h-[70vh] overflow-auto bg-image-canvas rounded-2xl"
            @wheel="wheelZoom"
          >
            <div
              v-if="isFailed(panel.key)"
              class="flex flex-col items-center justify-center gap-2 min-h-[300px] p-4 text-center"
            >
              <span class="text-sm text-status-danger">{{
                t("imageViewer.unavailable")
              }}</span>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`${panel.testId}-retry`"
                @click="retry(panel.key)"
              >
                {{ t("imageViewer.retry") }}
              </Button>
            </div>
            <div
              v-else
              class="flex items-center justify-center min-h-[300px] w-full"
              :style="contentTransform"
              @mousedown="beginPan"
              @dblclick="doubleClickZoom"
            >
              <img
                :key="imageKey(panel.key)"
                :src="panel.url"
                :alt="panel.label"
                :width="sizes[panel.key]?.width"
                :height="sizes[panel.key]?.height"
                loading="lazy"
                decoding="async"
                draggable="false"
                :class="imageFitClass"
                @load="onImageLoad(panel.key, $event)"
                @error="markFailed(panel.key)"
              />
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

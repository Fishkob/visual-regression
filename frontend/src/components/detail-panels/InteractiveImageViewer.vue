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
import ChangedRegionBoxes from "@/components/detail-panels/ChangedRegionBoxes.vue";
import type { ChangedRegion } from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";
import { cn } from "@/lib/utils";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    baselineUrl?: string;
    candidateUrl?: string;
    diffUrl?: string;
    mismatchPixelCount?: number;
    regions?: ChangedRegion[];
  }>(),
  {
    baselineUrl: undefined,
    candidateUrl: undefined,
    diffUrl: undefined,
    mismatchPixelCount: undefined,
    regions: undefined,
  },
);

const emit = defineEmits<{
  "image-size": [size: { width: number; height: number }];
}>();

const ZOOM_STEPS = [50, 75, 100, 150, 200];
// v2: the default depends on whether the comparison carries changed regions,
// so a mode stored under the old key cannot be the fallback any more.
const MODE_STORAGE_KEY = "vrt:viewer:mode:v2";
const ZOOM_STORAGE_KEY = "vrt:viewer:zoom";
const AUTOFOCUS_STORAGE_KEY = "vrt:viewer:autofocus";
const PAN_STEP = 40;
const WIPE_STEP = 2;

const VIEW_MODES: ViewMode[] = [
  "highlight",
  "side-by-side",
  "diff-only",
  "overlay",
  "wipe",
  "blink",
];

const controlClass =
  "p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const readStoredMode = (): ViewMode | null => {
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "string") return null;
    return (VIEW_MODES as readonly string[]).includes(value)
      ? (value as ViewMode)
      : null;
  } catch {
    return null;
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

const hasRegions = computed(() => (props.regions?.length ?? 0) > 0);
// With changed regions the comparison opens on the marked diff: the place to
// look is the news, and side-by-side stays one click away.
const storedMode = readStoredMode();
const viewMode = ref<ViewMode>(
  storedMode && (storedMode !== "highlight" || hasRegions.value)
    ? storedMode
    : hasRegions.value
      ? "highlight"
      : "side-by-side",
);
const zoomLevel = ref(readStoredZoom());
const fitToScreen = ref(zoomLevel.value === 100);
const pan = reactive({ x: 0, y: 0 });

const readStoredFlag = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

// Off by default: landing on a zoomed crop hides where you are on the page. On,
// it saves the click that finds the change in the first place.
const autoFocus = ref(readStoredFlag(AUTOFOCUS_STORAGE_KEY));

watch(autoFocus, (value) => {
  try {
    window.localStorage.setItem(AUTOFOCUS_STORAGE_KEY, String(value));
  } catch {
    // Persistence is optional: storage may be unavailable or full.
  }
});

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
    emit("image-size", sizes[key]);
    if (autoFocus.value && hasRegions.value && activeRegion.value === null) {
      void nextTick(() => focusRegion(0));
    }
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

const isModeAvailable = (mode: ViewMode) => {
  if (mode === "side-by-side") return true;
  if (mode === "blink") return Boolean(props.baselineUrl && props.candidateUrl);
  return hasDiff.value;
};

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

  if (event.key >= "1" && event.key <= String(VIEW_MODES.length)) {
    const mode = VIEW_MODES[Number(event.key) - 1];
    if (isModeAvailable(mode)) {
      event.preventDefault();
      viewMode.value = mode;
    }
    return;
  }

  if (event.key === "n" || event.key === "p") {
    const total = props.regions?.length ?? 0;
    if (total === 0) return;
    event.preventDefault();
    const current = activeRegion.value ?? -1;
    const next =
      event.key === "n"
        ? Math.min(total - 1, current + 1)
        : Math.max(0, current <= 0 ? total - 1 : current - 1);
    focusRegion(next);
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

const activeRegion = ref<number | null>(null);
const root = ref<HTMLElement | null>(null);

const activeRegionLabel = computed(() => {
  const total = props.regions?.length ?? 0;
  if (activeRegion.value === null || total === 0) return null;
  return t("imageViewer.regionOf", {
    index: activeRegion.value + 1,
    total,
  });
});

function regionStage(): HTMLElement | null {
  return (
    root.value?.querySelector<HTMLElement>('[data-testid$="-zoom"]') ?? null
  );
}

// Jumping to a region means two things: a zoom that makes the area fill the
// stage, and a pan that puts it in the middle. The zoom is picked from the fixed
// steps (so the zoom buttons stay in sync); the pan is measured after the zoom
// has rendered, which keeps the correction independent of how the stage centres
// its image.
function focusRegion(index: number): void {
  const region = props.regions?.[index];
  if (!region) return;
  // The label and the rail highlight must follow the pick even before the image
  // has reported its size; only the zoom needs to know how big it is.
  activeRegion.value = index;
  const size = sizes.baseline ?? sizes.candidate;
  if (!size) return;
  if (!isStage.value && viewMode.value !== "diff-only") {
    viewMode.value = hasDiff.value ? "highlight" : "side-by-side";
  }
  const stage = regionStage();
  const stageWidth = stage?.clientWidth || Math.min(size.width, 1024);
  const stageHeight = stage?.clientHeight || Math.min(size.height, 720);
  const target =
    Math.min(
      stageWidth / (region.width * 1.25),
      stageHeight / (region.height * 1.25),
    ) * 100;
  const step =
    [...ZOOM_STEPS].reverse().find((value) => value <= target) ?? ZOOM_STEPS[0];
  zoomLevel.value = step;
  fitToScreen.value = false;

  void nextTick(() => {
    centreOnImagePoint(
      region.x + region.width / 2,
      region.y + region.height / 2,
    );
  });
}

// Pan correction by measurement: the stage centres its image and scales it about
// the container's top-left, so the arithmetic is not worth repeating — read where
// the image actually is and move it so the point sits in the middle.
function centreOnImagePoint(imageX: number, imageY: number): void {
  const stage = regionStage();
  const image = stage?.querySelector("img") ?? null;
  const size = sizes.candidate ?? sizes.baseline;
  if (!stage || !image || !size) return;
  const box = image.getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  if (box.width <= 0 || stageBox.width <= 0) return;
  pan.x +=
    stageBox.left +
    stageBox.width / 2 -
    (box.left + (imageX / size.width) * box.width);
  pan.y +=
    stageBox.top +
    stageBox.height / 2 -
    (box.top + (imageY / size.height) * box.height);
  scheduleMinimap();
}

const minimap = ref<HTMLElement | null>(null);
const minimapVisible = ref(false);
const minimapRect = ref<{
  x: number;
  y: number;
  width: number;
  height: number;
}>({ x: 0, y: 0, width: 0, height: 0 });

const minimapRegions = computed(() => {
  const size = sizes.candidate ?? sizes.baseline;
  if (!size) return [];
  return (props.regions ?? []).map((region) => ({
    left: `${(region.x / size.width) * 100}%`,
    top: `${(region.y / size.height) * 100}%`,
    width: `${(region.width / size.width) * 100}%`,
    height: `${(region.height / size.height) * 100}%`,
  }));
});

const minimapViewStyle = computed(() => {
  const size = sizes.candidate ?? sizes.baseline;
  const rect = minimapRect.value;
  if (!size) return {};
  return {
    left: `${(rect.x / size.width) * 100}%`,
    top: `${(rect.y / size.height) * 100}%`,
    width: `${(rect.width / size.width) * 100}%`,
    height: `${(rect.height / size.height) * 100}%`,
  };
});

let minimapFrame = 0;
function scheduleMinimap(): void {
  if (typeof window === "undefined") return;
  if (minimapFrame) return;
  minimapFrame = window.requestAnimationFrame(() => {
    minimapFrame = 0;
    updateMinimap();
  });
}

// The minimap answers "where am I" only while the stage shows a crop; at fit it
// would be a second copy of the picture.
function updateMinimap(): void {
  const stage = regionStage();
  const image = stage?.querySelector("img") ?? null;
  const size = sizes.candidate ?? sizes.baseline;
  if (!stage || !image || !size) {
    minimapVisible.value = false;
    return;
  }
  const box = image.getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0 || stageBox.width <= 0) {
    minimapVisible.value = false;
    return;
  }
  const scale = size.width / box.width;
  const x = Math.max(0, (stageBox.left - box.left) * scale);
  const y = Math.max(0, (stageBox.top - box.top) * scale);
  const width = Math.max(0, Math.min(size.width - x, stageBox.width * scale));
  const height = Math.max(
    0,
    Math.min(size.height - y, stageBox.height * scale),
  );
  const coversWholeImage =
    x <= 1 && y <= 1 && width >= size.width - 2 && height >= size.height - 2;
  minimapRect.value = { x, y, width, height };
  // At fit the stage is the overview: a thumbnail of the whole picture beside it
  // would be a second, smaller copy of what is already on screen.
  minimapVisible.value = !coversWholeImage && !fitToScreen.value;
}

function minimapJump(event: MouseEvent): void {
  const el = minimap.value;
  const size = sizes.candidate ?? sizes.baseline;
  if (!el || !size) return;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const imageX = ((event.clientX - rect.left) / rect.width) * size.width;
  const imageY = ((event.clientY - rect.top) / rect.height) * size.height;
  centreOnImagePoint(imageX, imageY);
}

watch([zoomLevel, fitToScreen, () => pan.x, () => pan.y], () =>
  scheduleMinimap(),
);
watch(
  () => [sizes.candidate, sizes.baseline, viewMode.value],
  () => nextTick(scheduleMinimap),
);

function selectRegion(index: number): void {
  focusRegion(index);
}

defineExpose({ focusRegion });

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

const isBlink = computed(() => viewMode.value === "blink");

const panels = computed(() => {
  if (isStage.value) return [];
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

const isHighlight = computed(() => viewMode.value === "highlight");

const isStage = computed(
  () => viewMode.value === "highlight" || viewMode.value === "blink",
);

const stageLabel = computed(() =>
  isBlink.value ? t("viewMode.blink") : t("viewMode.highlight"),
);

const showRegionBoxes = computed(
  () => hasRegions.value && viewMode.value !== "diff-only",
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
  if (isStage.value) return "grid-cols-1";
  if (viewMode.value === "side-by-side") {
    return hasDiff.value ? "grid-cols-3" : "grid-cols-2";
  }
  if (viewMode.value === "diff-only") return "grid-cols-1 mx-auto max-w-5xl";
  return "grid-cols-1";
});

// `--s` lets the region boxes keep a hairline border while the image grows.
const contentTransform = computed<Record<string, string>>(() => ({
  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel.value / 100})`,
  transformOrigin: "top left",
  "--s": String(zoomLevel.value / 100),
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
    ref="root"
    :role="isFullscreen ? 'dialog' : undefined"
    :aria-modal="isFullscreen ? 'true' : undefined"
    :aria-label="isFullscreen ? t('imageViewer.label') : undefined"
  >
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div class="flex flex-wrap items-center gap-3">
        <ViewModeToggle
          v-model="viewMode"
          :show-diff="hasDiff"
          :show-highlight="hasDiff && hasRegions"
          :show-blink="Boolean(baselineUrl && candidateUrl)"
        />
        <label
          v-if="hasRegions"
          class="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <input
            v-model="autoFocus"
            type="checkbox"
            :data-testid="TEST_ID.autoFocusToggle"
            class="h-3.5 w-3.5 accent-primary"
          />
          {{ t("imageViewer.autoFocus") }}
        </label>
      </div>

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
      <template v-if="isStage">
        <div
          :data-testid="TEST_ID.panelHighlight"
          class="relative rounded-3xl border border-border bg-card shadow p-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div
              class="flex items-center gap-2 text-sm font-medium text-foreground/80"
            >
              <span
                class="w-3 h-3 rounded-full"
                :class="isBlink ? 'bg-status-info' : 'bg-status-danger'"
              />
              <span>{{ stageLabel }}</span>
            </div>
            <span
              v-if="activeRegionLabel"
              :data-testid="TEST_ID.changedRegionFocus"
              class="text-xs text-muted-foreground tabular-nums"
              >{{ activeRegionLabel }}</span
            >
          </div>

          <div
            :data-testid="`${TEST_ID.panelHighlight}-zoom`"
            class="relative min-h-[300px] max-h-[70vh] overflow-auto bg-image-canvas rounded-2xl"
            @wheel="wheelZoom"
          >
            <div
              v-if="isFailed('candidate')"
              class="flex flex-col items-center justify-center gap-2 min-h-[300px] p-4 text-center"
            >
              <span class="text-sm text-status-danger">{{
                t("imageViewer.unavailable")
              }}</span>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`${TEST_ID.panelHighlight}-retry`"
                @click="retry('candidate')"
              >
                {{ t("imageViewer.retry") }}
              </Button>
            </div>
            <div
              v-else
              class="relative"
              :class="fitToScreen ? 'w-full' : 'inline-block'"
              :style="contentTransform"
              @mousedown="beginPan"
              @dblclick="doubleClickZoom"
            >
              <img
                v-if="isBlink"
                :key="imageKey('baseline')"
                :src="baselineUrl"
                :alt="t('detail.baselineAlt')"
                decoding="async"
                draggable="false"
                :class="cn(imageFitClass, fitToScreen && 'w-full max-h-[70vh]')"
                @load="onImageLoad('baseline', $event)"
                @error="markFailed('baseline')"
              />
              <img
                :key="imageKey('candidate')"
                :src="candidateUrl"
                :alt="t('detail.candidateAlt')"
                decoding="async"
                draggable="false"
                :class="
                  cn(
                    imageFitClass,
                    fitToScreen && 'w-full max-h-[70vh]',
                    isBlink &&
                      'blink-candidate pointer-events-none absolute inset-0 h-full w-full object-contain',
                  )
                "
                @load="onImageLoad('candidate', $event)"
                @error="markFailed('candidate')"
              />
              <img
                v-if="isHighlight && diffUrl"
                :src="diffUrl"
                alt=""
                aria-hidden="true"
                decoding="async"
                draggable="false"
                class="pointer-events-none absolute inset-0 h-full w-full select-none object-contain opacity-30"
              />
              <ChangedRegionBoxes
                v-if="showRegionBoxes && sizes.candidate"
                :regions="regions ?? []"
                :image-width="sizes.candidate.width"
                :image-height="sizes.candidate.height"
                :active-index="activeRegion"
                @select="selectRegion"
              />
            </div>
          </div>

          <button
            v-if="minimapVisible && candidateUrl"
            ref="minimap"
            type="button"
            :data-testid="TEST_ID.minimap"
            :aria-label="t('imageViewer.minimap')"
            class="absolute bottom-3 right-3 z-10 w-28 overflow-hidden rounded-lg border border-border bg-card shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="minimapJump"
          >
            <img
              :src="candidateUrl"
              alt=""
              aria-hidden="true"
              class="block w-full select-none opacity-90"
            />
            <span
              v-for="(style, index) in minimapRegions"
              :key="index"
              aria-hidden="true"
              class="absolute border border-status-danger bg-destructive/30"
              :style="style"
            />
            <span
              aria-hidden="true"
              class="pointer-events-none absolute border border-foreground bg-background/20"
              :style="minimapViewStyle"
            />
          </button>
        </div>
      </template>

      <template v-else-if="isLayered">
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
              <span class="relative inline-block max-w-full">
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
                <ChangedRegionBoxes
                  v-if="showRegionBoxes && sizes[panel.key]"
                  :regions="regions ?? []"
                  :image-width="sizes[panel.key].width"
                  :image-height="sizes[panel.key].height"
                  :active-index="activeRegion"
                  @select="selectRegion"
                />
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.blink-candidate {
  animation: viewer-blink 1.1s steps(1, end) infinite;
}

@keyframes viewer-blink {
  0%,
  45% {
    opacity: 0;
  }
  55%,
  100% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .blink-candidate {
    animation: none;
    opacity: 0.5;
  }
}
</style>

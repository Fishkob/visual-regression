<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowUpRight } from "@lucide/vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resolveVariantPair,
  variantKey,
  type VariantCompareMode,
} from "@/domains/visual-test/variant-pair";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";

// The browsers of one viewport, compared against each other. Side by side shows
// every browser at the same size (the section already fixes the resolution, so
// the pictures are directly comparable); the layered modes put one browser on
// top of another, which is what makes a rendering difference jump out. The view
// mode itself is picked once for the whole page, so only the pair is local.
const props = defineProps<{
  variants: VariantSummary[];
  aspectRatio: string;
  mode: VariantCompareMode;
  // How many pictures may share a row. The overview drops this to two in
  // fullscreen: with the shell gone, three columns would still be small pictures
  // while two are a size worth looking at.
  maxColumns?: number;
}>();

const emit = defineEmits<{
  open: [variant: VariantSummary];
}>();

const { t } = useI18n();

const WIPE_STEP = 2;
const wipePosition = ref(50);
const wipeDragging = ref(false);
const overlayOpacity = ref(50);
const stage = ref<HTMLElement | null>(null);
const referenceKey = ref<string>();
const targetKey = ref<string>();

const pair = computed(() =>
  resolveVariantPair(props.variants, referenceKey.value, targetKey.value),
);
const reference = computed(() => pair.value?.reference);
const target = computed(() => pair.value?.target);
const canCompare = computed(() => Boolean(target.value));
// A single-browser viewport has nothing to overlay: it keeps the plain grid, and
// a stored layered mode must not turn the section into a frame without a target.
const layered = computed(
  () => canCompare.value && props.mode !== "side-by-side",
);

const currentReferenceKey = computed(() =>
  reference.value ? variantKey(reference.value) : undefined,
);
const currentTargetKey = computed(() =>
  target.value ? variantKey(target.value) : undefined,
);

// Swapping sides instead of rejecting the choice: picking the browser that is
// currently the comparison target as the new reference is a natural "turn it
// around" gesture, and the pair must stay two distinct variants.
function selectReference(key: string) {
  if (key === currentTargetKey.value)
    targetKey.value = currentReferenceKey.value;
  referenceKey.value = key;
  wipePosition.value = 50;
}

function selectTarget(key: string) {
  if (key === currentReferenceKey.value)
    referenceKey.value = currentTargetKey.value;
  targetKey.value = key;
  wipePosition.value = 50;
}

// One shared rule for the two layered pictures: the target is the layer that
// moves (fade, clip or blink), the reference stays the ground.
const targetStyle = computed(() => ({
  opacity: props.mode === "overlay" ? overlayOpacity.value / 100 : 1,
  clipPath:
    props.mode === "wipe" ? `inset(0 0 0 ${wipePosition.value}%)` : "none",
}));

function updateWipeFromClientX(clientX: number) {
  const element = stage.value;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) return;
  const percent = ((clientX - rect.left) / rect.width) * 100;
  wipePosition.value = Math.round(Math.min(100, Math.max(0, percent)));
}

function beginWipeDrag(event: MouseEvent) {
  if (event.button !== 0) return;
  wipeDragging.value = true;
  updateWipeFromClientX(event.clientX);
}

function onWipeKeydown(event: KeyboardEvent) {
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
}

function onWindowMouseMove(event: MouseEvent) {
  if (wipeDragging.value) updateWipeFromClientX(event.clientX);
}

function onWindowMouseUp() {
  wipeDragging.value = false;
}

onMounted(() => {
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);
});

onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onWindowMouseMove);
  window.removeEventListener("mouseup", onWindowMouseUp);
});

// A refetch that drops or adds a browser must not leave the pair pointing at a
// vanished variant: the resolver falls back, and the stored keys follow it.
watch(
  () => props.variants.map(variantKey).join("\n"),
  () => {
    referenceKey.value = currentReferenceKey.value;
    targetKey.value = currentTargetKey.value;
  },
);

function labelOf(variant: VariantSummary): string {
  return [variant.browser, variant.environment].filter(Boolean).join(", ");
}

// The same browser can be captured in several environments. Then the name alone
// would label two entries identically, so the environment joins the visible
// label; otherwise it stays in the title/aria text and the label stays short.
const multipleEnvironments = computed(
  () => new Set(props.variants.map((variant) => variant.environment)).size > 1,
);

function browserLabel(variant: VariantSummary): string {
  return multipleEnvironments.value ? labelOf(variant) : variant.browser;
}

// At most three panes per row: a fifth browser would squeeze every picture to a
// thumbnail, and the comparison is about seeing the rendering, not the count.
// Wrapped rows keep equal widths, so the pictures stay comparable.
const MAX_COLUMNS = 3;
const gridStyle = computed<Record<string, string>>(() => {
  const columns = Math.min(
    props.variants.length,
    props.maxColumns ?? MAX_COLUMNS,
  );
  return { "--variant-columns": `repeat(${columns}, minmax(0, 1fr))` };
});
</script>

<template>
  <div class="space-y-3">
    <div v-if="layered" class="flex flex-wrap items-center gap-3">
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        <span class="flex items-center gap-1.5">
          <span>{{ t("overview.reference") }}</span>
          <Select
            :model-value="currentReferenceKey ?? ''"
            @update:model-value="selectReference(String($event))"
          >
            <SelectTrigger
              class="h-8 w-auto min-w-28 text-xs"
              :data-testid="TEST_ID.testOverviewReference"
              :aria-label="t('overview.referenceLabel')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="variant in variants"
                :key="variantKey(variant)"
                :value="variantKey(variant)"
              >
                {{ browserLabel(variant) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </span>

        <span class="flex items-center gap-1.5">
          <span>{{ t("overview.compareWith") }}</span>
          <Select
            :model-value="currentTargetKey ?? ''"
            @update:model-value="selectTarget(String($event))"
          >
            <SelectTrigger
              class="h-8 w-auto min-w-28 text-xs"
              :data-testid="TEST_ID.testOverviewTarget"
              :aria-label="t('overview.compareWithLabel')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="variant in variants"
                :key="variantKey(variant)"
                :value="variantKey(variant)"
                :disabled="variantKey(variant) === currentReferenceKey"
              >
                {{ browserLabel(variant) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </span>
      </div>
    </div>

    <!-- Side by side: every browser of this viewport, labelled, same frame. -->
    <ul
      v-if="!layered"
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:[grid-template-columns:var(--variant-columns)]"
      :style="gridStyle"
    >
      <li
        v-for="variant in variants"
        :key="variantKey(variant)"
        class="min-w-0"
      >
        <button
          type="button"
          class="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="t('overview.openVariant', { variant: labelOf(variant) })"
          :data-testid="TEST_ID.testOverviewCard"
          :data-variant-key="variantKey(variant)"
          @click="emit('open', variant)"
        >
          <span
            class="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
          >
            <span class="truncate text-xs font-semibold">
              {{ variant.browser }}
            </span>
            <span
              class="flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <span v-if="variant.environment" class="truncate">
                {{ variant.environment }}
              </span>
              <ArrowUpRight
                class="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden="true"
              />
            </span>
          </span>
          <span
            class="block w-full overflow-hidden bg-image-canvas"
            :style="{ aspectRatio }"
          >
            <img
              v-if="variant.baselineUrl"
              :src="variant.baselineUrl"
              :alt="labelOf(variant)"
              loading="lazy"
              class="block h-full w-full select-none object-cover object-top"
            />
            <span
              v-else
              class="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground"
            >
              {{ t("overview.noBaseline") }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <!-- Layered: one frame, the target over the reference. -->
    <div
      v-else
      class="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      :data-testid="TEST_ID.testOverviewStage"
    >
      <div
        class="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs"
      >
        <span class="flex min-w-0 items-center gap-1">
          <span
            class="text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {{ t("overview.reference") }}
          </span>
          <button
            v-if="reference"
            type="button"
            class="group flex min-w-0 items-center gap-1 font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="
              t('overview.openVariant', { variant: labelOf(reference) })
            "
            :data-testid="TEST_ID.testOverviewReferencePane"
            @click="emit('open', reference)"
          >
            <span class="truncate">{{ browserLabel(reference) }}</span>
            <ArrowUpRight
              class="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100"
              aria-hidden="true"
            />
          </button>
        </span>
        <span class="flex min-w-0 items-center gap-1">
          <span
            class="text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {{ t("overview.compareWith") }}
          </span>
          <button
            v-if="target"
            type="button"
            class="group flex min-w-0 items-center gap-1 font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="
              t('overview.openVariant', { variant: labelOf(target) })
            "
            :data-testid="TEST_ID.testOverviewTargetPane"
            @click="emit('open', target)"
          >
            <span class="truncate">{{ browserLabel(target) }}</span>
            <ArrowUpRight
              class="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100"
              aria-hidden="true"
            />
          </button>
        </span>
      </div>

      <div
        ref="stage"
        class="relative w-full bg-image-canvas"
        :style="{ aspectRatio }"
        :class="
          mode === 'wipe' ? 'cursor-ew-resize select-none' : 'select-none'
        "
        @mousedown="mode === 'wipe' && beginWipeDrag($event)"
      >
        <img
          v-if="reference?.baselineUrl"
          :src="reference.baselineUrl"
          :alt="reference ? labelOf(reference) : ''"
          class="absolute inset-0 h-full w-full select-none object-cover object-top"
        />
        <img
          v-if="target?.baselineUrl"
          :src="target.baselineUrl"
          :alt="labelOf(target)"
          class="absolute inset-0 h-full w-full select-none object-cover object-top"
          :class="mode === 'blink' && 'variant-blink'"
          :style="targetStyle"
        />
        <div
          v-if="mode === 'wipe'"
          role="slider"
          :data-testid="TEST_ID.testOverviewWipeHandle"
          :aria-valuenow="wipePosition"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('viewMode.wipe')"
          tabindex="0"
          class="absolute inset-y-0 w-1 -translate-x-1/2 cursor-ew-resize bg-foreground shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :style="{ left: `${wipePosition}%` }"
          @keydown="onWipeKeydown"
          @mousedown.stop="beginWipeDrag"
        />
      </div>

      <div
        class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground"
      >
        <span v-if="mode === 'wipe'">{{ t("overview.wipeHint") }}</span>
        <span v-else-if="mode === 'blink'">{{ t("overview.blinkHint") }}</span>

        <label v-if="mode === 'overlay'" class="flex items-center gap-2">
          <span>{{ t("overview.opacity") }}</span>
          <input
            v-model.number="overlayOpacity"
            :data-testid="TEST_ID.testOverviewOverlayOpacity"
            type="range"
            min="0"
            max="100"
            step="1"
            class="w-24 accent-primary"
          />
          <span class="w-8 text-right tabular-nums" aria-hidden="true">
            {{ overlayOpacity }}%
          </span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.variant-blink {
  animation: variant-blink 1.1s steps(1, end) infinite;
}

@keyframes variant-blink {
  0%,
  45% {
    opacity: 0;
  }
  50%,
  100% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .variant-blink {
    animation: none;
    opacity: 0.5;
  }
}
</style>

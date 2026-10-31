<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    variants: VariantSummary[];
    active?: {
      viewport?: string;
      browser?: string;
      environment?: string;
    };
  }>(),
  { active: undefined },
);

defineEmits<{ select: [variant: VariantSummary] }>();

const { t } = useI18n();

// The sibling variants answer the reviewer's next question — "is this only here,
// or on every viewport too?" — without leaving the comparison. A single variant
// has no sibling, so the strip stays out of the page.
const visible = computed(() =>
  props.variants.length > 1 ? props.variants : [],
);

function keyOf(variant: {
  viewport: string;
  browser: string;
  environment: string;
}): string {
  return `${variant.viewport}|${variant.browser}|${variant.environment}`;
}

function isActive(variant: VariantSummary): boolean {
  if (!props.active?.viewport) return false;
  return (
    variant.viewport === props.active.viewport &&
    variant.browser === (props.active.browser ?? variant.browser) &&
    variant.environment === (props.active.environment ?? variant.environment)
  );
}

// Same status vocabulary as everywhere else: pending review is the amber one, a
// pending first baseline is informational, unchanged is green.
function dotClass(status: string): string {
  if (status === "PENDING_APPROVAL") return "bg-status-warning";
  if (status === "UNCHANGED") return "bg-status-success";
  if (status === "PENDING") return "bg-status-info";
  return "bg-status-neutral";
}

function labelOf(variant: VariantSummary): string {
  return [variant.viewport, variant.browser, variant.environment]
    .filter(Boolean)
    .join(", ");
}
</script>

<template>
  <section
    v-if="visible.length > 0"
    class="mt-3"
    :data-testid="TEST_ID.variantStrip"
    :aria-label="t('imageViewer.otherVariants')"
  >
    <h2
      class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {{ t("imageViewer.otherVariants") }}
    </h2>
    <ul class="flex gap-2 overflow-x-auto pb-1">
      <li v-for="variant in visible" :key="keyOf(variant)" class="shrink-0">
        <button
          type="button"
          :data-testid="TEST_ID.variantStripItem"
          :data-variant-key="keyOf(variant)"
          :aria-label="labelOf(variant)"
          :title="labelOf(variant)"
          :aria-current="isActive(variant) ? 'true' : undefined"
          :class="
            cn(
              'flex items-center gap-2 rounded-lg border bg-card p-1 pr-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive(variant)
                ? 'border-foreground'
                : 'border-border hover:border-foreground/40',
            )
          "
          @click="$emit('select', variant)"
        >
          <span class="h-9 w-14 overflow-hidden rounded bg-image-canvas">
            <img
              v-if="variant.baselineUrl"
              :src="variant.baselineUrl"
              :alt="labelOf(variant)"
              loading="lazy"
              class="h-full w-full select-none object-cover object-top"
            />
          </span>
          <span class="flex items-center gap-1.5">
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="dotClass(variant.status)"
              aria-hidden="true"
            />
            <span class="font-mono text-[11px]">{{ variant.viewport }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

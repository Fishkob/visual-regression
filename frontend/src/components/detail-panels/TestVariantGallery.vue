<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { statusLabelFor } from "@/components/StatusBadge";
import { getStatusConfig } from "@/domains/test-status";
import { sortVariantSummaries } from "@/domains/visual-test/variant-order";
import type { VariantSummary } from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  variants: VariantSummary[];
  active?: { viewport?: string; browser?: string; environment?: string };
}>();

const emit = defineEmits<{ select: [variant: VariantSummary] }>();
const { t } = useI18n();

const orderedVariants = computed(() => sortVariantSummaries(props.variants));

const pendingCount = computed(
  () =>
    props.variants.filter((variant) => variant.status === "PENDING_APPROVAL")
      .length,
);

const mismatchFormatter = new Intl.NumberFormat("en-US");

function isActive(variant: VariantSummary): boolean {
  const active = props.active;
  if (!active?.viewport && !active?.browser && !active?.environment) {
    return false;
  }
  return (
    active.viewport === variant.viewport &&
    active.browser === variant.browser &&
    active.environment === variant.environment
  );
}

function variantKey(variant: VariantSummary): string {
  return [variant.viewport, variant.browser, variant.environment].join("|");
}

function thumbnailUrl(variant: VariantSummary): string | undefined {
  return variant.candidateUrl ?? variant.baselineUrl;
}

function metaLabel(variant: VariantSummary): string {
  return [variant.browser, variant.environment].filter(Boolean).join(" · ");
}

function statusLabel(variant: VariantSummary): string {
  return statusLabelFor(variant.status);
}

function accessibleLabel(variant: VariantSummary): string {
  const configuration = [variant.viewport, variant.browser, variant.environment]
    .filter(Boolean)
    .join(", ");
  return `${configuration} — ${statusLabel(variant)}`;
}

function mismatchLabel(variant: VariantSummary): string | undefined {
  if (variant.mismatchPixelCount == null) return undefined;
  return `${mismatchFormatter.format(variant.mismatchPixelCount)} px`;
}
</script>

<template>
  <section
    v-if="variants.length > 0"
    :data-testid="TEST_ID.variantGallery"
    aria-labelledby="variant-gallery-heading"
  >
    <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h2
        id="variant-gallery-heading"
        class="text-sm font-semibold text-foreground"
      >
        {{ t("detail.variantsHeading") }}
        <span class="font-normal text-muted-foreground">
          ({{ variants.length }})
        </span>
      </h2>
      <span
        v-if="pendingCount > 0"
        class="text-xs text-status-warning"
        :data-testid="TEST_ID.variantGalleryPendingCount"
      >
        {{ t("detail.pendingCount", { count: pendingCount }) }}
      </span>
    </div>

    <ul
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      <li
        v-for="variant in orderedVariants"
        :key="variantKey(variant)"
        class="min-w-0"
      >
        <button
          type="button"
          class="group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="
            isActive(variant)
              ? 'border-status-info ring-1 ring-status-info'
              : 'border-border'
          "
          :aria-pressed="isActive(variant)"
          :title="accessibleLabel(variant)"
          :data-testid="TEST_ID.variantGalleryTile"
          :data-variant-key="variantKey(variant)"
          @click="emit('select', variant)"
        >
          <div
            class="relative aspect-[4/3] w-full overflow-hidden bg-image-canvas"
          >
            <img
              v-if="thumbnailUrl(variant)"
              :src="thumbnailUrl(variant)"
              alt=""
              loading="lazy"
              class="h-full w-full object-cover object-top"
            />
            <div
              v-else
              class="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground"
            >
              {{ t("detail.noBaseline") }}
            </div>

            <span
              class="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border bg-background/90 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur"
              :class="getStatusConfig(variant.status).class"
              :data-testid="TEST_ID.variantGalleryStatus"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              {{ statusLabel(variant) }}
            </span>

            <span
              v-if="mismatchLabel(variant)"
              class="absolute bottom-2 right-2 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-status-danger backdrop-blur"
              :data-testid="TEST_ID.variantGalleryMismatch"
            >
              {{ mismatchLabel(variant) }}
            </span>
          </div>

          <span class="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
            <span class="truncate text-xs font-medium text-foreground">
              {{ variant.viewport }}
            </span>
            <span class="truncate text-[11px] text-muted-foreground">
              {{ metaLabel(variant)
              }}<template v-if="variant.baselineInherited">
                · inherited</template
              >
            </span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

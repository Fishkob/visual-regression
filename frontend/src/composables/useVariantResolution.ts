import { computed, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTestVariantsQuery } from "@/composables/useTestVariants";
import {
  hasVariantFilter,
  pickPreferredVariant,
} from "@/domains/visual-test/variant-selection";
import type { VariantParams } from "@/lib/variant-key";

/**
 * Resolves a test-detail link that names no variant to a concrete variant and
 * writes it back into the URL. The details API requires at least one variant
 * coordinate, so without this a search hit or a pasted link either fails with a
 * "filters required" error or (worse) silently opens an arbitrary baseline.
 */
export function useVariantResolution(args: {
  projectName: Ref<string | undefined>;
  testName: Ref<string | undefined>;
  branch: Ref<string | undefined>;
  filters: Ref<VariantParams>;
  // Only resolve once the test kind is known: a missing kind renders the
  // not-found state, and the variants read would be wasted.
  enabled: Ref<boolean>;
}) {
  const route = useRoute();
  const router = useRouter();

  const missingVariantFilter = computed(
    () => !hasVariantFilter(args.filters.value),
  );
  const variantsEnabled = computed(
    () => missingVariantFilter.value && args.enabled.value,
  );

  const query = useTestVariantsQuery(
    args.projectName,
    args.testName,
    args.branch,
    variantsEnabled,
  );

  const variants = computed(() => query.data.value?.variants ?? []);
  const preferredVariant = computed(() => pickPreferredVariant(variants.value));

  watch(
    preferredVariant,
    (variant) => {
      if (!variant || !missingVariantFilter.value) return;
      void router.replace({
        query: {
          ...route.query,
          viewport: variant.viewport,
          browser: variant.browser,
          environment: variant.environment,
        },
      });
    },
    { immediate: true },
  );

  // Still resolving: the variant list is on its way, or the redirect has not
  // updated the route yet. A details view rendered in this window would fire
  // the filter-less request the backend rejects.
  const isResolvingVariant = computed(
    () =>
      missingVariantFilter.value &&
      (query.isLoading.value ||
        (!query.error.value && preferredVariant.value !== undefined)),
  );

  const hasNoVariants = computed(
    () =>
      missingVariantFilter.value &&
      !query.isLoading.value &&
      !query.error.value &&
      variants.value.length === 0,
  );

  // A disabled observer still reports the cached error of its query key. The
  // variants key is shared with the gallery read, so surfacing that error while
  // the URL already names a variant would replace a perfectly healthy details
  // page with "Failed to load test". Only a link that actually needs resolving
  // may report this error.
  const error = computed(() =>
    missingVariantFilter.value ? query.error.value : null,
  );

  return {
    variants,
    preferredVariant,
    isResolvingVariant,
    hasNoVariants,
    error,
    refetch: query.refetch,
  };
}

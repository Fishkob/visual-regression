<template>
  <!-- The same stage the comparison uses: a test without a pending comparison
       is not a 500px thumbnail, it is the picture the branch is judged on. -->
  <div class="rounded-3xl border border-border bg-card p-4 shadow">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div
        class="flex items-center gap-2 text-sm font-medium text-foreground/80"
      >
        <span
          class="h-3 w-3 rounded-full bg-status-success"
          aria-hidden="true"
        />
        <span :data-testid="TEST_ID.baselineOnlyNote">
          {{ t("detail.baselineOnlyNote") }}
        </span>
      </div>
    </div>

    <div class="rounded-2xl bg-image-canvas p-2">
      <img
        :src="baseline.imageUrl"
        :alt="t('detail.baselineAlt')"
        loading="lazy"
        decoding="async"
        class="mx-auto block max-h-[70vh] w-full rounded-xl object-contain"
        :data-testid="TEST_ID.baseImageBlock"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { Screenshot } from "@/domains/visual-test/visual-test.model";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();

defineProps<{
  baseline: Screenshot;
}>();
</script>

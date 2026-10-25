<template>
  <div class="max-w-xl mx-auto space-y-4 text-center">
    <h3
      class="text-sm font-semibold text-muted-foreground"
      :data-testid="TEST_ID.baselineOnlyNote"
    >
      Only baseline available
    </h3>

    <img
      :src="baseline.imageUrl"
      :alt="t('detail.baselineAlt')"
      loading="lazy"
      class="border rounded shadow-lg w-[500px] h-[400px] object-contain mx-auto"
      :data-testid="TEST_ID.baseImageBlock"
    />
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

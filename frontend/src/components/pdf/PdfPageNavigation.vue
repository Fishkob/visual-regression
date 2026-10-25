<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, watch } from "vue";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();

const props = defineProps<{
  currentPage: number;
  pageCount: number;
}>();

const emit = defineEmits<{
  "update:currentPage": [page: number];
}>();

const safePageCount = computed(() => Math.max(props.pageCount, 1));
const displayPage = computed(() =>
  Math.max(1, Math.min(props.currentPage, safePageCount.value)),
);

watch(displayPage, (clamped) => {
  if (clamped !== props.currentPage) {
    emit("update:currentPage", clamped);
  }
});

function prev() {
  const nextVal = displayPage.value - 1;
  if (nextVal >= 1) emit("update:currentPage", nextVal);
}

function next() {
  const nextVal = displayPage.value + 1;
  if (nextVal <= safePageCount.value) emit("update:currentPage", nextVal);
}
</script>

<template>
  <div
    class="flex items-center justify-center gap-4 py-3"
    :data-testid="TEST_ID.pdfPageNavigation"
  >
    <Button
      variant="outline"
      size="sm"
      :disabled="displayPage <= 1"
      @click="prev"
    >
      {{ t("pdf.prev") }}
    </Button>
    <span class="text-sm text-muted-foreground">
      {{ t("pdf.page", { page: displayPage, count: safePageCount }) }}
    </span>
    <Button
      variant="outline"
      size="sm"
      :disabled="displayPage >= safePageCount"
      @click="next"
    >
      {{ t("pdf.next") }}
    </Button>
  </div>
</template>

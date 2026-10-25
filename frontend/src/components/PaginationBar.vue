<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  page: number;
  pageCount: number;
  total: number;
  itemLabel?: string;
}>();

const { t } = useI18n();
const label = computed(() => props.itemLabel ?? t("pagination.items"));

const emit = defineEmits<{
  "update:page": [value: number];
}>();
</script>

<template>
  <nav
    class="flex flex-wrap items-center justify-between gap-3 pt-2"
    :aria-label="t('pagination.label')"
  >
    <Button
      variant="outline"
      size="sm"
      :disabled="page <= 1"
      :data-testid="TEST_ID.paginationPrev"
      @click="emit('update:page', page - 1)"
    >
      {{ t("pagination.previous") }}
    </Button>

    <p
      class="text-sm text-muted-foreground"
      :data-testid="TEST_ID.paginationStatus"
    >
      {{
        t("pagination.status", {
          page,
          pageCount,
          total,
          itemLabel: label,
        })
      }}
    </p>

    <Button
      variant="outline"
      size="sm"
      :disabled="page >= pageCount"
      :data-testid="TEST_ID.paginationNext"
      @click="emit('update:page', page + 1)"
    >
      {{ t("pagination.next") }}
    </Button>
  </nav>
</template>
